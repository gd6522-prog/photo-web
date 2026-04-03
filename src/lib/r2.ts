import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

/** 삭제 */
export async function deleteR2Object(key: string) {
  const cmd = new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key });
  return r2.send(cmd);
}
