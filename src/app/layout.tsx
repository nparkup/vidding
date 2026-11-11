import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const viewport = { themeColor: "#0B1426" };

export const metadata: Metadata = {
  title: { default: "입찰파트너 | 전 업종 공공입찰 분석 대행", template: "%s | 입찰파트너" },
  description:
    "용역·공사·물품 전 업종 중소기업을 위한 맞춤 공공입찰 발굴·공고 분석 대행. 면허·지역·규모에 맞는 나라장터 공고를 매일 선별해 참가조건, 제출서류, 입찰 가능성까지 정리해 드립니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
