import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { RivalExplorer } from "@/components/analysis/RivalExplorer";

export const metadata: Metadata = {
  title: "경쟁사 투찰 성향",
  description: "경쟁사 사업자번호로 10년치 나라장터 낙찰을 모아 사정율, 낙찰하한율 위 폭, 주요 발주처, 함께 상위에 든 업체를 봅니다.",
};

export default function RivalPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰 분석 · 경쟁사"
        title={<>경쟁사는<br />어디쯤에 써 넣을까.</>}
        lead="경쟁사 사업자번호를 넣으면 그 업체가 나라장터에서 낙찰받은 공고로 자주 쓰는 사정율, 낙찰하한율 위 폭, 주요 발주처, 함께 상위에 든 업체를 정리합니다."
      />
      <AnalysisTabs active="rival" />
      <RivalExplorer />
    </>
  );
}
