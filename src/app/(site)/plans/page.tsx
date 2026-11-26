import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { OrderPlanExplorer } from "@/components/analysis/OrderPlanExplorer";

export const metadata: Metadata = {
  title: "발주계획 모아보기",
  description: "기관이 미리 올린 나라장터 발주계획을 발주 예정월·분야·금액으로 찾고, 관심 조건을 저장해 새로 올라온 계획을 확인합니다.",
};

export default function OrderPlanPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰공고 찾기 · 발주계획"
        title={<>공고보다 몇 달 먼저<br />다음 사업을 확인하세요.</>}
        lead="기관이 올린 발주계획 가운데 이번 달부터 넉 달 안에 발주 예정이고 아직 공고가 나오지 않은 경쟁 사업만 모았습니다. 발주 시기와 담당 부서를 보고 미리 준비할 수 있습니다."
      />
      <OrderPlanExplorer />
    </>
  );
}
