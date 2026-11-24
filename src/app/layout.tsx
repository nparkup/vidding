import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { resetOnReloadScript } from "@/lib/resetOnReload";
import { PageBeacon } from "@/components/PageBeacon";

export const viewport = { themeColor: "#0B1426" };

export const metadata: Metadata = {
  title: { default: "비드매트릭스 | 전 업종 공공입찰 분석 대행", template: "%s | 비드매트릭스" },
  description:
    "입찰공고 낙찰정보 빅데이터 분석 정보. 용역·공사·물품 전 업종 나라장터 공고를 면허·지역·규모·경쟁 강도·실적·준비 기간 6개 항목으로 정밀 평가해 참가조건, 제출서류, 입찰 가능성까지 정리해 드립니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 새로고침하면 고른 조건·조회 결과를 처음 상태로 (src/lib/resetOnReload.ts) */}
        <script dangerouslySetInnerHTML={{ __html: resetOnReloadScript }} />
      </head>
      <body>
        {children}
        <PageBeacon />
      </body>
    </html>
  );
}
