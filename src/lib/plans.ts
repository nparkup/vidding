import type { PlanId } from "./types";

/** 결제 방식. 기능은 하나의 요금제로 같고, 결제 주기만 다르다. 금액은 VAT 포함. */
export interface Plan {
  id: PlanId;
  name: string;
  /** 한 번에 결제되는 금액 (VAT 포함) */
  charge: number;
  /** 결제 주기 개월 수 */
  months: number;
  /** 월 환산 금액 (VAT 포함) */
  monthly: number;
  tagline: string;
  highlight?: boolean;
}

export const MONTHLY_PRICE = 33000;
export const ANNUAL_CHARGE = 348000;

export const PLANS: Plan[] = [
  { id: "annual", name: "연간 결제", charge: ANNUAL_CHARGE, months: 12, monthly: ANNUAL_CHARGE / 12, tagline: "1년 이용, 월간보다 12% 저렴", highlight: true },
  { id: "monthly", name: "월간 결제", charge: MONTHLY_PRICE, months: 1, monthly: MONTHLY_PRICE, tagline: "매달 결제, 원하는 달까지만" },
];

/** 월간으로 1년 쓸 때보다 아끼는 금액·비율 */
export const ANNUAL_SAVING = MONTHLY_PRICE * 12 - ANNUAL_CHARGE;
export const ANNUAL_SAVING_PCT = Math.round((ANNUAL_SAVING / (MONTHLY_PRICE * 12)) * 100);

/** 요금제에 들어 있는 기능 (결제 방식과 관계없이 같음) */
export const FEATURES: string[] = [
  "영업일 매일 아침 맞춤 공고 요약 이메일",
  "면허·지역·금액 기준 1차 선별, 참가조건·마감일 정리",
  "관심 공고 제출서류 체크리스트 무제한",
  "공고별 입찰 가능성 점수와 투찰 가이드",
  "평가점수 예측: 첨부 공고서·규격서 판독 + 기업 정보로 예상 점수 산출",
  "사전규격·발주계획 단계부터 선제 알림",
  "주 1회 주요 공고 분석보고서",
];

/** 예전 요금제 id(basic·pro·partner)로 저장된 고객사도 이름이 나오게 한다 */
export const planName = (id: PlanId | string) => PLANS.find((p) => p.id === id)?.name ?? "월간 결제";
