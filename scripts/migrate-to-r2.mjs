/**
 * Supabase Storage → Cloudflare R2 마이그레이션 스크립트
 * 실행: node scripts/migrate-to-r2.mjs
 *
 * 처리 순서:
 * 1. Supabase 버킷에서 파일 목록 조회
 * 2. 각 파일 다운로드 → R2 업로드
 * 3. DB URL 업데이트 (photos, delivery_photos, hazard_reports, hazard_report_photos, hazard_report_resolutions)
 * 4. 완료 후 Supabase 파일 삭제 (--delete 플래그 있을 때만)
 */

import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// .env.local 파싱
const envVars = {};
try {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    envVars[key] = val;
  }
} catch (e) {
  console.error(".env.local 파일을 읽을 수 없습니다:", e.message);
  process.exit(1);
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = envVars.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = envVars.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = envVars.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = envVars.R2_BUCKET;
const R2_PUBLIC_URL = "https://pub-2ed566ac41944f778e208a0ccea9acd5.r2.dev";

const DELETE_AFTER = process.argv.includes("--delete");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error("환경변수가 누락되었습니다.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// 버킷별 설정
const BUCKETS = ["photos", "delivery_photos", "hazard-reports", "vehicle-data"];

async function listAllFiles(bucket) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list("", { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`${bucket} 목록 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    // 폴더인 경우 재귀
    for (const item of data) {
      if (item.id === null) {
        // 폴더
        const sub = await listFilesInFolder(bucket, item.name);
        all.push(...sub);
      } else {
        all.push({ bucket, key: item.name, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function listFilesInFolder(bucket, prefix, depth = 0) {
  if (depth > 10) return [];
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit, offset });
    if (error) break;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const fullKey = `${prefix}/${item.name}`;
      if (item.id === null) {
        const sub = await listFilesInFolder(bucket, fullKey, depth + 1);
        all.push(...sub);
      } else {
        all.push({ bucket, key: fullKey, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function r2KeyExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrateFile(bucket, supabasePath) {
  const r2Key = `${bucket}/${supabasePath}`;

  // 이미 R2에 있으면 스킵
  if (await r2KeyExists(r2Key)) {
    return { status: "skipped", r2Key };
  }

  // Supabase에서 다운로드
  const { data, error } = await sb.storage.from(bucket).download(supabasePath);
  if (error) throw new Error(`다운로드 실패 [${bucket}/${supabasePath}]: ${error.message}`);

  const arrayBuffer = await data.arrayBuffer();
  const contentType = data.type || "image/jpeg";

  // R2에 업로드
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: Buffer.from(arrayBuffer),
    ContentType: contentType,
  }));

  return { status: "uploaded", r2Key };
}

async function updateDbUrls() {
  console.log("\n=== DB URL 업데이트 시작 ===");

  const oldUrlBase = `${SUPABASE_URL}/storage/v1/object/public`;

  // 1. photos 테이블
  const { data: photos } = await sb.from("photos").select("id, original_path, original_url").like("original_url", `${oldUrlBase}%`);
  if (photos?.length) {
    console.log(`photos 테이블: ${photos.length}건 업데이트`);
    for (const p of photos) {
      const newUrl = `${R2_PUBLIC_URL}/photos/${p.original_path}`;
      await sb.from("photos").update({ original_url: newUrl }).eq("id", p.id);
    }
  }

  // 2. delivery_photos 테이블
  const { data: deliveries } = await sb.from("delivery_photos").select("id, path, public_url").like("public_url", `${oldUrlBase}%`);
  if (deliveries?.length) {
    console.log(`delivery_photos 테이블: ${deliveries.length}건 업데이트`);
    for (const d of deliveries) {
      const newUrl = `${R2_PUBLIC_URL}/delivery_photos/${d.path}`;
      await sb.from("delivery_photos").update({ public_url: newUrl }).eq("id", d.id);
    }
  }

  // 3. hazard_reports 테이블
  const { data: hazards } = await sb.from("hazard_reports").select("id, photo_path, photo_url").like("photo_url", `${oldUrlBase}%`);
  if (hazards?.length) {
    console.log(`hazard_reports 테이블: ${hazards.length}건 업데이트`);
    for (const h of hazards) {
      const newUrl = `${R2_PUBLIC_URL}/hazard-reports/${h.photo_path}`;
      await sb.from("hazard_reports").update({ photo_url: newUrl }).eq("id", h.id);
    }
  }

  // 4. hazard_report_photos 테이블
  const { data: hazardPhotos } = await sb.from("hazard_report_photos").select("id, photo_path, photo_url").like("photo_url", `${oldUrlBase}%`);
  if (hazardPhotos?.length) {
    console.log(`hazard_report_photos 테이블: ${hazardPhotos.length}건 업데이트`);
    for (const h of hazardPhotos) {
      const newUrl = `${R2_PUBLIC_URL}/hazard-reports/${h.photo_path}`;
      await sb.from("hazard_report_photos").update({ photo_url: newUrl }).eq("id", h.id);
    }
  }

  // 5. hazard_report_resolutions 테이블
  const { data: resolutions } = await sb.from("hazard_report_resolutions").select("report_id, after_path, after_public_url").like("after_public_url", `${oldUrlBase}%`);
  if (resolutions?.length) {
    console.log(`hazard_report_resolutions 테이블: ${resolutions.length}건 업데이트`);
    for (const r of resolutions) {
      const newUrl = `${R2_PUBLIC_URL}/hazard-reports/${r.after_path}`;
      await sb.from("hazard_report_resolutions").update({ after_public_url: newUrl }).eq("report_id", r.report_id);
    }
  }

  console.log("DB URL 업데이트 완료!");
}

async function main() {
  console.log("=== Supabase → R2 마이그레이션 시작 ===");
  if (DELETE_AFTER) console.log("⚠️  --delete 플래그: 마이그레이션 후 Supabase 파일 삭제");
  console.log("");

  let totalFiles = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const bucket of BUCKETS) {
    console.log(`\n[${bucket}] 파일 목록 조회 중...`);
    let files;
    try {
      files = await listAllFiles(bucket);
    } catch (e) {
      console.error(`  ❌ ${e.message}`);
      continue;
    }
    console.log(`  → ${files.length}개 파일 발견`);
    totalFiles += files.length;

    for (let i = 0; i < files.length; i++) {
      const { key } = files[i];
      process.stdout.write(`  [${i + 1}/${files.length}] ${key.slice(0, 60)}... `);
      try {
        const result = await migrateFile(bucket, key);
        if (result.status === "skipped") {
          process.stdout.write("SKIP\n");
          skipped++;
        } else {
          process.stdout.write("OK\n");
          uploaded++;
        }

        // Supabase 삭제 (--delete 플래그, R2에 있는 파일만)
        if (DELETE_AFTER && (result.status === "uploaded" || result.status === "skipped")) {
          await sb.storage.from(bucket).remove([key]);
        }
      } catch (e) {
        process.stdout.write(`FAIL: ${e.message}\n`);
        failed++;
      }
    }
  }

  console.log(`\n=== 파일 이전 완료 ===`);
  console.log(`총: ${totalFiles} | 업로드: ${uploaded} | 스킵: ${skipped} | 실패: ${failed}`);

  if (failed === 0) {
    await updateDbUrls();
  } else {
    console.log(`\n⚠️  실패 ${failed}건 있어서 DB URL 업데이트 건너뜀. 실패 파일 확인 후 재실행하세요.`);
  }
}

main().catch((e) => {
  console.error("오류:", e);
  process.exit(1);
});
