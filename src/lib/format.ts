export function won(n: number): string {
  if (n >= 100_000_000) {
    const eok = n / 100_000_000;
    return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1).replace(/\.0$/, "")}억원`;
  }
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

export function wonFull(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
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
