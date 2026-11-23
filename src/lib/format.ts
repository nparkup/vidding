/**
 * 사이트의 모든 금액 표기: 원 단위 전체 금액 (예: 1,400,000,000원).
 * "1.4억원"처럼 줄여 쓰지 않는다. 소수점은 반올림한다.
 */
export function won(n: number): string {
  return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
}

/** won 과 같다 (예전 이름) */
export const wonFull = won;

/**
 * 차트 눈금처럼 자리가 좁은 곳에만 쓰는 짧은 금액 (예: 1.4억).
 * 본문·표·툴팁 금액은 won 을 쓴다.
 */
export function wonAxis(n: number): string {
  if (!n) return "0";
  if (Math.abs(n) >= 1e8) return `${Math.round((n / 1e8) * 10) / 10}억`;
  if (Math.abs(n) >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}

/** 비율 표기: 소수 셋째 자리까지, 끝의 0은 뺀다 (예: 87.745%) */
export function rateText(r: number, d = 3): string {
  return `${Math.round(r * 10 ** d) / 10 ** d}%`;
}

/**
 * 금액을 기준으로, 비율은 그 금액 옆 보조값으로 쓴다.
 * 예: wonRate(1_234_000, 87.745, "낙찰률") → "1,234,000원 (낙찰률 87.745%)".
 * 금액이 없으면 비율만, 비율이 없으면 금액만.
 */
export function wonRate(amount: number | undefined, rate: number | undefined, label = ""): string {
  const a = amount && amount > 0 ? won(amount) : "";
  const r = rate && rate > 0 ? `${label ? `${label} ` : ""}${rateText(rate)}` : "";
  return a && r ? `${a} (${r})` : a || r;
}

const tz = { timeZone: "Asia/Seoul" } as const;

export function date(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { ...tz, month: "long", day: "numeric", weekday: "short" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { ...tz, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { ...tz, month: "numeric", day: "numeric" });
}

export function dday(days: number): string {
  if (days <= 0) return "마감";
  if (days === 1) return "D-1";
  return `D-${days}`;
}

/** 한국 시간 기준 YYYY-MM-DD. 날짜가 없거나 잘못되면 빈 문자열 */
export function isoDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", tz);
}

/**
 * 마감까지 남은 날짜를 한국 시간 달력 기준으로 센다 (오늘 마감 = 0).
 * 마감 시각이 이미 지났으면 -1, 날짜가 없거나 잘못되면 null.
 */
export function calendarDaysLeft(iso?: string | null, now = new Date()): number | null {
  const close = isoDate(iso);
  if (!close) return null;
  if (new Date(iso as string).getTime() < now.getTime()) return -1;
  const today = now.toLocaleDateString("en-CA", tz);
  return Math.round((Date.parse(close) - Date.parse(today)) / 86400000);
}
