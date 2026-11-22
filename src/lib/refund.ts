/**
 * 중도 해지 처리 (요금 페이지 FAQ 기준).
 * - 모든 이용권(월간·예전 연간 기록 포함): 이미 결제한 기간은 그 기간 끝까지 쓰고 다음 결제부터 하지 않는다.
 * - 남은 날짜만큼 나누어 돌려주는 일할·월할 환불은 없다 (2026-11-23 운영 원칙).
 */
export interface RefundResult {
  paid: number;
  used: number;
  refund: number;
  fullMonths: number;
  extraDays: number;
  daysInPart: number;
  note: string;
}

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
function addMonths(d: Date, n: number): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(d.getUTCDate(), last));
  return x;
}

export function calcRefund(plan: string, paid: number, start: string, cancel: string): RefundResult | null {
  if (!plan || !start || !cancel || !(paid > 0)) return null;
  const s = parse(start);
  const c = parse(cancel);
  if (isNaN(s.getTime()) || isNaN(c.getTime())) return null;
  const end = planEnd(plan, start);
  return {
    paid, used: paid, refund: 0, fullMonths: 0, extraDays: 0, daysInPart: 0,
    note: `해지해도 환불은 없습니다. 이미 결제한 기간(${end}까지)은 끝까지 이용하고, 다음 결제부터 청구하지 않습니다. (해지일 ${fmt(c)})`,
  };
}

/** 시작일에서 결제 주기만큼 지난 종료일(전날) */
export function planEnd(plan: string, start: string): string {
  const e = addMonths(parse(start), plan === "annual" ? 12 : 1);
  e.setUTCDate(e.getUTCDate() - 1);
  return fmt(e);
}
