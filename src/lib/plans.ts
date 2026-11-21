import type { PlanId } from "./types";

/**
 * 월간 이용권 3종. 기능은 같고 한 달에 쓸 수 있는 공고 예측 건수만 다르다. 금액은 VAT 포함.
 * 공고 예측 1건 = 공고 하나의 평가점수 예측·배점표 판독·낙찰 결과로 본 예측 (나라장터·아파트 합산, 같은 공고 다시 열면 차감 없음).
 * 실제 금액·건수는 관리자 화면 페이지 설정 값이 우선한다 (siteConfigCore.ts).
 */
export interface Plan {
  id: PlanId;
  name: string;
  /** 월 금액 (VAT 포함) 기본값 */
  price: number;
  /** 한 달 공고 예측 건수. null = 무제한 */
  quota: number | null;
  tagline: string;
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  { id: "lite", name: "라이트", price: 29000, quota: 100, tagline: "관심 업종 공고를 꾸준히 보는 회사" },
  { id: "standard", name: "스탠다드", price: 49000, quota: 200, tagline: "여러 업종·지역에 참가하는 회사", highlight: true },
  { id: "unlimited", name: "무제한", price: 69000, quota: null, tagline: "참가 공고가 많은 회사" },
];

export const PLAN_IDS = PLANS.map((p) => p.id);
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as string[]).includes(v);

/** 이용권에 들어 있는 기능 (공고 예측 건수 외에는 같음) */
export const FEATURES: string[] = [
  "영업일 매일 아침 맞춤 공고 요약 이메일",
  "면허·지역·금액 기준 1차 선별, 참가조건·마감일 정리",
  "관심 공고 제출서류 체크리스트 무제한",
  "공고별 입찰 가능성 점수와 투찰 가이드",
  "사전규격·발주계획 단계부터 선제 알림",
  "주 1회 주요 공고 분석보고서",
];

/** 예전 요금제 id(basic·pro·partner·monthly·annual)로 저장된 기록도 이름이 나오게 한다 */
const LEGACY: Record<string, string> = { monthly: "월간 결제(이전)", annual: "연간 결제(이전)", basic: "베이직(이전)", pro: "프로(이전)", partner: "파트너(이전)" };
export const planName = (id: string) => PLANS.find((p) => p.id === id)?.name ?? LEGACY[id] ?? id;
