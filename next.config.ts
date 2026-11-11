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
        env: { NEXT_PUBLIC_STATIC_SITE: "1" },
      }
    : {}),
};

export default nextConfig;
