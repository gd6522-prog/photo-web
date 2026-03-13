import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");
const AUTOMATION_DIR = path.join(ROOT_DIR, ".automation");
const PROFILE_DIR = path.join(AUTOMATION_DIR, "elogis-profile");
const DOWNLOAD_DIR = path.join(AUTOMATION_DIR, "downloads");
const OUTPUT_DIR = path.join(AUTOMATION_DIR, "output");

const ELOGIS_URL = "https://elogis.emart24.co.kr/";
const TMS_URL_HINT = "etms.emart24.co.kr";
const DOWNLOAD_GROUP_CODE = "D9012343";

function log(message) {
  const stamp = new Date().toLocaleString("ko-KR");
  console.log(`[${stamp}] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .toLowerCase();
}

function normalizeStoreCode(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  return digits.length < 5 ? digits.padStart(5, "0") : digits.slice(0, 5);
}

function findDuplicates(rows) {
  const counts = new Map();
  const duplicates = [];

  for (const row of rows) {
    const code = normalizeStoreCode(row.store_code);
    const nextCount = (counts.get(code) ?? 0) + 1;
    counts.set(code, nextCount);
    if (nextCount === 2) duplicates.push(code);
  }

  return duplicates;
}

function findHeaderIndex(headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(normalizeHeader(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function parseDownloadedExcel(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) fail("다운로드한 엑셀 시트를 읽지 못했습니다.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  if (!Array.isArray(rows) || rows.length < 2) fail("다운로드한 엑셀에 데이터가 없습니다.");

  const headers = rows[0].map((cell) => normalizeHeader(cell));
  const idxCar = findHeaderIndex(headers, ["차량번호", "호차번호"]);
  const idxSeq = findHeaderIndex(headers, ["배송순서", "순번"]);
  const idxCode = findHeaderIndex(headers, ["배송처코드", "점포코드"]);
  const idxName = findHeaderIndex(headers, ["배송처명", "점포명"]);

  if (idxCar < 0 || idxSeq < 0 || idxCode < 0 || idxName < 0) {
    fail("필수 컬럼을 찾지 못했습니다. 차량번호, 배송순서, 배송처코드, 배송처명이 필요합니다.");
  }

  const parsed = [];
  let skippedNoCar = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    if (!Array.isArray(line)) continue;

    const car_no = String(line[idxCar] ?? "").trim();
    const seq_no = Number(String(line[idxSeq] ?? "").trim());
    const store_code = normalizeStoreCode(line[idxCode]);
    const store_name = String(line[idxName] ?? "").trim();

    if (!store_code && !store_name && !car_no) continue;
    if (!store_code) continue;
    if (!car_no) {
      skippedNoCar += 1;
      continue;
    }

    parsed.push({
      store_code,
      store_name,
      car_no,
      seq_no: Number.isFinite(seq_no) ? seq_no : 0,
    });
  }

  const duplicates = findDuplicates(parsed);
  if (duplicates.length > 0) {
    fail(`점포코드 중복이 있어 중단합니다. ${duplicates.slice(0, 20).join(", ")}${duplicates.length > 20 ? " ..." : ""}`);
  }

  for (const row of parsed) {
    if (!row.store_code) fail("점포코드가 비어 있는 행이 있습니다.");
    if (!row.store_name) fail(`점포명이 비어 있습니다. (${row.store_code})`);
    if (!row.car_no) fail(`차량번호가 비어 있습니다. (${row.store_code})`);
    if (!Number.isFinite(row.seq_no) || row.seq_no <= 0) fail(`배송순서가 올바르지 않습니다. (${row.store_code})`);
  }

  return {
    rows: parsed,
    skippedNoCar,
    totalRows: rows.length - 1,
  };
}

async function upsertStoreMaster(env, rows) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) fail(".env.local에 Supabase 설정이 없습니다.");

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const payload = rows.map((row) => ({ ...row, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("store_map").upsert(payload, { onConflict: "store_code" });
  if (error) throw error;

  return payload.length;
}

async function waitForManualLogin(page) {
  await page.goto(ELOGIS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const loginNow = page.getByRole("button", { name: /login now/i });
  if ((await loginNow.count()) === 0) return;

  log("브라우저를 로그인 세션 유지용으로 열어 둡니다. 필요하면 직접 닫아주세요.");
  log("elogis 로그인 후 자동으로 다음 단계로 진행합니다.");

  const timeoutAt = Date.now() + 10 * 60 * 1000;
  while (Date.now() < timeoutAt) {
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});

    if ((await loginNow.count()) === 0) {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1000);
      log("elogis 로그인 완료를 감지했습니다.");
      return;
    }
  }

  fail("elogis 로그인 대기 시간이 초과되었습니다. 다시 실행해주세요.");
}

async function findByTexts(page, texts, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const text of texts) {
      const exactLocator = page.getByText(text, { exact: true });
      if ((await exactLocator.count()) > 0) return exactLocator.first();

      const containsLocator = page.getByText(text, { exact: false });
      if ((await containsLocator.count()) > 0) return containsLocator.first();

      const relaxedPattern = new RegExp(text.replace(/\s+/g, "\\s*"));
      const relaxedLocator = page.getByText(relaxedPattern);
      if ((await relaxedLocator.count()) > 0) return relaxedLocator.first();
    }
    await page.waitForTimeout(500);
  }
  fail(`대상 텍스트를 찾지 못했습니다: ${texts.join(", ")}`);
}

function escapeXpathText(value) {
  const text = String(value);
  if (!text.includes("'")) return `'${text}'`;
  return `concat('${text.split("'").join(`',"'",'`)}')`;
}

async function clickLocatorCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("클릭 좌표를 찾지 못했습니다.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickSidebarText(page, text, timeout = 30000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const target = await page.evaluate((label) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 10 && rect.height > 10;
      };

      const candidates = [];
      for (const element of document.querySelectorAll("body *")) {
        if (!(element instanceof HTMLElement)) continue;
        if (!isVisible(element)) continue;

        const textContent = normalize(element.innerText);
        if (!textContent) continue;
        if (!textContent.startsWith(label)) continue;
        if (textContent.length > label.length + 4) continue;

        const rect = element.getBoundingClientRect();
        if (rect.left > 260) continue;

        const exact = textContent === label ? 0 : 1;
        candidates.push({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          exact,
          left: rect.left,
          top: rect.top,
          len: textContent.length,
        });
      }

      candidates.sort((a, b) => {
        if (a.exact !== b.exact) return a.exact - b.exact;
        if (a.left !== b.left) return a.left - b.left;
        if (a.top !== b.top) return a.top - b.top;
        return a.len - b.len;
      });

      return candidates[0] ?? null;
    }, text);

    if (target) {
      await page.mouse.click(target.x, target.y);
      return;
    }

    await page.waitForTimeout(500);
  }

  fail(`대상 텍스트를 찾지 못했습니다: ${text}`);
}

async function openTmsPage(elogisPage, context) {
  const popupPromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);

  const tmsMenu = await findByTexts(elogisPage, ["차량관리 (TMS)", "차량관리(TMS)"], 30000);
  await tmsMenu.click().catch(() => {});
  await elogisPage.waitForTimeout(800);

  const tmsEntry = await findByTexts(elogisPage, ["TMS 시스템 로그인"], 30000);
  await tmsEntry.click();

  const popup = await popupPromise;
  const tmsPage =
    popup ??
    context.pages().find((candidate) => candidate.url().includes(TMS_URL_HINT)) ??
    elogisPage;

  await tmsPage.waitForLoadState("domcontentloaded");
  await tmsPage.waitForLoadState("networkidle").catch(() => {});
  await tmsPage.waitForTimeout(2500);
  return tmsPage;
}

async function navigateToMappingPage(tmsPage) {
  await clickSidebarText(tmsPage, "계획관리", 30000);
  await tmsPage.waitForTimeout(1000);
  await clickSidebarText(tmsPage, "노선-점포(배송처)매핑", 30000);
  await tmsPage.waitForTimeout(1500);
}

async function chooseDeliveryGroup(tmsPage) {
  const directCodeInput = tmsPage.locator(
    "xpath=(//*[contains(normalize-space(.), '배송그룹')]/ancestor::td[1]/following-sibling::td[1]//input[not(@type='hidden')])[1]"
  ).first();

  if ((await directCodeInput.count()) === 0) {
    fail("배송그룹 입력칸을 찾지 못했습니다.");
  }

  await directCodeInput.waitFor({ state: "visible", timeout: 15000 });
  await directCodeInput.click({ force: true });
  await directCodeInput.fill("");
  await directCodeInput.fill(DOWNLOAD_GROUP_CODE);
  log(`배송그룹 코드 직접 입력: ${DOWNLOAD_GROUP_CODE}`);
}

async function runSearch(tmsPage) {
  const searchButton = await findByTexts(tmsPage, ["조회"], 30000);
  await searchButton.click();
  await tmsPage.waitForTimeout(3000);
}

async function downloadExcel(tmsPage) {
  const downloadPromise = tmsPage.waitForEvent("download", { timeout: 30000 });

  const menuButton = tmsPage.locator(
    "xpath=(//*[contains(@class,'button') or contains(@class,'btn') or contains(@class,'menu')][contains(., '노선해제') or contains(., '엑셀다운로드') or contains(., '엑셀업로드')] | //button[contains(@class,'btn')][last()] | //a[contains(@class,'btn')][last()])[1]"
  ).first();

  if ((await menuButton.count()) > 0) {
    await menuButton.click().catch(async () => {
      await clickLocatorCenter(tmsPage, menuButton);
    });
    await tmsPage.waitForTimeout(800);
  }

  const downloadButton = await findByTexts(tmsPage, ["엑셀다운로드"], 30000);
  await downloadButton.click();

  const download = await downloadPromise;
  const suggestedName = download.suggestedFilename();
  const targetPath = path.join(DOWNLOAD_DIR, `${Date.now()}-${suggestedName}`);
  await download.saveAs(targetPath);
  return targetPath;
}

async function writeJsonSnapshot(rows) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetPath = path.join(OUTPUT_DIR, `store-master-${stamp}.json`);
  await fsp.writeFile(targetPath, JSON.stringify(rows, null, 2), "utf8");
  return targetPath;
}

async function main() {
  await ensureDir(AUTOMATION_DIR);
  await ensureDir(PROFILE_DIR);
  await ensureDir(DOWNLOAD_DIR);
  await ensureDir(OUTPUT_DIR);

  const env = { ...process.env, ...loadEnvFile(ENV_PATH) };

  log("반자동 점포마스터 동기화를 시작합니다.");
  log(`전용 프로필 경로: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: "chrome",
    acceptDownloads: true,
    downloadsPath: DOWNLOAD_DIR,
    viewport: null,
    args: ["--start-maximized"],
  });

  let page = context.pages()[0];
  if (!page) page = await context.newPage();

  await waitForManualLogin(page);
  const elogisPage = context.pages().find((candidate) => candidate.url().includes("elogis.emart24.co.kr")) ?? page;
  const tmsPage = await openTmsPage(elogisPage, context);
  await navigateToMappingPage(tmsPage);
  await chooseDeliveryGroup(tmsPage);
  await runSearch(tmsPage);
  const downloadedFile = await downloadExcel(tmsPage);
  log(`엑셀 다운로드 완료: ${downloadedFile}`);

  const parsed = parseDownloadedExcel(downloadedFile);
  log(`엑셀 파싱 완료: 총 ${parsed.totalRows}행 / 업로드 대상 ${parsed.rows.length}행 / 차량번호 없음 ${parsed.skippedNoCar}행`);

  const snapshot = await writeJsonSnapshot(parsed.rows);
  log(`정제 데이터 저장: ${snapshot}`);

  const count = await upsertStoreMaster(env, parsed.rows);
  log(`store_map 반영 완료: ${count}건`);
  log("동기화가 완료되었습니다.");
}

main().catch((error) => {
  console.error(`\n[실패] ${error?.message ?? error}`);
  process.exitCode = 1;
});
