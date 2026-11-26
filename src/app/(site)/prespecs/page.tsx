import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { PreSpecExplorer } from "@/components/analysis/PreSpecExplorer";

export const metadata: Metadata = {
  title: "사전규격 미리보기",
  description: "본공고 전에 공개된 나라장터 사전규격을 업무·분야·예산으로 찾고, 관심 조건을 저장해 새로 올라온 건을 확인합니다.",
};

export default function PreSpecPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰 분석 · 사전규격"
        title={<>본공고가 나오기 전에<br />먼저 준비하세요.</>}
        lead="발주기관이 본공고 전에 공개하는 사전규격을 매일 모았습니다. 규격서를 미리 받아 보고, 의견 등록 마감 전에 준비를 시작할 수 있습니다."
      />
      <AnalysisTabs active="prespec" />
      <PreSpecExplorer />
    </>
  );
}
