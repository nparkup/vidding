import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { IndustryExplorer } from "@/components/analysis/IndustryExplorer";

export const metadata: Metadata = {
  title: "업종별 분석",
  description: "업종마다 나라장터 10년치 낙찰로 발주 규모, 낙찰률·참가업체 수 추이, 계약방법별 낙찰률, 자주 낙찰받는 업체, 주요 발주기관, 사정율 분포를 봅니다.",
};

export default function IndustryPage() {
  return (
    <>
      <PageHero
        title={<>우리 업종의 발주 흐름과<br />낙찰 업체를 확인하세요.</>}
        lead="공고 검색과 같은 21개 업종으로 나라장터 10년치 낙찰을 나눠 연도별 발주 규모, 낙찰률과 참가업체 수 추이, 계약방법별 낙찰률, 자주 낙찰받는 업체와 주요 발주기관, 사정율 분포를 정리했습니다."
      />
      <AnalysisTabs active="industry" />
      <Suspense fallback={<div className="container-x py-10 text-sm text-ink-400">불러오는 중…</div>}>
        <IndustryExplorer />
      </Suspense>
    </>
  );
}
