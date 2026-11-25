"use client";

import { useState } from "react";
import { Tooltip } from "./Tooltip";
import { CHART, niceMax, useWidth } from "./useWidth";

export interface Col {
  key: string;
  /** 가로축 글자 (짧게) */
  label: string;
  value: number;
  /** 말풍선 줄 (첫 줄 굵게) */
  tip: string[];
  /** 진하게 칠할 막대 (선택한 달, 올해 등) */
  hot?: boolean;
}

/**
 * 세로 막대 차트 (한 가지 값, 축 하나). 막대에 마우스를 올리거나 누르면 말풍선.
 * 모든 막대 위에 값을 적는다. 막대 폭보다 글자가 길면 세로로 세워 적고, 그만큼 위 여백을 늘린다.
 */
/** 10px 글자 폭 어림 (한글 10px, 숫자·기호 5.8px) */
export const textW = (t: string) => [...t].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x3000 ? 10 : 5.8), 0);

export function ColumnChart({ cols, fmt, height: h0 = 180, onPick, ariaLabel }: { cols: Col[]; fmt: (v: number) => string; height?: number; onPick?: (key: string) => void; ariaLabel: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!cols.length) return null;
  let height = h0;
  const PL = 46, PR = 6, PB = 22;
  const max = niceMax(Math.max(...cols.map((c) => c.value)));
  const n = cols.length;
  const slot = (W - PL - PR) / n;
  // 값 글자 폭이 막대 칸보다 넓으면 세로로 세운다
  const labelW = Math.max(...cols.map((c) => (c.value > 0 ? textW(fmt(c.value)) : 0)));
  const vertical = labelW > slot - 4;
  const PT = vertical ? Math.ceil(labelW) + 8 : 18;
  height += PT - 18;
  const bw = Math.max(2, Math.min(36, slot - 2));
  const y = (v: number) => PT + (1 - v / max) * (height - PT - PB);
  const base = height - PB;
  const every = Math.max(1, Math.ceil((Math.max(...cols.map((c) => textW(c.label))) + 4) / slot));
  const h = hover !== null ? cols[hover] : null;
  return (
    <div ref={ref} className="relative mt-2 min-w-0 select-none" onMouseLeave={() => setHover(null)}>
      <svg width={W} height={height} role="img" aria-label={ariaLabel} className="block">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={CHART.text}>{fmt(t)}</text>
          </g>
        ))}
        {cols.map((c, i) => {
          const cx = PL + slot * i + slot / 2;
          const top = y(c.value);
          const bh = Math.max(0, base - top);
          const r = Math.min(4, bw / 2, bh);
          const x0 = cx - bw / 2;
          const fill = c.hot || hover === i ? CHART.barHot : CHART.bar;
          return (
            <g key={c.key}>
              {bh > 0 && (
                <path d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`} fill={fill} />
              )}
              {c.value > 0 && (vertical
                ? <text x={cx + 3.5} y={top - 4} transform={`rotate(-90 ${cx + 3.5} ${top - 4})`} textAnchor="start" fontSize="10" fontWeight="600" fill={CHART.ink}>{fmt(c.value)}</text>
                : <text x={cx} y={top - 4} textAnchor="middle" fontSize="10" fontWeight="600" fill={CHART.ink}>{fmt(c.value)}</text>)}
              {i % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill={CHART.text}>{c.label}</text>
              )}
              <rect
                x={PL + slot * i} y={PT} width={slot} height={base - PT + PB} fill="transparent"
                className={onPick ? "cursor-pointer" : undefined}
                onMouseEnter={() => setHover(i)} onClick={() => { setHover(i); onPick?.(c.key); }}
              />
            </g>
          );
        })}
      </svg>
      {h && hover !== null && <Tooltip x={PL + slot * hover + slot / 2} y={Math.min(y(h.value), height - 70) + 8} lines={h.tip} width={W} />}
    </div>
  );
}

/** 차트 위 작은 전환 버튼 (건수 / 금액 같이 단위가 다른 값을 한 축에 겹치지 않으려고) */
export function MetricToggle<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-ink-100 p-0.5 text-xs" role="group">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-md px-2 py-0.5 font-semibold ${value === k ? "bg-ink text-white" : "text-ink-500 hover:text-ink"}`} aria-pressed={value === k}>{l}</button>
      ))}
    </div>
  );
}
