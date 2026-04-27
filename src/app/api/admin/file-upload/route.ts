import { NextRequest, NextResponse } from "next/server";
import {
  getUploadPresignedUrl,
  getViewPresignedUrl,
  putR2Object,
  getR2ObjectText,
  listR2Keys,
  deleteR2Objects,
} from "@/lib/r2";
import { triggerCacheWarm, invalidateCache } from "@/lib/cache-warm";

export const runtime = "nodejs";

// ─── Slot keys that support generic file storage ─────────────────────────────
// "store-master" is handled via /api/admin/store-master/import (DB import).
// All other keys store files in R2 via presigned PUT URL (browser → R2 directly).
const GENERIC_SLOT_KEYS = [
  "product-master",
  "workcenter-product-master",
  "cell-management",
  "product-strategy",
  "inventory-status",
  "product-inventory",
  "po-std-master",
  "inbound-status",
  "logistics-cost-by-store",
] as const;

// store-master uses DB import but also saves R2 metadata (for last uploader display)
const STORE_MASTER_KEY = "store-master";

// All keys that can have metadata saved
const ALL_META_KEYS = [...GENERIC_SLOT_KEYS, STORE_MASTER_KEY] as const;
type AllMetaKey = (typeof ALL_META_KEYS)[number];

type GenericSlotKey = (typeof GENERIC_SLOT_KEYS)[number];

function isGenericSlotKey(key: string): key is GenericSlotKey {
  return GENERIC_SLOT_KEYS.includes(key as GenericSlotKey);
}

function isMetaKey(key: string): key is AllMetaKey {
  return ALL_META_KEYS.includes(key as AllMetaKey);
}

/** R2 key prefix for files in a slot */
function slotPrefix(key: string) {
  return `file-uploads/${key}/`;
}

/** R2 key for slot metadata JSON */
function metaKey(key: string) {
  return `file-uploads/${key}.meta`;
}

// ─── Card order helpers ────────────────────────────────────────────────────────
const CARD_ORDER_KEY = "file-uploads/_card-order.json";

async function getCardOrder(): Promise<string[]> {
  try {
    const text = await getR2ObjectText(CARD_ORDER_KEY);
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  }
}

// ─── Persist settings helpers ─────────────────────────────────────────────────
const PERSIST_SETTINGS_KEY = "file-uploads/_persist-settings.json";

async function getPersistSettings(): Promise<Record<string, boolean>> {
  try {
    const text = await getR2ObjectText(PERSIST_SETTINGS_KEY);
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function savePersistSettings(settings: Record<string, boolean>): Promise<void> {
  await putR2Object(PERSIST_SETTINGS_KEY, JSON.stringify(settings), "application/json");
}

// ─── GET: return current file status for all slots (including store-master) ──
export async function GET() {
  const slots: Record<string, { fileName: string; uploadedAt: string; uploaderName?: string; fileSize?: number } | null> = {};

  const [, persistSettings, cardOrder] = await Promise.all([
    Promise.all(
      ALL_META_KEYS.map(async (key) => {
        try {
          const text = await getR2ObjectText(metaKey(key));
          slots[key] = text
            ? (JSON.parse(text) as { fileName: string; uploadedAt: string; uploaderName?: string; fileSize?: number })
            : null;
        } catch {
          slots[key] = null;
        }
      })
    ),
    getPersistSettings(),
    getCardOrder(),
  ]);

  return NextResponse.json({ ok: true, slots, persistSettings, cardOrder });
}

// ─── POST: two actions via JSON body ─────────────────────────────────────────
//
//  action = "upload-url"
//    body: { slotKey, fileName, contentType }
//    → deletes existing R2 files for the slot, returns a presigned PUT URL
//
//  action = "confirm"
//    body: { slotKey, fileName }
//    → writes .meta after the browser has successfully PUT the file
//
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      slotKey?: string;
      fileName?: string;
      contentType?: string;
      uploaderName?: string;
      fileSize?: number;
    };

    const { action, slotKey = "", fileName = "", contentType = "application/octet-stream", uploaderName, fileSize, enabled, r2Key: bodyR2Key } = body as typeof body & { enabled?: boolean; r2Key?: string };

    // ── action: save-meta — any slot key (used after store-master DB import) ─
    if (action === "save-meta") {
      if (!slotKey || !isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      if (!fileName) {
        return NextResponse.json({ ok: false, message: "fileName이 없습니다." }, { status: 400 });
      }
      const meta = { fileName, uploadedAt: new Date().toISOString(), ...(uploaderName ? { uploaderName } : {}), ...(fileSize != null ? { fileSize } : {}) };
      await putR2Object(metaKey(slotKey), JSON.stringify(meta), "application/json");
      return NextResponse.json({ ok: true });
    }

    // ── action: set-card-order — 카드 순서 저장 (fileName 불필요) ──────────
    if (action === "set-card-order") {
      const order = (body as { order?: string[] }).order ?? [];
      await putR2Object(CARD_ORDER_KEY, JSON.stringify(order), "application/json");
      return NextResponse.json({ ok: true });
    }

    // ── action: set-persist — 이력 보관 on/off (fileName 불필요) ──────────
    if (action === "set-persist") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const settings = await getPersistSettings();
      settings[slotKey] = enabled ?? true;
      await savePersistSettings(settings);
      return NextResponse.json({ ok: true, persistSettings: settings });
    }

    // ── action: list-history — 슬롯의 파일 목록 (fileName 불필요) ─────────
    if (action === "list-history") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const keys = await listR2Keys(slotPrefix(slotKey));
      const files = keys.map((k) => ({ r2Key: k, fileName: k.replace(slotPrefix(slotKey), "") }));
      files.sort((a, b) => b.fileName.localeCompare(a.fileName));
      return NextResponse.json({ ok: true, files });
    }

    // ── action: download-history-url — 이력 파일 개별 다운로드 (fileName 불필요) ─
    if (action === "download-history-url") {
      if (!bodyR2Key) {
        return NextResponse.json({ ok: false, message: "r2Key가 없습니다." }, { status: 400 });
      }
      const downloadUrl = await getViewPresignedUrl(bodyR2Key);
      return NextResponse.json({ ok: true, downloadUrl });
    }

    if (!fileName) {
      return NextResponse.json({ ok: false, message: "fileName이 없습니다." }, { status: 400 });
    }

    // ── action: download-url — meta key 전체 허용 (store-master 포함) ─────
    // 이력 보관 ON 슬롯은 R2 에 옛 파일이 누적되어 있으므로, 메타 JSON 의 현재 fileName 을
    // 우선 사용한다. R2 listObjects 는 사전식 오름차순으로 반환하기 때문에 keys[0] 만 보면
    // 가장 오래된 파일이 받아지는 문제가 있었음.
    if (action === "download-url") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      let targetKey: string | null = null;
      // 1) 메타 우선 — UI 가 표시하는 "현재 서버 파일" 과 동일한 파일을 받음
      try {
        const text = await getR2ObjectText(metaKey(slotKey));
        if (text) {
          const meta = JSON.parse(text) as { fileName?: string };
          if (meta?.fileName) targetKey = `${slotPrefix(slotKey)}${meta.fileName}`;
        }
      } catch {}
      // 2) 폴백 — 메타 없거나 파싱 실패 시 listR2Keys 의 가장 최신 (사전순 마지막)
      if (!targetKey) {
        const keys = await listR2Keys(slotPrefix(slotKey));
        if (keys.length === 0) {
          return NextResponse.json({ ok: false, message: "파일이 없습니다." }, { status: 404 });
        }
        const sorted = [...keys].sort();
        targetKey = sorted[sorted.length - 1];
      }
      const downloadUrl = await getViewPresignedUrl(targetKey);
      return NextResponse.json({ ok: true, downloadUrl });
    }

    // ── action: upload-url — meta key 전체 허용 (store-master 포함) ──────
    if (action === "upload-url") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const persistSettings = await getPersistSettings();
      const shouldPersist = persistSettings[slotKey] ?? false;
      const oldKeys = await listR2Keys(slotPrefix(slotKey));
      if (!shouldPersist) {
        if (oldKeys.length > 0) await deleteR2Objects(oldKeys);
      } else {
        // persist ON: 같은 날짜 파일만 삭제 (당일 중복 제거)
        const newDateMatch = fileName.match(/_(\d{8})_/);
        if (newDateMatch) {
          const newDate = newDateMatch[1];
          const sameDayKeys = oldKeys.filter((k) => {
            const m = k.match(/_(\d{8})_/);
            return m && m[1] === newDate;
          });
          if (sameDayKeys.length > 0) await deleteR2Objects(sameDayKeys);
        }
      }

      // 파일 교체 시 관련 R2 JSON 캐시 무효화
      await invalidateCache(slotKey);

      const r2Key = `${slotPrefix(slotKey)}${fileName}`;
      const uploadUrl = await getUploadPresignedUrl(r2Key, contentType);

      return NextResponse.json({ ok: true, uploadUrl, r2Key });
    }

    // ── action: confirm — generic 슬롯만 (store-master는 import API에서 meta 저장) ─
    if (action === "confirm") {
      if (!isGenericSlotKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const meta = { fileName, uploadedAt: new Date().toISOString(), ...(uploaderName ? { uploaderName } : {}), ...(fileSize != null ? { fileSize } : {}) };
      await putR2Object(metaKey(slotKey), JSON.stringify(meta), "application/json");
      // 업로드 완료 즉시 캐시 워밍 (백그라운드)
      triggerCacheWarm(slotKey);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, message: `알 수 없는 action: ${action}` },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
