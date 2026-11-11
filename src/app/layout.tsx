import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "입찰파트너 | 청소·시설관리 공공입찰 분석 대행", template: "%s | 입찰파트너" },
  description:
    "중소 청소·시설관리 업체를 위한 맞춤 공공입찰 발굴·공고 분석 대행. 면허·지역·규모에 맞는 나라장터 공고를 매일 선별해 참가조건, 제출서류, 입찰 가능성까지 정리해 드립니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
