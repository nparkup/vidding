"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { rank } from "@/lib/analysis";
import { dday, won } from "@/lib/format";
import type { Bid, License, Region } from "@/lib/types";
import { GradeBadge } from "./Badges";

const DEMO_LICENSES: License[] = ["건물위생관리업", "소독업", "시설경비업", "기계설비유지관리업", "소방시설관리업", "저수조청소업"];
const DEMO_REGIONS: Region[] = ["서울", "경기", "인천", "대전", "충남", "부산", "대구", "광주", "강원"];
const SIZES = [
  { label: "1억 이하", min: 0, max: 100_000_000 },
  { label: "1~5억", min: 50_000_000, max: 500_000_000 },
  { label: "5~20억", min: 300_000_000, max: 2_000_000_000 },
  { label: "규모 무관", min: 0, max: 10_000_000_000 },
];

export function MatchDemo({ bids }: { bids: Bid[] }) {
  const [lic, setLic] = useState<License[]>(["건물위생관리업", "소독업"]);
  const [rg, setRg] = useState<Region[]>(["경기", "서울", "인천"]);
  const [size, setSize] = useState(1);

  const results = useMemo(
    () => rank(bids, { licenses: lic, regions: rg, minAmount: SIZES[size].min, maxAmount: SIZES[size].max, pastPerformance: SIZES[size].max }),
    [bids, lic, rg, size],
  );
  const eligible = results.filter((r) => r.eligible);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const qs = new URLSearchParams({ lic: lic.join(","), rg: rg.join(","), min: String(SIZES[size].min), max: String(SIZES[size].max) });

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5 border-b border-ink-100 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div>
            <p className="label">보유 면허</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_LICENSES.map((l) => (
                <button key={l} type="button" onClick={() => setLic(toggle(lic, l))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${lic.includes(l) ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">영업 지역</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_REGIONS.map((r) => (
                <button key={r} type="button" onClick={() => setRg(toggle(rg, r))}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${rg.includes(r) ? "border-mint bg-mint text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">수행 가능 규모</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {SIZES.map((s, i) => (
                <button key={s.label} type="button" onClick={() => setSize(i)}
                  className={`rounded-lg border px-2 py-2 text-sm transition ${size === i ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-paper/60 p-5 sm:p-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm text-ink-500">이번 주 참가 가능한 공고</p>
              <p className="text-4xl font-extrabold tabular-nums">
                {eligible.length}
                <span className="ml-1 text-lg font-bold text-ink-300">/ {results.length}건</span>
              </p>
            </div>
            <p className="text-right text-xs text-ink-500">
              면허·지역·규모가 안 맞는
              <br />
              <b className="text-coral">{results.length - eligible.length}건</b>은 자동 제외
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {eligible.slice(0, 3).map((r) => (
              <li key={r.bid.id} className="rounded-xl border border-ink-100 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{r.bid.title}</p>
                  <GradeBadge grade={r.grade} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {r.bid.demandAgency} · {won(r.bid.baseAmount)} · 마감 {dday(r.daysLeft)}
                </p>
              </li>
            ))}
            {eligible.length === 0 && (
              <li className="rounded-xl border border-dashed border-ink-100 bg-white p-6 text-center text-sm text-ink-500">
                조건에 맞는 공고가 없어요. 면허나 지역을 넓혀 보세요.
              </li>
            )}
          </ul>
          <Link href={`/bids?${qs}`} className="btn-primary mt-4 w-full">
            내 조건으로 전체 공고 분석 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
