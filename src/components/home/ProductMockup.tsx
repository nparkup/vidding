"use client";

import { Brand } from "@/components/BrandText";
import { useState } from "react";
import type { Digest } from "@/lib/digest";
import type { MatchResult } from "@/lib/analysis";
import type { EngineId } from "@/lib/engines";
import { dday, won } from "@/lib/format";
import { GradeBadge } from "../Badges";
import { ScrollRow } from "@/components/ScrollRow";

/** 오른쪽 분석 패널에 쓰는 낙찰 결과 기반 값 (빌드 때 공고별 낙찰 결과 분석으로 계산, 없으면 비움) */
export interface MockInsight {
  /** 예정가격 ÷ 기초금액 (%) 예상과 근거 */
  pre?: { value: number; basis: string };
  /** 투찰률 기준: 적격은 과거 낙찰자 투찰률, 협상은 예상 최저 경쟁 투찰률 */
  rate?: { label: string; value: number; basis: string };
  /** 예상 참가 업체 수 [적게, 보통, 많게] */
  bidders?: [number, number, number];
  /** 경쟁 강도 */
  level?: string;
  /** 이 공고의 직전 낙찰 */
  prior?: { date: string; rate: number; bidders: number };
}

export interface MockupCase {
  label: string;
  digest: Digest;
  top?: MatchResult;
  insight?: MockInsight;
}

const MENU: { engine: EngineId; items: string[] }[] = [
  { engine: "finder", items: ["맞춤 공고", "나라장터 입찰 공고", "공동주택 입찰 공고 K-apt", "누리장터 입찰 공고", "정정·취소 공고"] },
  { engine: "atlas", items: ["발주처 분석", "경쟁사 투찰 성향"] },
  { engine: "insight", items: ["나라장터 입찰 예측"] },
];

const pct = (n: number) => `${n.toFixed(3)}%`;
/** 금액 = 기초금액 × 비율 (사이트 다른 화면과 같은 기준) */
const amt = (base: number, rate: number) => won(Math.floor((base * rate) / 100));

/** 히어로 아래 큰 제품 화면 미리보기. 업종이 다른 예시 고객사를 탭으로 바꿔 본다 (실제 공고 데이터로 채움) */
export function ProductMockup({ cases }: { cases: MockupCase[] }) {
  const [k, setK] = useState(0);
  const { digest, top, insight } = cases[k];
  const rows = digest.recommended.slice(0, 4);
  const b = top?.bid;
  const base = b?.baseAmount ?? 0;
  const kv: [string, string, string?][] = b
    ? [
        ["기초금액", won(base)],
        ...(b.lowerLimitRate ? [["낙찰하한율", pct(b.lowerLimitRate), `하한 금액 ${amt(base, b.lowerLimitRate)}`] as [string, string, string]] : []),
        ...(insight?.pre ? [["예상 사정율", pct(insight.pre.value), `예상 예정가격 ${amt(base, insight.pre.value)}`] as [string, string, string]] : []),
        ...(insight?.rate ? [[insight.rate.label, pct(insight.rate.value), `투찰금액 ${amt(base, insight.rate.value)}`] as [string, string, string]] : []),
      ]
    : [];
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white text-left shadow-lift sm:rounded-3xl">
      {/* 브라우저 바 */}
      <div className="flex items-center gap-2 border-b border-ink-100 bg-paper px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="mx-auto hidden w-1/2 truncate rounded-lg bg-white px-3 py-1 text-center text-xs text-ink-400 ring-1 ring-ink-100 sm:block">
          <Brand tail="매트릭스" /> · {digest.client.company} 전용 공고함
        </span>
      </div>

      <ScrollRow active={k} role="tablist" aria-label="예시 고객사 업종" className="flex gap-1.5 border-b border-ink-100 px-4 py-2.5">
        <span className="hidden shrink-0 self-center pr-1 text-[11px] font-semibold text-ink-300 sm:block">예시 고객사</span>
        {cases.map((c, n) => (
          <button
            key={c.label}
            role="tab"
            aria-selected={n === k}
            onClick={() => setK(n)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${n === k ? "bg-ink text-white" : "bg-paper text-ink-500 hover:text-ink"}`}
          >
            {c.label}
          </button>
        ))}
      </ScrollRow>

      <div className="grid md:grid-cols-[200px_1fr] lg:grid-cols-[200px_1fr_300px]">
        {/* 사이드바: 실제 상단 메뉴와 같은 이름, 묶음 사이는 선으로만 나눈다 */}
        <aside className="hidden border-r border-ink-100 p-4 md:block">
          {MENU.map((g) => (
            <div key={g.engine} className="border-t border-ink-100 pt-2 mt-2 first:mt-0 first:border-t-0 first:pt-0">
              <ul className="space-y-0.5 text-[13px]">
                {g.items.map((t, i) => {
                  const on = g.engine === "finder" && i === 0;
                  return (
                    <li key={t} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${on ? "bg-mint-50 font-semibold text-mint-700" : "text-ink-500"}`}>
                      <span className="min-w-0 flex-1 truncate">{t}</span>
                      {on && <span className="rounded-full bg-mint px-1.5 text-[11px] font-bold text-white">{digest.recommended.length}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="mt-5 rounded-2xl bg-ink p-3 text-white">
            <p className="text-[11px] text-ink-300">마감 알림</p>
            <p className="mt-0.5 text-sm font-semibold">{digest.closingSoon.length ? `3일 내 마감 ${digest.closingSoon.length}건` : "3일 내 마감 공고 없음"}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-200">공고마다 제출 서류 목록을 함께 확인하세요.</p>
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-400">오전 7:00 업데이트 · 면허·지역·규모 1차 선별</p>
              <p className="font-bold">오늘의 맞춤 공고</p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-ink-100 px-3 py-1.5 text-xs text-ink-400 sm:flex">
              공고명·기관 검색
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["참가 가능 신규 공고", digest.newToday, "text-mint-600 bg-mint-50"],
              ["3일 내 마감", digest.closingSoon.length, "text-coral bg-coral-100/60"],
            ].map(([t, v, c]) => (
              <div key={String(t)} className={`rounded-xl p-3 ${c}`}>
                <p className="text-xl font-extrabold tabular-nums sm:text-2xl">{Number(v).toLocaleString()}</p>
                <p className="text-[11px] text-ink-500">{t}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100">
            {rows.map((r, i) => (
              <li key={r.bid.id} className={`flex items-start gap-3 px-3 py-3 sm:px-4 ${i === 0 ? "bg-mint-50/50" : ""}`}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug">{r.bid.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-400">{r.bid.demandAgency} · 마감 {dday(r.daysLeft)}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded-md bg-ink-100/70 px-1.5 py-0.5 font-semibold text-ink-500">{r.bid.contractMethod}</span>
                    <span className="rounded-md bg-ink-100/70 px-1.5 py-0.5 tabular-nums text-ink-500">기초금액 {won(r.bid.baseAmount)}</span>
                    {r.bid.lowerLimitRate ? <span className="rounded-md bg-ink-100/70 px-1.5 py-0.5 tabular-nums text-ink-500">하한율 {pct(r.bid.lowerLimitRate)}</span> : null}
                  </span>
                </span>
                <GradeBadge grade={r.grade} />
              </li>
            ))}
          </ul>
        </div>

        {/* 우측 분석 패널: 1순위 공고 */}
        {top && b && (
          <div className="hidden border-l border-ink-100 bg-paper/60 p-5 lg:block">
            <p className="text-[11px] font-bold text-ink-400">1순위 공고 분석</p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{b.title}</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-xs text-ink-400">입찰 가능성</p>
              <p className="flex items-end gap-2">
                <span className="text-3xl font-extrabold leading-none tracking-tight text-mint-600 tabular-nums">{top.score}</span>
                <GradeBadge grade={top.grade} />
              </p>
            </div>

            <dl className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white text-xs">
              {kv.map(([t, v, sub]) => (
                <div key={t} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-500">{t}</dt>
                    <dd className="font-bold tabular-nums text-ink">{v}</dd>
                  </div>
                  {sub && <p className="mt-0.5 text-right text-[11px] tabular-nums text-ink-400">{sub}</p>}
                </div>
              ))}
              {insight?.bidders && (
                <div className="flex items-baseline justify-between gap-2 px-3 py-2">
                  <dt className="text-ink-500">예상 참가 업체</dt>
                  <dd className="font-bold tabular-nums text-ink">
                    {insight.bidders[0] === insight.bidders[2] ? `${insight.bidders[1]}곳` : `${insight.bidders[0]}~${insight.bidders[2]}곳`}
                    {insight.level && <span className="ml-1.5 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">{insight.level}</span>}
                  </dd>
                </div>
              )}
              {insight?.prior && insight.prior.rate > 0 && (
                <div className="flex items-baseline justify-between gap-2 px-3 py-2">
                  <dt className="text-ink-500">직전 낙찰</dt>
                  <dd className="font-bold tabular-nums text-ink">{insight.prior.date.slice(0, 7).replace("-", ".")} · {insight.prior.rate.toFixed(3)}%</dd>
                </div>
              )}
            </dl>

            <p className="mt-4 text-[11px] font-bold text-ink-400">가능성 점수 근거</p>
            <ul className="mt-2 space-y-2">
              {top.factors.slice(0, 5).map((f) => {
                const p = Math.round((f.score / f.max) * 100);
                return (
                  <li key={f.label}>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="font-semibold text-ink-500">{f.label}</span>
                      <span className="tabular-nums text-ink-400">{f.score} / {f.max}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className={`h-full rounded-full ${p >= 70 ? "bg-mint" : p >= 40 ? "bg-amber" : "bg-coral"}`} style={{ width: `${p}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
