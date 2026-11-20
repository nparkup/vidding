"use client";

import { useMemo, useState } from "react";
import { aValueOf, assessStats } from "@/lib/awards/assess";
import type { AwardAnalysis } from "@/lib/awards/analysis";
import { wonFull } from "@/lib/format";
import type { NoticeInfo } from "@/lib/noticeInfo";
import type { Bid } from "@/lib/types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 적격심사 결과 패널: 통과 가능한 투찰률과 그 투찰금액.
 * 투찰금액 = A값 + (예상 예정가격 − A값) × 투찰률. 예상 예정가격 = 기초금액 × 고른 사정율 (같은 기관 과거 사정율에서 고른다).
 * 통과 범위의 가장 낮은 금액이 적격심사에서 가장 먼저 심사받는 최적 투찰금액이다
 */
export function PassAmount({ bid, window, info, analysis }: { bid: Bid; window: { low: number; high: number }; info?: NoticeInfo; analysis?: AwardAnalysis | null }) {
  const st = useMemo(() => assessStats(analysis?.assess, info?.baseRange, bid.postedAt.slice(0, 10)), [analysis, info?.baseRange, bid.postedAt]);
  const options = useMemo(() => {
    const o: { key: string; label: string; ratio: number }[] = [];
    st?.windows.forEach((w, i) => o.push({ key: `w${i}`, label: `추천 구간 ${i + 1} (${r3((w.lo + w.hi) / 2).toFixed(3)}%)`, ratio: r3((w.lo + w.hi) / 2) }));
    if (st) o.push({ key: "median", label: `과거 가운데 값 (${st.q[2].toFixed(3)}%)`, ratio: st.q[2] });
    o.push({ key: "100", label: "100% (기초금액 그대로)", ratio: 100 });
    return o;
  }, [st]);
  const [key, setKey] = useState<string>("");
  const pick = options.find((o) => o.key === key) ?? options[0];
  const base = info?.base ?? bid.baseAmount;
  const aVal = aValueOf(info?.aParts);
  const plan = base > 0 ? (base * pick.ratio) / 100 : 0;
  const amt = (rate: number) => Math.ceil(aVal + (plan - aVal) * (rate / 100));

  return (
    <div className="mt-4 rounded-xl bg-white/5 p-3">
      <p className="text-xs text-ink-300">통과 가능한 투찰률</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{window.low}% ~ {window.high}%</p>
      {plan > 0 && (
        <>
          <p className="mt-3 text-xs text-ink-300">최적 투찰금액 (통과 범위에서 가장 낮은 금액)</p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-mint-300">{wonFull(amt(window.low))}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-300">통과 범위 {wonFull(amt(window.low))} ~ {wonFull(amt(window.high))}</p>
          <label className="mt-3 block text-xs text-ink-300">
            예상 사정율 (예정가격 ÷ 기초금액)
            <select value={pick.key} onChange={(e) => setKey(e.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-2 py-1.5 text-sm text-white">
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-relaxed text-ink-300">
            예상 예정가격 {wonFull(Math.round(plan))} = {info?.base ? "기초금액" : "공고 금액(기초금액 미공개)"} {wonFull(base)} × {pick.ratio.toFixed(3)}%
            {aVal > 0 ? ` · A값 ${wonFull(aVal)}은 그대로 더함` : ""}. 예정가격은 개찰 때 정해지므로 금액은 참고용입니다.
          </p>
        </>
      )}
    </div>
  );
}
