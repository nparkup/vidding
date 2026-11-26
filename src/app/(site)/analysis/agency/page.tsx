import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { AgencyExplorer } from "@/components/analysis/AgencyExplorer";

export const metadata: Metadata = {
  title: "발주처 분석",
  description: "수요기관별 10년치 나라장터 낙찰로 발주 규모, 계약방법별 낙찰률·참가업체 수, 자주 낙찰받는 업체, 사정율 분포를 봅니다.",
};

export default function AgencyPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰데이터 분석 · 발주처"
        title={<>이 기관의 발주 방식과<br />낙찰 업체를 확인하세요.</>}
        lead="지금 공고를 낸 수요기관마다 나라장터 10년치 낙찰을 모아 연도별 발주 규모, 계약방법별 낙찰률과 참가업체 수, 자주 낙찰받는 업체, 사정율 분포를 정리했습니다."
      />
      <AnalysisTabs active="agency" />
      <Suspense fallback={<div className="container-x py-10 text-sm text-ink-400">불러오는 중…</div>}>
        <AgencyExplorer />
      </Suspense>
    </>
  );
}
