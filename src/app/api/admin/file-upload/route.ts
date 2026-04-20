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

  const [, persistSettings] = await Promise.all([
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
  ]);

  return NextResponse.json({ ok: true, slots, persistSettings });
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

    if (!fileName) {
      return NextResponse.json({ ok: false, message: "fileName이 없습니다." }, { status: 400 });
    }

    // ── action: download-url — meta key 전체 허용 (store-master 포함) ─────
    if (action === "download-url") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const keys = await listR2Keys(slotPrefix(slotKey));
      if (keys.length === 0) {
        return NextResponse.json({ ok: false, message: "파일이 없습니다." }, { status: 404 });
      }
      const downloadUrl = await getViewPresignedUrl(keys[0]);
      return NextResponse.json({ ok: true, downloadUrl });
    }

    // ── action: set-persist — 이력 보관 on/off ───────────────────────────
    if (action === "set-persist") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const settings = await getPersistSettings();
      settings[slotKey] = enabled ?? true;
      await savePersistSettings(settings);
      return NextResponse.json({ ok: true, persistSettings: settings });
    }

    // ── action: list-history — 슬롯의 파일 목록 ─────────────────────────
    if (action === "list-history") {
      if (!isMetaKey(slotKey)) {
        return NextResponse.json({ ok: false, message: `유효하지 않은 슬롯: ${slotKey}` }, { status: 400 });
      }
      const keys = await listR2Keys(slotPrefix(slotKey));
      const files = keys.map((k) => ({ r2Key: k, fileName: k.replace(slotPrefix(slotKey), "") }));
      files.sort((a, b) => b.fileName.localeCompare(a.fileName));
      return NextResponse.json({ ok: true, files });
    }

    // ── action: download-history-url — 이력 파일 개별 다운로드 ──────────
    if (action === "download-history-url") {
      if (!bodyR2Key) {
        return NextResponse.json({ ok: false, message: "r2Key가 없습니다." }, { status: 400 });
      }
      const downloadUrl = await getViewPresignedUrl(bodyR2Key);
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
      if (!shouldPersist && oldKeys.length > 0) {
        await deleteR2Objects(oldKeys);
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
