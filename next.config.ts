import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next가 상위 폴더를 workspace root로 착각하는 것 방지
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
