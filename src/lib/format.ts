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
