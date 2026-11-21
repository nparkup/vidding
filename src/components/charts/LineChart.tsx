"use client";

import { useState } from "react";
import { Tooltip } from "./Tooltip";
import { CHART, useWidth } from "./useWidth";

export interface Series {
  name: string;
  color: string;
  dash?: boolean;
  /** xs와 같은 길이, 값이 없으면 null */
  values: (number | null)[];
}

/**
 * 선 차트 (같은 단위 값 여러 개, 축 하나). 가까운 점에 세로선과 말풍선.
 * 두 줄 이상이면 범례를 위에 둔다.
 */
export function LineChart({ xs, series, tips, fmt, height = 190, ariaLabel, pad = 0.3 }: { xs: string[]; series: Series[]; tips: string[][]; fmt: (v: number) => string; height?: number; ariaLabel: string; pad?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && v > 0));
  if (!xs.length || !all.length) return null;
  const PL = 50, PR = 10, PT = 10, PB = 22;
  const lo = Math.min(...all) - pad, hi = Math.max(...all) + pad;
  const n = xs.length;
  const x = (i: number) => PL + (n <= 1 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (height - PT - PB);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const every = Math.max(1, Math.ceil(56 / ((W - PL - PR) / Math.max(1, n - 1))));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / r.width) * (n - 1)))));
  };
  return (
    <div className="min-w-0">
      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden><line x1="1" x2="17" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? "4 3" : undefined} /></svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative mt-1 min-w-0 select-none" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={CHART.grid} />
              <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={CHART.text}>{fmt(t)}</text>
            </g>
          ))}
          {xs.map((l, i) => i === n - 1 || (i % every === 0 && n - 1 - i >= Math.ceil(every / 2)) ? (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fontSize="10" fill={CHART.text}>{l}</text>
          ) : null)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={height - PB} stroke={CHART.axis} />}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v !== null && v > 0 ? [x(i), y(v)] : null)).filter((p): p is number[] => !!p);
            return (
              <g key={s.name}>
                {pts.length > 1 && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash ? "4 3" : undefined} strokeLinejoin="round" />}
                {!s.dash && s.values.map((v, i) => v !== null && v > 0 && (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth="2" />
                ))}
              </g>
            );
          })}
          <rect x={PL} y={PT} width={W - PL - PR} height={height - PT - PB} fill="transparent" onMouseMove={onMove} onClick={onMove} />
        </svg>
        {hover !== null && <Tooltip x={x(hover)} y={12} lines={tips[hover] ?? []} width={W} />}
      </div>
    </div>
  );
}
