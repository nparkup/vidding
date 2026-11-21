/**
 * 이용권(유료) 판정과 한 달 공고 예측 건수 기간 계산. 중계 서버(worker/corp-lookup/account.ts)와 화면이 같이 쓴다. React를 쓰지 않는다.
 * - 결제 기록(관리자 화면 결제정보, R2 billing/{사업자번호}.json)이 '이용 중'이고 오늘이 시작일~종료일 안이면 유료 회원이다.
 * - 한 달 건수는 이용 시작일과 같은 날짜에 새로 시작한다 (예: 3월 15일 시작이면 매월 15일). 시작일이 없으면 매월 1일.
 */
export type PaidPlanId = "lite" | "standard" | "unlimited" | "monthly" | "annual";

export interface BillingLike { plan?: string; status?: string; start?: string; end?: string }

export interface PricingLike { liteQuota: number; standardQuota: number }

/** 한국 날짜 YYYY-MM-DD */
export function kstToday(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

const PAID = ["lite", "standard", "unlimited", "monthly", "annual"];

/** 지금 쓰는 이용권. 없으면 null (무료 체험) */
export function activePlan(b: BillingLike | null | undefined, today = kstToday()): PaidPlanId | null {
  if (!b || b.status !== "active" || !PAID.includes(b.plan ?? "")) return null;
  if (b.start && today < b.start) return null;
  if (b.end && today > b.end) return null;
  return b.plan as PaidPlanId;
}

/** 한 달 공고 예측 건수. null = 무제한 (예전 월간·연간 결제는 모든 기능이 들어 있던 요금제라 무제한으로 본다) */
export function quotaOf(plan: PaidPlanId, pricing: PricingLike): number | null {
  if (plan === "lite") return pricing.liteQuota;
  if (plan === "standard") return pricing.standardQuota;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (y: number, m: number, d: number) => {
  // m 이 0 또는 13이면 해를 넘긴다
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((m - 1) % 12 + 12) % 12 + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, lastDay(yy, mm)))}`;
};

/** 오늘이 든 한 달 기간: from 포함, to 는 다음에 새로 시작하는 날 (그날부터 다시 0건) */
export function periodOf(start: string | undefined, today = kstToday()): { from: string; to: string } {
  const anchor = start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? Number(start.slice(8, 10)) : 1;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  let from = ymd(y, m, anchor);
  let fm = m;
  if (from > today) { fm = m - 1; from = ymd(y, fm, anchor); }
  return { from, to: ymd(y, fm + 1, anchor) };
}
