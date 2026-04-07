import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
export const R2_BUCKET = process.env.R2_BUCKET!;

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

/** 업로드용 presigned PUT URL (기본 15분) */
export async function getUploadPresignedUrl(key: string, contentType: string, expiresIn = 900) {
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(r2, cmd, { expiresIn });
}

/** 조회용 presigned GET URL (기본 1시간) */
export async function getViewPresignedUrl(key: string, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return getSignedUrl(r2, cmd, { expiresIn });
}

/** 단일 삭제 */
export async function deleteR2Object(key: string) {
  const cmd = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return r2.send(cmd);
}

/** 배치 삭제 (최대 1000개) */
export async function deleteR2Objects(keys: string[]) {
  if (keys.length === 0) return;
  const cmd = new DeleteObjectsCommand({
    Bucket: R2_BUCKET,
    Delete: { Objects: keys.map((k) => ({ Key: k })) },
  });
  return r2.send(cmd);
}

/** 객체 텍스트 다운로드 (없으면 null) */
export async function getR2ObjectText(key: string): Promise<string | null> {
  try {
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const res = await r2.send(cmd);
    if (!res.Body) return null;
    return await (res.Body as any).transformToString();
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** 객체 Buffer 다운로드 (없으면 null) */
export async function getR2ObjectBuffer(key: string): Promise<Buffer | null> {
  try {
    const cmd = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key });
    const res = await r2.send(cmd);
    if (!res.Body) return null;
    const bytes = await (res.Body as any).transformToByteArray();
    return Buffer.from(bytes);
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

/** 객체 직접 업로드 */
export async function putR2Object(key: string, body: string | Buffer | Uint8Array, contentType: string) {
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType });
  return r2.send(cmd);
}

/** prefix로 시작하는 키 목록 반환 */
export async function listR2Keys(prefix: string): Promise<string[]> {
  const cmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix });
  const res = await r2.send(cmd);
  return (res.Contents ?? []).map((o) => o.Key ?? "").filter(Boolean);
}
