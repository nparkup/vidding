import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { AnalysisTabs } from "@/components/analysis/AnalysisTabs";
import { ContractExplorer } from "@/components/analysis/ContractExplorer";

export const metadata: Metadata = {
  title: "계약현황",
  description: "최근 2주 나라장터 경쟁 계약을 기관·업체·사업자번호로 찾아 계약업체, 공동수급 지분, 계약금액, 계약 기간을 확인합니다.",
};

export default function ContractPage() {
  return (
    <>
      <PageHero
        eyebrow="입찰데이터 분석 · 계약현황"
        title={<>누가 얼마에<br />계약했는지 확인하세요.</>}
        lead="낙찰 뒤 실제로 맺은 계약을 매일 모았습니다. 경쟁사가 최근 어느 기관과 얼마에 계약했는지, 계약이 언제 끝나는지 볼 수 있습니다."
      />
      <AnalysisTabs active="contract" />
      <ContractExplorer />
    </>
  );
}
