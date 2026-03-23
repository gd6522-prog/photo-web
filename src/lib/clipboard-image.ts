"use client";

type ClipboardImageOptions = {
  maxBytes?: number;
  maxDimension?: number;
  minDimension?: number;
};

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_MIN_DIMENSION = 480;

function ensureClipboardSupport() {
  const hasClipboardWrite = !!(navigator.clipboard as { write?: unknown })?.write;
  const hasClipboardItem = typeof (window as unknown as { ClipboardItem?: unknown }).ClipboardItem !== "undefined";
  if (!hasClipboardWrite || !hasClipboardItem) {
    throw new Error("현재 브라우저는 이미지 클립보드를 지원하지 않습니다.");
  }
}

async function ensureFocusedDocument() {
  if (!document.hasFocus()) {
    window.focus();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function fetchImageBlob(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`이미지 조회 실패: ${res.status}`);
  return await res.blob();
}

async function blobToBitmap(blob: Blob) {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(blob);
  }

  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지 디코딩 실패"));
      image.src = objUrl;
    });
    return img;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function fitSize(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= maxDimension) return { width, height };
  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality?: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지 변환 실패"));
    }, type, quality);
  });
}

async function makeCompressedClipboardBlob(
  blob: Blob,
  options?: ClipboardImageOptions,
  preferredType: "image/jpeg" | "image/png" = "image/png"
) {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const startMaxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const minDimension = options?.minDimension ?? DEFAULT_MIN_DIMENSION;

  const bitmap = await blobToBitmap(blob);
  let currentMaxDimension = startMaxDimension;
  let bestBlob: Blob | null = null;

  while (currentMaxDimension >= minDimension) {
    const { width, height } = fitSize(bitmap.width, bitmap.height, currentMaxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 초기화하지 못했습니다.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    if (preferredType === "image/png") {
      const pngBlob = await canvasToBlob(canvas, "image/png");
      bestBlob = pngBlob;
      if (pngBlob.size <= maxBytes) return pngBlob;
    } else {
      for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34]) {
        const jpegBlob = await canvasToBlob(canvas, "image/jpeg", quality);
        bestBlob = jpegBlob;
        if (jpegBlob.size <= maxBytes) return jpegBlob;
      }
    }

    currentMaxDimension = Math.round(currentMaxDimension * 0.82);
  }

  if (bestBlob) return bestBlob;
  throw new Error("이미지 압축에 실패했습니다.");
}

async function writeBlobToClipboard(blob: Blob) {
  const clipboard = navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> };
  const clipboardCtor = window as unknown as {
    ClipboardItem: (new (arg: Record<string, Blob>) => unknown) & { supports?: (type: string) => boolean };
  };

  const mime = blob.type || "image/jpeg";
  const supports =
    typeof clipboardCtor.ClipboardItem?.supports === "function"
      ? clipboardCtor.ClipboardItem.supports.bind(clipboardCtor.ClipboardItem)
      : null;

  if (supports && !supports(mime)) {
    throw new Error(`UNSUPPORTED:${mime}`);
  }

  const item = new clipboardCtor.ClipboardItem({ [mime]: blob });
  await clipboard.write([item]);
}

export async function copyCompressedImageUrlToClipboard(url: string, options?: ClipboardImageOptions) {
  ensureClipboardSupport();
  await ensureFocusedDocument();

  const sourceBlob = await fetchImageBlob(url);
  try {
    const blob = await makeCompressedClipboardBlob(sourceBlob, options, "image/png");
    await writeBlobToClipboard(blob);
    return { bytes: blob.size, mime: blob.type };
  } catch (e: any) {
    const first = String(e?.message ?? e ?? "");
    if (first.startsWith("UNSUPPORTED:")) {
      throw new Error("현재 브라우저가 복사 가능한 이미지 형식을 지원하지 않습니다.");
    }
    throw new Error(first || "이미지 복사에 실패했습니다.");
  }
}
