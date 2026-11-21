"use client";

/** 날짜별 막대 (관리자 화면 공용). 값이 없으면 날짜만 그린다 */
export function DailyBars({ days, values, label, unit = "" }: { days: string[]; values: number[]; label: string; unit?: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-ink-500">합계 {total.toLocaleString()}{unit}</span>
      </figcaption>
      <div className="mt-2 flex h-28 items-end gap-[2px]" role="img" aria-label={`${label} 날짜별`}>
        {values.map((v, i) => (
          <div key={days[i]} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div className={`w-full rounded-t-sm ${v ? "bg-mint" : "bg-ink-100"}`} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 2}%` }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
              {days[i].slice(5)} · {v.toLocaleString()}{unit}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-400">
        <span>{days[0]?.slice(5)}</span>
        <span>{days[days.length - 1]?.slice(5)}</span>
      </div>
    </figure>
  );
}

/** 이름별 가로 막대 (많은 순) */
export function RankBars({ rows, unit = "", empty = "아직 기록이 없습니다." }: { rows: [string, number][]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="py-4 text-sm text-ink-400">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm">
          <div className="relative min-w-0 overflow-hidden rounded-md bg-ink-50">
            <div className="absolute inset-y-0 left-0 bg-mint-100" style={{ width: `${(v / max) * 100}%` }} />
            <span className="relative block truncate px-2 py-1" title={k}>{k}</span>
          </div>
          <span className="tabular-nums text-ink-700">{v.toLocaleString()}{unit}</span>
        </li>
      ))}
    </ul>
  );
}

/** 최근 n일 한국 날짜 목록 (오래된 날부터) */
export function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() + 9 * 3600_000 - i * 86400_000).toISOString().slice(0, 10));
  return out;
}

export interface HitRow { day: string; kind: string; key: string; n: number }

/** 집계 줄을 날짜별 값으로 (kind, key 조건) */
export function seriesOf(rows: HitRow[], days: string[], pick: (r: HitRow) => boolean): number[] {
  const m = new Map<string, number>();
  for (const r of rows) if (pick(r)) m.set(r.day, (m.get(r.day) ?? 0) + r.n);
  return days.map((d) => m.get(d) ?? 0);
}

/** 집계 줄을 key별 합계로 (많은 순) */
export function totalsOf(rows: HitRow[], pick: (r: HitRow) => boolean, keyOf: (r: HitRow) => string = (r) => r.key): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) if (pick(r)) m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + r.n);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
