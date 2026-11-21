import { CHART } from "./useWidth";

export interface HBar {
  label: string;
  value: number;
  /** 오른쪽에 적을 값 (단위 포함) */
  text: string;
  /** 말풍선 (마우스 올리면) */
  title?: string;
}

/** 가로 막대 목록: 이름과 값은 글자로, 막대는 크기 비교용. 좁은 화면에서도 한 줄 이름 + 막대 */
export function HBarList({ rows, color = CHART.bar }: { rows: HBar[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="min-w-0 text-sm" title={r.title}>
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-semibold">{r.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-ink-500">{r.text}</span>
          </div>
          <span className="mt-1 block h-2 rounded-full bg-paper">
            <span className="block h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} />
          </span>
        </li>
      ))}
    </ol>
  );
}
