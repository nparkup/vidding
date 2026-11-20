import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ToolTabs } from "@/components/tools/ToolTabs";
import { FinanceAvgView } from "@/components/tools/FinanceAvgView";

export const metadata: Metadata = {
  title: "업종별 경영상태 평균비율",
  description: "적격심사 경영상태 평가에 쓰는 종합·전문·설비·전기·통신·소방 업종별 부채비율·유동비율 평균과 만점 조건을 확인합니다.",
};

export default function FinanceToolPage() {
  return (
    <>
      <PageHero
        eyebrow="실무 도구 · 경영상태"
        title={<>우리 재무비율,<br />업종 평균과 견주면.</>}
        lead="적격심사 경영상태 평가는 업종 평균비율과 견줘 점수를 매깁니다. 협회가 공시한 업종별 부채비율·유동비율 평균과, 우리 회사 비율이 만점 조건을 채우는지 함께 봅니다."
      />
      <ToolTabs active="finance" />
      <FinanceAvgView />
    </>
  );
}
