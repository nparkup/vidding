"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { evaluate } from "@/lib/analysis";
import type { Bid, License, Region } from "@/lib/types";
import { GradeBadge, ScoreBar } from "./Badges";

/** URL의 내 조건(lic, rg, min, max)으로 입찰 가능성 점수를 브라우저에서 계산 */
export function ProfileScore({ bid }: { bid: Bid }) {
  const sp = useSearchParams();
  const lic = (sp.get("lic") ?? "").split(",").filter(Boolean) as License[];
  const rg = (sp.get("rg") ?? "").split(",").filter(Boolean) as Region[];
  if (!lic.length) {
    return (
      <div className="mt-4 rounded-xl bg-paper p-4 text-sm text-ink-500">
        귀사 조건을 입력하면 이 공고의 참가 가능 여부와 점수를 계산해 드립니다.
        <Link href="/bids" className="mt-3 block font-semibold text-mint-600">공고 검색에서 조건 입력 →</Link>
      </div>
    );
  }
  const max = Number(sp.get("max") ?? 1e10);
  const ev = evaluate(bid, { licenses: lic, regions: rg, minAmount: Number(sp.get("min") ?? 0), maxAmount: max, pastPerformance: max });
  return (
    <>
      <div className="mt-4 flex items-end justify-between">
        <p className="text-5xl font-extrabold tabular-nums text-mint">{ev.score}<span className="text-lg text-ink-300">/100</span></p>
        <GradeBadge grade={ev.grade} />
      </div>
      <ul className="mt-5 space-y-4">
        {ev.factors.map((f) => (
          <li key={f.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-semibold">{f.label}</span>
              <span className="tabular-nums text-ink-300">{f.score}/{f.max}</span>
            </div>
            <ScoreBar value={f.score} max={f.max} />
            <p className="mt-1 text-xs text-ink-500">{f.note}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
