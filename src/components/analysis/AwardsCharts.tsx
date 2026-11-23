"use client";

import { useMemo, useState } from "react";
import { ColumnChart, MetricToggle } from "@/components/charts/ColumnChart";
import { NetworkGraph, type NetEdge, type NetNode } from "@/components/charts/NetworkGraph";
import { CHART } from "@/components/charts/useWidth";
import { won, wonAxis } from "@/lib/format";
import type { RecentAwardRow } from "@/lib/recentAwards";

/** 최근 낙찰 결과: 지금 조건에 맞는 낙찰의 날짜별 건수·금액, 낙찰률 분포, 수요기관·낙찰업체 관계도 */
export function AwardsCharts({ rows }: { rows: RecentAwardRow[] }) {
  const [m, setM] = useState<"n" | "amt">("n");
  const [net, setNet] = useState(false);
  const days = useMemo(() => {
    const d = new Map<string, [number, number]>();
    for (const r of rows) { const v = d.get(r[5]) ?? [0, 0]; v[0]++; v[1] += r[9]; d.set(r[5], v); }
    return [...d.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const hist = useMemo(() => {
    const lo = 80, w = 1;
    const bins = Array.from({ length: 20 }, (_, i) => ({ lo: lo + i * w, n: 0 }));
    let under = 0;
    for (const r of rows) {
      if (!(r[10] > 0 && r[10] <= 101)) continue;
      if (r[10] < lo) { under++; continue; }
      bins[Math.min(19, Math.floor((r[10] - lo) / w))].n++;
    }
    return { bins, under };
  }, [rows]);
  if (rows.length < 3) return null;
  const rated = hist.bins.reduce((a, b) => a + b.n, 0);
  return (
    <section className="card mt-3 p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">낙찰일별 {m === "n" ? "건수" : "낙찰금액 합계"} <span className="font-normal text-ink-400">지금 조건 {rows.length.toLocaleString()}건</span></p>
            <MetricToggle value={m} onChange={setM} options={[["n", "건수"], ["amt", "금액"]]} />
          </div>
          <ColumnChart
            ariaLabel="낙찰일별 낙찰" height={170}
            fmt={m === "n" ? (v) => `${Math.round(v).toLocaleString()}건` : wonAxis}
            cols={days.map(([d, [n, a]]) => ({ key: d, label: `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`, value: m === "n" ? n : a, tip: [d, `낙찰 ${n.toLocaleString()}건`, `낙찰금액 ${won(a)}`] }))}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">낙찰률 분포 <span className="font-normal text-ink-400">예정가격 대비, 1%p 구간 · {rated.toLocaleString()}건{hist.under ? ` (80% 미만 ${hist.under.toLocaleString()}건 제외)` : ""}</span></p>
          <ColumnChart
            ariaLabel="낙찰률 분포" height={170}
            fmt={(v) => `${Math.round(v).toLocaleString()}건`}
            cols={hist.bins.map((b) => ({ key: String(b.lo), label: `${b.lo}%`, value: b.n, tip: [`낙찰률 ${b.lo}% ~ ${b.lo + 1}% 미만`, `${b.n.toLocaleString()}건 (${rated ? Math.round((b.n / rated) * 100) : 0}%)`] }))}
          />
        </div>
      </div>
      <div className="mt-4 border-t border-ink-100 pt-3">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setNet((v) => !v)} aria-expanded={net}>{net ? "관계도 접기" : "수요기관·낙찰업체 관계도 보기"}</button>
        {net && <AwardNetwork rows={rows} />}
      </div>
    </section>
  );
}

/** 낙찰 많은 수요기관 10곳과 그 기관에서 낙찰받은 업체(여러 기관에서 받은 업체 먼저) */
function AwardNetwork({ rows }: { rows: RecentAwardRow[] }) {
  const g = useMemo(() => {
    const ag = new Map<string, { n: number; amt: number }>();
    for (const r of rows) { const v = ag.get(r[4]) ?? { n: 0, amt: 0 }; v.n++; v.amt += r[9]; ag.set(r[4], v); }
    const top = [...ag.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const tops = new Set(top.map(([a]) => a));
    const win = new Map<string, { n: number; amt: number; ags: Map<string, number> }>();
    for (const r of rows) {
      if (!tops.has(r[4]) || !r[7]) continue;
      const v = win.get(r[7]) ?? { n: 0, amt: 0, ags: new Map() };
      v.n++; v.amt += r[9]; v.ags.set(r[4], (v.ags.get(r[4]) ?? 0) + 1); win.set(r[7], v);
    }
    const ws = [...win.entries()].sort((a, b) => b[1].ags.size - a[1].ags.size || b[1].n - a[1].n).slice(0, 26);
    const nodes: NetNode[] = [
      ...top.map(([a, v]): NetNode => ({ id: `a:${a}`, label: a, group: "ag", weight: v.n, tip: [a, `낙찰 ${v.n.toLocaleString()}건 · ${won(v.amt)}`] })),
      ...ws.map(([w, v]): NetNode => ({ id: `w:${w}`, label: w, group: v.ags.size > 1 ? "multi" : "win", weight: v.n, tip: [w, `낙찰 ${v.n}건 · ${won(v.amt)}`, ...(v.ags.size > 1 ? [`${v.ags.size}개 기관에서 낙찰`] : [])] })),
    ];
    const edges: NetEdge[] = ws.flatMap(([w, v]) => [...v.ags.entries()].map(([a, c]) => ({ a: `a:${a}`, b: `w:${w}`, w: c })));
    return { nodes, edges };
  }, [rows]);
  return (
    <div className="mt-3">
      <NetworkGraph
        nodes={g.nodes} edges={g.edges} ariaLabel="수요기관과 낙찰업체 관계도" labelTop={18}
        groups={[{ key: "ag", label: "수요기관 (낙찰 많은 10곳)", color: CHART.cat[2] }, { key: "multi", label: "여러 기관에서 낙찰받은 업체", color: CHART.cat[0] }, { key: "win", label: "한 기관에서 낙찰받은 업체", color: CHART.cat[1] }]}
      />
      <p className="mt-2 text-xs leading-relaxed text-ink-500">지금 조건(업무·기간·검색어 등)에 맞는 낙찰로 그립니다. 검색어로 업종을 좁히면(예: 청소, 급식) 그 시장에서 여러 기관을 함께 가져가는 업체가 잘 보입니다. 원을 누르면 이어진 곳만 진하게 보입니다.</p>
    </div>
  );
}
