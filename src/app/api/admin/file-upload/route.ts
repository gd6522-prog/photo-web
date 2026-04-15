import { NextRequest, NextResponse } from "next/server";
import {
  getUploadPresignedUrl,
  getViewPresignedUrl,
  putR2Object,
  getR2ObjectText,
  listR2Keys,
  deleteR2Objects,
} from "@/lib/r2";

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

// ─── GET: return current file status for all slots (including store-master) ──
export async function GET() {
  const slots: Record<string, { fileName: string; uploadedAt: string; uploaderName?: string; fileSize?: number } | null> = {};

  await Promise.all(
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
  );

  return NextResponse.json({ ok: true, slots });
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

    const { action, slotKey = "", fileName = "", contentType = "application/octet-stream", uploaderName, fileSize } = body;

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

    if (!slotKey || !isGenericSlotKey(slotKey)) {
      return NextResponse.json(
        { ok: false, message: `유효하지 않은 슬롯입니다: ${slotKey}` },
        { status: 400 }
      );
    }

    if (!fileName) {
      return NextResponse.json({ ok: false, message: "fileName이 없습니다." }, { status: 400 });
    }

    // ── action: download-url ────────────────────────────────────────────────
    if (action === "download-url") {
      const keys = await listR2Keys(slotPrefix(slotKey));
      if (keys.length === 0) {
        return NextResponse.json({ ok: false, message: "파일이 없습니다." }, { status: 404 });
      }
      const downloadUrl = await getViewPresignedUrl(keys[0]);
      return NextResponse.json({ ok: true, downloadUrl });
    }

    // ── action: upload-url ──────────────────────────────────────────────────
    if (action === "upload-url") {
      const oldKeys = await listR2Keys(slotPrefix(slotKey));
      if (oldKeys.length > 0) {
        await deleteR2Objects(oldKeys);
      }

      const r2Key = `${slotPrefix(slotKey)}${fileName}`;
      const uploadUrl = await getUploadPresignedUrl(r2Key, contentType);

      return NextResponse.json({ ok: true, uploadUrl, r2Key });
    }

    // ── action: confirm ─────────────────────────────────────────────────────
    if (action === "confirm") {
      const meta = { fileName, uploadedAt: new Date().toISOString(), ...(uploaderName ? { uploaderName } : {}), ...(fileSize != null ? { fileSize } : {}) };
      await putR2Object(metaKey(slotKey), JSON.stringify(meta), "application/json");
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
