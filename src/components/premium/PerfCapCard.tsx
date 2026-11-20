"use client";

import { useMemo } from "react";
import type { CompanyInput, EvalSheet } from "@/lib/evalscore";
import { won } from "@/lib/format";
import { sheetPerfCap } from "@/lib/perfCap";
import type { Bid } from "@/lib/types";

/** 결과 패널: 지금 실적으로 이 공고 평가표에서 실적 만점·통과가 되는 최대 공고 금액 */
export function PerfCapCard({ sheet, bid, co }: { sheet: EvalSheet; bid: Bid; co: CompanyInput }) {
  const cap = useMemo(() => sheetPerfCap(sheet, bid, co), [sheet, bid, co]);
  if (!cap.full && !cap.pass) return null;
  const amtLabel = sheet.refAmount ? "추정가격" : "기초금액";
  return (
    <section className="card mt-4 p-6">
      <h3 className="font-bold">실적으로 참가 가능한 금액</h3>
      <p className="mt-1 text-xs text-ink-500">지금 넣은 유사 실적 {won(co.pastPerformance)}으로 이 공고와 같은 평가 기준의 공고를 볼 때, {amtLabel}이 얼마까지인 공고에서 점수가 나오는지 계산했습니다.</p>
      <dl className="mt-3 space-y-2 text-sm">
        {cap.full && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-500">실적 만점 최대 금액</dt>
            <dd className="font-bold tabular-nums">{won(cap.full)}</dd>
          </div>
        )}
        {cap.pass && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-500">통과 가능한 최대 금액 <span className="text-xs">(가격 만점 가정)</span></dt>
            <dd className="font-bold tabular-nums">{won(cap.pass)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-2">
          <dt className="text-ink-500">이 공고 {amtLabel}</dt>
          <dd className={`font-bold tabular-nums ${cap.full && cap.current > cap.full ? "text-coral" : ""}`}>{won(cap.current)}</dd>
        </div>
      </dl>
      {cap.full && cap.current > cap.full && <p className="mt-2 text-xs text-coral">이 공고는 실적 만점 금액을 넘습니다. 공동수급으로 실적을 합치면 만점에 가까워질 수 있습니다.</p>}
    </section>
  );
}
