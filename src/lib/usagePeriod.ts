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

/** 한 달 공고 예측 건수. null = 무제한 (없앤 무제한 이용권과 예전 월간·연간 결제 기록은 건수 제한 없이 본다) */
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

/**
 * 회원별 개별 한도 (관리자 회원정보 '이용 한도'에서 정한다, members/{사업자번호}.json 의 limit).
 * 없으면 요금제 기본 한도(라이트·스탠다드 월 건수, 무료 체험 건수)를 쓴다. quota null = 무제한.
 * 지금 요금제(유료 이용권 또는 무료 체험)에 그대로 적용된다.
 */
/** admin: 관리자(운영자) 계정. 한도 없이 쓰고 사용 건수를 남기지 않는다 */
export interface LimitOverride { quota: number | null; admin?: boolean; memo?: string; at?: string }

export const MAX_QUOTA = 100_000;

export function readOverride(v: unknown): LimitOverride | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.admin === true) return { quota: null, admin: true, memo: typeof o.memo === "string" ? o.memo.slice(0, 200) : undefined, at: typeof o.at === "string" ? o.at : undefined };
  const q = o.quota === null ? null : Math.round(Number(o.quota));
  if (q !== null && !(Number.isFinite(q) && q >= 0 && q <= MAX_QUOTA)) return null;
  return { quota: q, memo: typeof o.memo === "string" ? o.memo.slice(0, 200) : undefined, at: typeof o.at === "string" ? o.at : undefined };
}

export interface LimitInfo {
  /** 지금 요금제: 유료 이용권 id 또는 무료 체험 */
  tier: PaidPlanId | "trial";
  /** 요금제 기본 한도 (null = 무제한) */
  base: number | null;
  /** 실제 적용 한도 (개별 한도가 있으면 그 값) */
  quota: number | null;
  /** 개별 한도를 쓰는지 */
  custom: boolean;
  /** 관리자 계정 (한도 없음·차감 없음) */
  admin?: boolean;
  /** 유료 이용권은 한 달 기간, 무료 체험은 기간 없이 누적 */
  period: { from: string; to: string } | null;
}

/** 회원 한 명의 지금 요금제·한도. 중계 서버의 차감(account.ts)과 관리자 목록이 같은 계산을 쓴다 */
export function limitOf(billing: BillingLike | null | undefined, pricing: PricingLike, trialLimit: number, override: unknown, today = kstToday()): LimitInfo {
  const plan = activePlan(billing, today);
  const o = readOverride(override);
  const base = plan ? quotaOf(plan, pricing) : trialLimit;
  return {
    tier: plan ?? "trial",
    base,
    quota: o ? o.quota : base,
    custom: !!o,
    ...(o?.admin ? { admin: true } : {}),
    period: plan ? periodOf(billing?.start || undefined, today) : null,
  };
}
