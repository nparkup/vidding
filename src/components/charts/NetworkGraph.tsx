"use client";

import { useMemo, useState } from "react";
import { Tooltip } from "./Tooltip";
import { CHART, useWidth } from "./useWidth";

export interface NetNode {
  id: string;
  label: string;
  /** groups의 key */
  group: string;
  /** 원 크기 (건수 등) */
  weight: number;
  tip: string[];
}
export interface NetEdge { a: string; b: string; w: number }
export interface NetGroup { key: string; label: string; color: string }

/** 이름이 같으면 늘 같은 자리에서 시작하도록 (새로고침해도 모양이 같게) */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/** 힘 배치: 모든 원은 서로 밀고, 이어진 원은 당기고, 가운데로 살짝 끈다. 원 40개 안팎이라 브라우저에서 바로 계산한다 */
function layout(nodes: NetNode[], edges: NetEdge[], radius: (n: NetNode) => number, centerId?: string) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const gs = [...new Set(nodes.map((n) => n.group))];
  const P = nodes.map((n, i) => {
    if (n.id === centerId) return { x: 0, y: 0 };
    const g = gs.indexOf(n.group);
    const ang = (g / Math.max(1, gs.length)) * Math.PI * 2 + hash(n.id) * 1.6;
    const d = 120 + hash(n.label + i) * 80;
    return { x: Math.cos(ang) * d, y: Math.sin(ang) * d };
  });
  const R = nodes.map(radius);
  const E = edges.map((e) => [idx.get(e.a), idx.get(e.b), e.w] as const).filter((e): e is readonly [number, number, number] => e[0] !== undefined && e[1] !== undefined);
  const maxW = Math.max(1, ...E.map((e) => e[2]));
  const ci = centerId ? idx.get(centerId) : undefined;
  for (let it = 0; it < 320; it++) {
    const t = 1 - it / 320;
    const F = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        let dx = P[j].x - P[i].x, dy = P[j].y - P[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
        const d = Math.sqrt(d2);
        const min = R[i] + R[j] + 34;
        let f = 3400 / d2;
        if (d < min) f += (min - d) * 0.5;
        F[i].x -= (dx / d) * f; F[i].y -= (dy / d) * f;
        F[j].x += (dx / d) * f; F[j].y += (dy / d) * f;
      }
    }
    for (const [a, b, w] of E) {
      const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const rest = R[a] + R[b] + 70 - 30 * (w / maxW);
      const f = (d - rest) * 0.04;
      F[a].x += (dx / d) * f; F[a].y += (dy / d) * f;
      F[b].x -= (dx / d) * f; F[b].y -= (dy / d) * f;
    }
    for (let i = 0; i < P.length; i++) {
      if (i === ci) continue;
      F[i].x -= P[i].x * 0.012; F[i].y -= P[i].y * 0.012;
      const step = Math.min(12 * t + 1, Math.hypot(F[i].x, F[i].y));
      const m = Math.hypot(F[i].x, F[i].y) || 1;
      P[i].x += (F[i].x / m) * step; P[i].y += (F[i].y / m) * step;
    }
  }
  return P;
}

/**
 * 관계도: 원 크기 = 건수, 색 = 구분, 선 굵기 = 함께 나온 횟수.
 * 원에 마우스를 올리거나 누르면 이어진 것만 진하게 남기고 말풍선을 띄운다.
 */
export function NetworkGraph({ nodes, edges, groups, centerId, height = 420, ariaLabel, labelTop = 24 }: { nodes: NetNode[]; edges: NetEdge[]; groups: NetGroup[]; centerId?: string; height?: number; ariaLabel: string; labelTop?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const maxN = Math.max(1, ...nodes.filter((n) => n.id !== centerId).map((n) => n.weight));
  const radius = (n: NetNode) => (n.id === centerId ? 20 : 6 + 14 * Math.sqrt(n.weight / maxN));
  const P = useMemo(() => layout(nodes, edges, radius, centerId), [nodes, edges, centerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = useMemo(() => new Map(groups.map((g) => [g.key, g.color])), [groups]);
  if (!nodes.length) return null;
  const H = W < 520 ? Math.max(360, Math.round(height * 0.95)) : height;
  const PX = W < 520 ? 44 : 70, PY = 26;
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => PX + ((v - x0) / Math.max(1, x1 - x0)) * (W - 2 * PX);
  const sy = (v: number) => PY + ((v - y0) / Math.max(1, y1 - y0)) * (H - 2 * PY - 14);
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const near = new Set<string>();
  if (focus) { near.add(focus); for (const e of edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); } }
  const maxE = Math.max(1, ...edges.map((e) => e.w));
  // 이름표: 가운데 → 큰 원 순서로 놓고, 이미 놓은 이름표·원과 겹치면 뺀다 (누르면 그 원과 이어진 이름은 모두 보인다)
  const short = (t: string) => (t.length > 12 ? `${t.slice(0, 11)}…` : t);
  const labeled = new Set<string>();
  {
    const boxes: [number, number, number, number][] = [];
    const hit = (b: [number, number, number, number]) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = [...nodes].sort((a, b) => (a.id === centerId ? -1 : b.id === centerId ? 1 : b.weight - a.weight));
    for (const n of order.slice(0, Math.min(labelTop, W < 520 ? 14 : labelTop) + (centerId ? 1 : 0))) {
      const i = idx.get(n.id)!;
      const cx = sx(P[i].x), ty = sy(P[i].y) + radius(n) + 12;
      const w = short(n.label).length * 11 * 0.92;
      const b: [number, number, number, number] = [cx - w / 2, ty - 10, cx + w / 2, ty + 3];
      if (n.id !== centerId && hit(b)) continue;
      boxes.push(b);
      labeled.add(n.id);
    }
  }
  const fi = focus ? idx.get(focus) : undefined;
  return (
    <div className="min-w-0">
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
        {groups.filter((g) => nodes.some((n) => n.group === g.key)).map((g) => (
          <li key={g.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />{g.label}</li>
        ))}
      </ul>
      <div ref={ref} className="relative mt-1 min-w-0 select-none overflow-hidden rounded-xl bg-paper" onMouseLeave={() => setFocus(null)}>
        <svg width={W} height={H} role="img" aria-label={ariaLabel} className="block" onClick={(e) => { if (e.target === e.currentTarget) setFocus(null); }}>
          {edges.map((e) => {
            const a = idx.get(e.a), b = idx.get(e.b);
            if (a === undefined || b === undefined) return null;
            const on = !focus || (near.has(e.a) && near.has(e.b) && (e.a === focus || e.b === focus));
            return <line key={`${e.a}|${e.b}`} x1={sx(P[a].x)} y1={sy(P[a].y)} x2={sx(P[b].x)} y2={sy(P[b].y)} stroke={on && focus ? CHART.text : CHART.axis} strokeOpacity={on ? 0.75 : 0.12} strokeWidth={1 + 2.5 * (e.w / maxE)} />;
          })}
          {nodes.map((n, i) => {
            const on = !focus || near.has(n.id);
            const r = radius(n);
            return (
              <g key={n.id} opacity={on ? 1 : 0.2} className="cursor-pointer" onMouseEnter={() => setFocus(n.id)} onClick={() => setFocus(focus === n.id ? null : n.id)}>
                <circle cx={sx(P[i].x)} cy={sy(P[i].y)} r={r + 6} fill="transparent" />
                <circle cx={sx(P[i].x)} cy={sy(P[i].y)} r={r} fill={n.id === centerId ? CHART.ink : color.get(n.group) ?? CHART.ref} stroke="#fff" strokeWidth="2" />
              </g>
            );
          })}
          {/* 이름표는 원 위에 따로 그려 원에 가리지 않게 */}
          <g pointerEvents="none">
            {nodes.map((n, i) => {
              const on = !focus || near.has(n.id);
              if (!(labeled.has(n.id) || focus === n.id || (focus && near.has(n.id)))) return null;
              return (
                <text key={n.id} x={sx(P[i].x)} y={sy(P[i].y) + radius(n) + 12} opacity={on ? 1 : 0.2} textAnchor="middle" fontSize={n.id === centerId ? 12 : 11} fontWeight={n.id === centerId || focus === n.id ? 700 : 500} fill={CHART.ink} stroke="#F5F7FA" strokeWidth="3" paintOrder="stroke">
                  {short(n.label)}
                </text>
              );
            })}
          </g>
        </svg>
        {fi !== undefined && <Tooltip x={sx(P[fi].x)} y={Math.min(sy(P[fi].y) + radius(nodes[fi]) + 18, H - 80)} lines={nodes[fi].tip} width={W} />}
      </div>
    </div>
  );
}
