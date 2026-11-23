"use client";

import { useState } from "react";
import { won, wonAxis } from "@/lib/format";
import { ColumnChart, MetricToggle } from "./ColumnChart";

/** 연도별 낙찰 건수·금액 (전환 버튼으로 하나씩). years: [연도, 건수, 금액(원), 평균 참가업체?] */
export function YearChart({ years, title }: { years: (readonly [number, number, number, number?])[]; title: string }) {
  const [m, setM] = useState<"n" | "amt">("n");
  if (!years.length) return null;
  const thisYear = new Date().getFullYear();
  return (
    <div className="mt-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title} <span className="font-normal text-ink-400">{m === "n" ? "건수" : "낙찰금액 합계"}</span></p>
        <MetricToggle value={m} onChange={setM} options={[["n", "건수"], ["amt", "금액"]]} />
      </div>
      <ColumnChart
        ariaLabel={`${title} ${m === "n" ? "건수" : "금액"}`}
        fmt={m === "n" ? (v) => `${Math.round(v).toLocaleString()}건` : wonAxis}
        cols={years.map(([y, n, a, avg]) => ({
          key: String(y), label: `${String(y).slice(2)}년`, value: m === "n" ? n : a, hot: y === thisYear,
          tip: [`${y}년${y === thisYear ? " (올해, 진행 중)" : ""}`, `낙찰 ${n.toLocaleString()}건`, `낙찰금액 ${won(a)}`, ...(avg ? [`평균 참가 ${avg}곳`] : [])],
        }))}
      />
    </div>
  );
}
