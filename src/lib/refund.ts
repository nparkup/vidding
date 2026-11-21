/**
 * 중도 해지 환불 계산 (요금 페이지 FAQ 기준).
 * - 연간: 쓴 기간을 결제한 가격(결제액 ÷ 12 = 한 달 값) 기준으로 계산하고 나머지를 돌려준다. 정가로 다시 계산하는 위약금은 없다.
 *   다 채운 달은 한 달 값, 채우지 못한 달은 그 달의 날수로 일할 계산한다. 예: 348,000원 결제 후 정확히 3개월 → 87,000원 사용, 261,000원 환불.
 * - 월간 이용권(lite·standard·unlimited)과 예전 월간 결제: 이미 결제한 달은 그 달 끝까지 쓰고 다음 달부터 결제하지 않는다 (환불 없음).
 * - 연간은 예전 요금제(annual)로 남은 기록에만 쓴다.
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
  if (plan !== "annual") {
    return { paid, used: paid, refund: 0, fullMonths: 0, extraDays: 0, daysInPart: 0, note: "월간 이용권은 이미 결제한 달을 그 달 끝까지 쓰고 다음 달부터 결제하지 않습니다. 환불 금액은 없습니다." };
  }
  if (c <= s) return { paid, used: 0, refund: paid, fullMonths: 0, extraDays: 0, daysInPart: 0, note: "이용 시작 전 해지: 전액 환불" };
  const monthly = paid / 12;
  let full = 0;
  while (full < 12 && addMonths(s, full + 1) <= c) full++;
  if (full >= 12) return { paid, used: paid, refund: 0, fullMonths: 12, extraDays: 0, daysInPart: 0, note: "이용 기간이 끝나 환불 금액이 없습니다." };
  const partStart = addMonths(s, full);
  const partEnd = addMonths(s, full + 1);
  const daysInPart = Math.round((partEnd.getTime() - partStart.getTime()) / 86400_000);
  const extraDays = Math.round((c.getTime() - partStart.getTime()) / 86400_000);
  const used = Math.round(monthly * full + (monthly * extraDays) / daysInPart);
  return {
    paid, used, refund: Math.max(0, paid - used), fullMonths: full, extraDays, daysInPart,
    note: `${fmt(s)}부터 ${fmt(c)}까지 ${full}개월${extraDays ? ` ${extraDays}일(그 달 ${daysInPart}일 중)` : ""} 사용, 한 달 ${Math.round(monthly).toLocaleString("ko-KR")}원 기준`,
  };
}

/** 시작일에서 결제 주기만큼 지난 종료일(전날) */
export function planEnd(plan: string, start: string): string {
  const e = addMonths(parse(start), plan === "annual" ? 12 : 1);
  e.setUTCDate(e.getUTCDate() - 1);
  return fmt(e);
}
