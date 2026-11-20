import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { RecentAwardsExplorer } from "@/components/analysis/RecentAwardsExplorer";

export const metadata: Metadata = {
  title: "최근 낙찰 결과",
  description: "최근 한 달 나라장터 최종낙찰을 업무·기간·기초금액·계약방법으로 찾고, 낙찰업체·낙찰률·사정율·개찰 순위를 봅니다.",
};

export default function RecentAwardsPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰 분석 · 최근 낙찰"
        title={<>지난주에는<br />누가, 얼마에 가져갔을까.</>}
        lead="최근 한 달 동안 나라장터에서 낙찰이 확정된 공고를 매일 모았습니다. 기초금액, 낙찰금액과 낙찰률, 사정율, 참가업체 수, 개찰 순위를 한 줄에 정리했습니다."
      />
      <AnalysisTabs active="awards" />
      <RecentAwardsExplorer />
    </>
  );
}
