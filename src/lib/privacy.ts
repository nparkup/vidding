/**
 * 개인정보처리방침 판 정보 (src/app/(site)/privacy/page.tsx).
 * 문구를 바꾸면 PRIVACY_VERSION 을 그날 날짜로 올린다. 회원가입 때 동의한 판이 members/{사업자번호}.json consent 에 남는다 (worker account.ts).
 */
export const PRIVACY_VERSION = "2026-11-26";

/** 운영자 정보. 비어 있는 값은 화면에 "기재 예정"으로 나온다 (사업자 등록 정보가 정해지면 채운다) */
export const OPERATOR = {
  /** 상호 */
  company: "",
  /** 대표자 */
  ceo: "",
  /** 개인정보 보호책임자 성명·직책 */
  officer: "",
  /** 개인정보 문의 메일 */
  email: process.env.NEXT_PUBLIC_APPLY_EMAIL || "hello@bidmatrix.kr",
};

/** 결제 기록 법정 보존 기간 (전자상거래 등에서의 소비자보호에 관한 법률 시행령 제6조: 대금결제·재화 공급 기록 5년) */
export const BILLING_RETAIN_YEARS = 5;
/** 백업본 보관: 매일 백업 14개, 매달 1일 백업 3개 → 지운 자료도 백업본에서는 최대 약 90일 남는다 */
export const BACKUP_DAILY_KEEP = 14;
export const BACKUP_MONTHLY_KEEP = 3;
