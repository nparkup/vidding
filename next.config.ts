import type { NextConfig } from "next";

const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStatic
    ? {
        // GitHub Pages: 정적 HTML로 내보내기 (scripts/build-static.mjs 참고)
        output: "export",
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        // 워커마다 힙을 6GB까지 쓰므로 러너 메모리(16GB) 안에서 워커 수를 줄인다 (pages.yml NEXT_BUILD_CPUS)
        ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
        env: { NEXT_PUBLIC_STATIC_SITE: "1", NEXT_PUBLIC_BASE_PATH: basePath },
      }
    : {}),
};

export default nextConfig;
