import { NextRequest, NextResponse } from "next/server";
import { putR2Object, getR2ObjectText, listR2Keys, deleteR2Objects } from "@/lib/r2";

export const runtime = "nodejs";

// ─── Slot keys that support generic file storage ─────────────────────────────
// "store-master" is handled via /api/admin/store-master/import (DB import).
// All other keys store files in R2.
const GENERIC_SLOT_KEYS = [
  "delivery-schedule",
  "vehicle-info",
  "driver-list",
  "work-order",
  "misc",
] as const;

type GenericSlotKey = (typeof GENERIC_SLOT_KEYS)[number];

function isGenericSlotKey(key: string): key is GenericSlotKey {
  return GENERIC_SLOT_KEYS.includes(key as GenericSlotKey);
}

/** R2 prefix for all files in a slot */
function slotPrefix(key: string) {
  return `file-uploads/${key}/`;
}

/** R2 key for slot metadata (filename, uploadedAt) */
function metaKey(key: string) {
  return `file-uploads/${key}.meta`;
}

// ─── GET: return current file status for all generic slots ───────────────────
export async function GET() {
  const slots: Record<string, { fileName: string; uploadedAt: string } | null> = {};

  await Promise.all(
    GENERIC_SLOT_KEYS.map(async (key) => {
      try {
        const text = await getR2ObjectText(metaKey(key));
        slots[key] = text ? (JSON.parse(text) as { fileName: string; uploadedAt: string }) : null;
      } catch {
        slots[key] = null;
      }
    })
  );

  return NextResponse.json({ ok: true, slots });
}

// ─── POST: upload a file to a generic slot ───────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const slotKey = String(formData.get("slotKey") ?? "").trim();
    const file = formData.get("file");

    if (!slotKey) {
      return NextResponse.json({ ok: false, message: "slotKey가 없습니다." }, { status: 400 });
    }

    if (!isGenericSlotKey(slotKey)) {
      return NextResponse.json(
        { ok: false, message: `유효하지 않은 슬롯입니다: ${slotKey}` },
        { status: 400 }
      );
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "파일이 없습니다." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || "application/octet-stream";

    // Delete all existing files for this slot
    const oldKeys = await listR2Keys(slotPrefix(slotKey));
    if (oldKeys.length > 0) {
      await deleteR2Objects(oldKeys);
    }

    // Upload new file
    const r2Key = `${slotPrefix(slotKey)}${file.name}`;
    await putR2Object(r2Key, buffer, contentType);

    // Store metadata (for status display)
    const meta = { fileName: file.name, uploadedAt: new Date().toISOString() };
    await putR2Object(metaKey(slotKey), JSON.stringify(meta), "application/json");

    return NextResponse.json({ ok: true, fileName: file.name });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
