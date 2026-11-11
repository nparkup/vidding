import type { PlanId } from "./types";

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // 월, VAT 별도
  tagline: string;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "basic",
    name: "베이직",
    price: 99000,
    tagline: "공고를 놓치지 않고 싶을 때",
    features: [
      "영업일 매일 아침 맞춤 공고 요약 이메일",
      "면허·지역·금액 기준 1차 선별",
      "추천 공고별 참가조건·마감일 정리",
      "관심 공고 3건/월 제출서류 체크리스트",
    ],
  },
  {
    id: "pro",
    name: "프로",
    price: 199000,
    tagline: "입찰 담당자가 따로 없는 업체에 추천",
    highlight: true,
    features: [
      "베이직 전체 포함",
      "관심 공고 무제한 제출서류 체크리스트",
      "공고별 입찰 가능성 점수와 투찰 가이드",
      "주 1회 주요 공고 분석보고서",
      "전담 매니저 카카오톡·전화 상담",
    ],
  },
  {
    id: "partner",
    name: "파트너",
    price: 390000,
    tagline: "입찰 업무를 통째로 맡기고 싶을 때",
    features: [
      "프로 전체 포함",
      "협상계약 제안서 목차·작성 가이드",
      "적격심사 점수 사전 시뮬레이션",
      "사전규격 단계부터 선제 알림",
      "월 1회 발주처·경쟁사 동향 리포트",
    ],
  },
];

export const planName = (id: PlanId) => PLANS.find((p) => p.id === id)?.name ?? id;
