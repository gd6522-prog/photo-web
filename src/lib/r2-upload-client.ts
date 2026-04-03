/**
 * 브라우저 클라이언트에서 R2에 파일 업로드
 * - Supabase 세션에서 access_token을 받아 presigned URL 발급 후 직접 업로드
 */
export async function uploadFileToR2(params: {
  file: File;
  bucket: string;
  path: string;
  accessToken: string;
}): Promise<{ publicUrl: string; key: string }> {
  const res = await fetch("/api/r2/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      bucket: params.bucket,
      path: params.path,
      contentType: params.file.type || "image/jpeg",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.message ?? `R2 URL 발급 실패 (${res.status})`);

  const { uploadUrl, publicUrl, key } = data;

  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": params.file.type || "image/jpeg" },
    body: params.file,
  });

  if (!upRes.ok) throw new Error(`R2 업로드 실패 (${upRes.status})`);

  return { publicUrl, key };
}
