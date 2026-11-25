"use client";

import { useMemo, useState } from "react";
import { Tooltip } from "./Tooltip";
import { CHART, useWidth } from "./useWidth";
import { textW } from "./ColumnChart";

export interface TreeItem {
  key: string;
  label: string;
  value: number;
  /** 칸 안 둘째 줄 (값) */
  sub: string;
  /** 말풍선 줄 (첫 줄 굵게) */
  tip: string[];
}

interface Rect { x: number; y: number; w: number; h: number }

/** 정사각형에 가깝게 칸을 나누는 squarified 배치. values는 큰 순서 */
function squarify(values: number[], box: Rect): Rect[] {
  const out: Rect[] = new Array(values.length);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const scale = (box.w * box.h) / total;
  const areas = values.map((v) => v * scale);
  let { x, y, w, h } = box;
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const mx = Math.max(...row), mn = Math.min(...row);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (i < areas.length) {
    const side = Math.min(w, h);
    const row = [areas[i]];
    let j = i + 1;
    while (j < areas.length && worst([...row, areas[j]], side) <= worst(row, side)) { row.push(areas[j]); j++; }
    const s = row.reduce((a, b) => a + b, 0);
    if (w >= h) {
      const cw = h ? s / h : 0;
      let cy = y;
      row.forEach((a, k) => { const ch = cw ? a / cw : 0; out[i + k] = { x, y: cy, w: cw, h: ch }; cy += ch; });
      x += cw; w -= cw;
    } else {
      const ch = w ? s / w : 0;
      let cx = x;
      row.forEach((a, k) => { const cw = ch ? a / ch : 0; out[i + k] = { x: cx, y, w: cw, h: ch }; cx += cw; });
      y += ch; h -= ch;
    }
    i = j;
  }
  return out;
}

/**
 * 면적형 차트(트리맵): 칸 넓이 = 값. 앞 top개는 따로, 나머지는 '기타 N곳' 한 칸으로 묶는다.
 * 기타 칸은 화면을 덮지 않게 넓이를 그림 전체의 OTHER_MAX(10%) 이하로 줄여 그리고,
 * 실제 비중은 칸 안 숫자로 그대로 적는다(상위 칸 %도 전체 대비 값). 기타를 누르면 그 안을
 * 다시 같은 방식으로 펼친다(처음으로 버튼으로 돌아간다).
 */
const OTHER_MAX = 0.1;

export function Treemap({ items, top = 30, height = 320, ariaLabel, unit = "곳" }: { items: TreeItem[]; top?: number; height?: number; ariaLabel: string; unit?: string }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [skip, setSkip] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const rest = items.slice(skip).filter((t) => t.value > 0);
  const shown = rest.slice(0, top);
  const others = rest.slice(top);
  const otherSum = others.reduce((a, t) => a + t.value, 0);
  const H = W < 480 ? Math.round(height * 1.15) : height;
  const shownSum = shown.reduce((a, t) => a + t.value, 0);
  // 기타 칸 넓이: 실제 값과 '그림 전체의 10%가 되는 값' 중 작은 쪽
  const otherDraw = others.length ? Math.min(otherSum, (shownSum * OTHER_MAX) / (1 - OTHER_MAX)) : 0;
  // 칸 순서: 상위 업체 큰 값부터, 기타는 맨 끝(오른쪽 아래)에. idx = shown 번호, -1 = 기타
  const order = useMemo(() => {
    const o = shown.map((t, i) => ({ idx: i, v: t.value }));
    if (others.length) o.push({ idx: -1, v: otherDraw });
    return o;
  }, [shown, others.length, otherDraw]);
  const rects = useMemo(() => squarify(order.map((o) => o.v), { x: 0, y: 0, w: W, h: H }), [order, W, H]);
  const cells = useMemo(() => {
    const out: Rect[] = new Array(shown.length + (others.length ? 1 : 0));
    order.forEach((o, k) => { out[o.idx < 0 ? shown.length : o.idx] = rects[k]; });
    return out;
  }, [order, rects, shown.length, others.length]);
  const all = rest.reduce((a, t) => a + t.value, 0) || 1;
  const pctOf = (v: number) => { const p = (v / all) * 100; return p >= 10 ? `${Math.round(p)}%` : p >= 0.1 ? `${p.toFixed(1)}%` : "0.1% 미만"; };
  const scope = skip > 0 ? "펼친 범위 안 비중" : "전체 비중";
  const tipFor = (i: number): string[] => (i < shown.length
    ? [...shown[i].tip, `${scope} ${pctOf(shown[i].value)}`]
    : [`기타 ${others.length.toLocaleString()}${unit}`, `${scope} ${pctOf(otherSum)}`, ...(otherDraw < otherSum ? ["칸 넓이는 줄여 그렸습니다"] : []), "누르면 이 안을 펼쳐 봅니다"]);
  const hc = hover !== null ? cells[hover] : null;
  if (!items.length) return null;
  return (
    <div className="mt-3 min-w-0">
      {skip > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span>{skip.toLocaleString()}위 뒤 {rest.length.toLocaleString()}{unit}을 펼쳐 보는 중</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSkip(0)}>처음으로</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSkip(Math.max(0, skip - top))}>한 단계 위로</button>
        </div>
      )}
      <div ref={ref} className="relative min-w-0 select-none" onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} role="img" aria-label={ariaLabel} className="block">
          {cells.map((c, i) => {
            const isOther = i >= shown.length;
            const t = isOther ? null : shown[i];
            const label = isOther ? `기타 ${others.length.toLocaleString()}${unit}` : t!.label;
            const fill = isOther ? CHART.axis : i === 0 ? CHART.barHot : CHART.bar;
            const op = isOther ? 1 : Math.max(0.45, 1 - i * 0.025);
            const ink = isOther || (i > 0 && op < 0.75) ? CHART.ink : "#fff";
            const fit = Math.floor((c.w - 8) / 11);
            const name = fit >= 2 ? (label.length > fit ? `${label.slice(0, fit - 1)}…` : label) : "";
            // 둘째 줄은 숫자가 잘리지 않게, 칸에 다 들어가는 것만 쓴다 (값·비중 → 값 → 비중)
            const fitsSub = (s: string) => textW(s) * 0.92 <= c.w - 10;
            const subOpts = isOther ? [`${scope} ${pctOf(otherSum)}`, `비중 ${pctOf(otherSum)}`, pctOf(otherSum)] : [`${t!.sub} · ${pctOf(t!.value)}`, t!.sub, pctOf(t!.value)];
            const subText = c.h >= 34 ? subOpts.find(fitsSub) : undefined;
            return (
              <g key={isOther ? "__other" : t!.key} onMouseEnter={() => setHover(i)} onClick={() => { setHover(i); if (isOther) { setSkip(skip + shown.length); setHover(null); } }} className={isOther ? "cursor-pointer" : undefined}>
                <rect x={c.x + 1} y={c.y + 1} width={Math.max(0, c.w - 2)} height={Math.max(0, c.h - 2)} rx={4} fill={fill} fillOpacity={op} stroke={hover === i ? CHART.ink : "none"} strokeWidth={1.5} />
                {c.h >= 18 && name && <text x={c.x + 6} y={c.y + 15} fontSize="11" fontWeight="600" fill={ink}>{name}</text>}
                {subText && <text x={c.x + 6} y={c.y + 29} fontSize="10" fill={ink} fillOpacity={0.85}>{subText}</text>}
              </g>
            );
          })}
        </svg>
        {hc && hover !== null && <Tooltip x={hc.x + hc.w / 2} y={Math.min(hc.y + hc.h / 2, H - 80)} lines={tipFor(hover)} width={W} />}
      </div>
    </div>
  );
}
