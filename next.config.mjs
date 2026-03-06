import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Next가 상위 폴더를 workspace root로 착각하는 걸 방지
  outputFileTracingRoot: __dirname,
};

export default nextConfig;