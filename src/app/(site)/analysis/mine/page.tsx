import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { RivalExplorer } from "@/components/analysis/RivalExplorer";

export const metadata: Metadata = {
  title: "우리 회사 투찰 진단",
  description: "우리 회사 사업자번호로 10년치 나라장터 낙찰을 발주처·지역·금액 구간별로 나눠 보고, 투찰 습관을 진단합니다.",
};

export default function MinePage() {
  return (
    <>
      <PageHero
        eyebrow="입찰 분석 · 우리 회사"
        title={<>우리 회사는<br />어디서, 어떻게 따 왔을까.</>}
        lead="사업자번호 하나로 나라장터 10년치 낙찰을 발주처·지역·금액 구간·계약방법별로 나누고, 낙찰하한율 위 폭과 사정율 습관을 진단합니다."
      />
      <AnalysisTabs active="mine" />
      <RivalExplorer mode="mine" />
    </>
  );
}
