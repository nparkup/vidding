"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GROUP_OF, IndustryDetail, loadJson } from "@/components/analysis/IndustryExplorer";
import { Tile } from "@/components/analysis/AgencyExplorer";
import { MoreButton } from "@/components/analysis/MoreList";
import { CHART } from "@/components/charts/useWidth";
import { isVagueAgency, recentFrom } from "@/lib/awards/agency";
import { RECENT, industryId, periodLabel, type FirmStat, type IndustrySummary } from "@/lib/awards/industry";
import type { AwardWin } from "@/lib/awards/read";
import { classify } from "@/lib/classify";
import { won } from "@/lib/format";
import type { BizType, ServiceCategory } from "@/lib/types";

/** 조회한 업체가 낙찰받은 업종 하나 (낙찰 건수 많은 순) */
export interface CorpIndustry {
  cat: ServiceCategory;
  /** 저장 기간 전체 낙찰 건수·금액 */
  n: number;
  amount: number;
  /** 최근 RECENT_YEARS년 낙찰 건수·금액 (업종별 분석의 최근 기간과 맞춰 보기 위함) */
  n4: number;
  amount4: number;
  share: number;
}

const BIZ: Record<string, BizType> = { 용역: "용역", 공사: "공사", 물품: "물품", 외자: "외자" };

/**
 * 낙찰 공고마다 업종별 분석과 같은 규칙(공고명·투찰 가능 업종, src/lib/classify.ts)으로 업종을 매기고
 * 낙찰 건수가 많은 순으로 모은다. 같은 공고가 두 줄이면 한 번만 센다.
 */
export function corpIndustries(wins: AwardWin[]): CorpIndustry[] {
  const seen = new Set<string>();
  const since = recentFrom(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const m = new Map<ServiceCategory, CorpIndustry>();
  let total = 0;
  for (const w of wins) {
    if (seen.has(w.bidNtceNo)) continue;
    seen.add(w.bidNtceNo);
    const biz = BIZ[w.biz ?? ""] ?? (w.cls?.mainWork ? "공사" : "용역");
    const cat = classify(w.title, w.lic ?? "", biz);
    const v = m.get(cat) ?? m.set(cat, { cat, n: 0, amount: 0, n4: 0, amount4: 0, share: 0 }).get(cat)!;
    v.n++; v.amount += w.amount;
    if (w.date >= since) { v.n4++; v.amount4 += w.amount; }
    total++;
  }
  return [...m.values()].map((v) => ({ ...v, share: total ? v.n / total : 0 })).sort((a, b) => b.n - a.n || b.amount - a.amount);
}

const pctOf = (x: number) => (x >= 0.995 ? "100%" : x < 0.01 ? "1% 미만" : `${Math.round(x * 100)}%`);
const normName = (s: string) => s.replace(/\s+|주식회사|\(주\)|㈜|\(유\)|유한회사|\(합\)|합자회사/g, "");

/** 진단 맨 위 카드에 넣는 한 줄: 이 업체의 업종 (비중 순) */
export function CorpIndustryLine({ list }: { list: CorpIndustry[] }) {
  if (!list.length) return null;
  const top = list.slice(0, 3);
  return (
    <div className="mt-4 rounded-xl bg-mint-50 px-4 py-3">
      <p className="text-xs font-semibold text-mint-700">이 회사의 업종 <span className="font-normal text-ink-500">낙찰 공고 기준, 비중 순</span></p>
      <p className="mt-1 text-sm leading-relaxed">
        <span className="text-lg font-extrabold">{list[0].cat}</span>
        <span className="ml-1.5 text-ink-500">{GROUP_OF[list[0].cat]} · 낙찰 {list[0].n.toLocaleString()}건 ({pctOf(list[0].share)})</span>
      </p>
      {top.length > 1 && (
        <p className="mt-0.5 text-xs text-ink-500">그 밖에 {top.slice(1).map((c) => `${c.cat} ${pctOf(c.share)}`).join(", ")}{list.length > 3 ? ` 외 ${list.length - 3}개 업종` : ""}</p>
      )}
      <a href="#mine-industry" className="mt-2 inline-block text-sm font-semibold text-mint-700 underline-offset-2 hover:underline">이 업종의 업종별 분석 보기</a>
    </div>
  );
}

/** 우리 회사 진단 아래쪽: 이 회사가 속한 업종들 + 고른 업종의 업종별 분석 */
export function MineIndustry({ list, name }: { list: CorpIndustry[]; name: string }) {
  const [cat, setCat] = useState<ServiceCategory | "">(list[0]?.cat ?? "");
  useEffect(() => { setCat(list[0]?.cat ?? ""); }, [list]);
  const [sum, setSum] = useState<IndustrySummary | null | undefined>();
  const [agencyIds, setAgencyIds] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    loadJson<[string, string, number][]>("/agency-data/index.json").then((l) => setAgencyIds(new Map((l ?? []).map(([n, id]) => [n, id])))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!cat) return;
    let alive = true;
    setSum(undefined);
    loadJson<IndustrySummary>(`/industry-data/${industryId(cat)}.json`).then((s) => alive && setSum(s && { ...s, agencies: s.agencies.filter(([a]) => !isVagueAgency(a)) })).catch(() => alive && setSum(null));
    return () => { alive = false; };
  }, [cat]);
  const me = list.find((c) => c.cat === cat);
  // 자주 낙찰받은 업체 순위: 업종 요약 목록에 없으면 최근 기간의 긴 업체 목록(/industry-period/{id}-{기간}-firms.json)에서 찾는다
  const [firms, setFirms] = useState<FirmStat[] | null>(null);
  useEffect(() => {
    if (!cat) return;
    let alive = true;
    setFirms(null);
    loadJson<FirmStat[]>(`/industry-period/${industryId(cat)}-${RECENT}-firms.json`).then((l) => alive && setFirms(l ?? [])).catch(() => alive && setFirms([]));
    return () => { alive = false; };
  }, [cat]);
  const place = useMemo(() => {
    if (!sum || !name) return undefined;
    const k = normName(name);
    const pool: [string, number, number, ...unknown[]][] = firms && firms.length > sum.winners.length ? firms : sum.winners;
    const byCount = [...pool].sort((a, b) => b[1] - a[1] || b[2] - a[2]);
    const i = byCount.findIndex(([n]) => normName(n) === k);
    return i >= 0 ? i + 1 : 0;
  }, [sum, name, firms]);
  const [shown, setShown] = useState(8);
  if (!list.length || !cat) return null;
  const ind4 = sum ? sum.groups.reduce((a, g) => a + g.n, 0) : 0;
  const indAmt4 = sum ? sum.groups.reduce((a, g) => a + g.amount, 0) : 0;
  const max = Math.max(1, ...list.map((c) => c.n));
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`;
  return (
    <div id="mine-industry" className="scroll-mt-24 space-y-6">
      <section className="card p-6">
        <h3 className="font-bold">이 회사가 속한 업종 <span className="text-sm font-normal text-ink-400">업종별 분석 21개 업종 기준</span></h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">낙찰받은 공고마다 공고명과 투찰 가능 업종으로 공고 검색·업종별 분석과 같은 규칙에 따라 업종을 매겼습니다.<br />업종을 누르면 아래에 그 업종의 업종별 분석이 나옵니다.</p>
        <ol className="mt-3 divide-y divide-ink-100">
          {list.slice(0, shown).map((c) => {
            const on = c.cat === cat;
            return (
              <li key={c.cat} className="min-w-0 py-2">
                <button type="button" aria-pressed={on} onClick={() => setCat(c.cat)} className="block w-full min-w-0 text-left text-sm">
                  <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className={`min-w-0 break-keep font-semibold ${on ? "text-mint-700" : ""}`}>{c.cat} <span className="text-xs font-normal text-ink-400">{GROUP_OF[c.cat]}</span></span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-500">{c.n.toLocaleString()}건 · {pctOf(c.share)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-ink-500">낙찰금액 {won(c.amount)}</span>
                  <span className="mt-1 block h-2 rounded-full bg-paper">
                    <span className="block h-2 rounded-full" style={{ width: `${Math.max(1.5, (c.n / max) * 100)}%`, background: on ? CHART.cat[0] : CHART.cat[2] }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <MoreButton left={list.length - shown} step={8} unit="개 업종" onClick={() => setShown((v) => v + 8)} />
      </section>

      <section className="card p-6">
        <p className="text-xs font-semibold text-ink-400">업종별 분석</p>
        {list.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="업종">
            {list.map((c) => (
              <button key={c.cat} type="button" aria-pressed={c.cat === cat} onClick={() => setCat(c.cat)} className={chip(c.cat === cat)}>{c.cat}</button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold tracking-tight">{cat}</h2>
          <Link href={`/analysis/industry?cat=${encodeURIComponent(cat)}`} className="text-sm font-semibold text-mint-700 underline-offset-2 hover:underline">업종별 분석 화면에서 보기</Link>
        </div>
        {sum && <p className="mt-1 text-sm text-ink-500">{GROUP_OF[cat]} · 나라장터 낙찰 {sum.n.toLocaleString()}건 · {sum.from} ~ {sum.to}</p>}
        {sum === undefined && <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
        {sum === null && <p className="mt-3 text-sm text-ink-500">이 업종의 낙찰 분석을 아직 만들지 못했습니다. 다음 정기 갱신 뒤 다시 확인해 주세요.</p>}
        {sum && (
          <>
            <p className="mt-4 text-sm font-semibold">이 업종에서 {name || "이 회사"}의 자리 <span className="font-normal text-ink-400">{periodLabel(RECENT)}</span></p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k="이 회사 낙찰" v={`${(me?.n4 ?? 0).toLocaleString()}건`} sub={ind4 ? `업종 전체 ${ind4.toLocaleString()}건 중 ${pctOf((me?.n4 ?? 0) / ind4)}` : undefined} />
              <Tile wide k="이 회사 낙찰금액" v={won(me?.amount4 ?? 0)} sub={indAmt4 ? `업종 전체 ${won(indAmt4)} 중 ${pctOf((me?.amount4 ?? 0) / indAmt4)}` : undefined} />
              <Tile k="자주 낙찰받은 업체 순위" v={place ? `${place}위` : "순위 밖"} sub={place ? `낙찰 건수 기준, 업체 ${sum.firms.toLocaleString()}곳 중` : firms === null ? "순위 찾는 중" : `낙찰 많은 업체 ${Math.max(firms.length, sum.winners.length).toLocaleString()}곳 안에 없음`} />
            </dl>
            <p className="mt-4 text-sm font-semibold">업종 전체</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k={`${periodLabel(RECENT)} 낙찰`} v={`${ind4.toLocaleString()}건`} />
              <Tile wide k={`${periodLabel(RECENT)} 낙찰금액`} v={won(indAmt4)} />
              <Tile k="낙찰받은 업체" v={`${sum.firms.toLocaleString()}곳`} sub={`${periodLabel(RECENT)}, 서로 다른 업체`} />
              <Tile k="단독 참가 비율" v={`${Math.round(sum.single * 100)}%`} sub="참가 1곳 낙찰" />
            </dl>
          </>
        )}
      </section>

      {sum && <IndustryDetail key={cat} s={sum} bids={[]} agencyIds={agencyIds} embedded />}
    </div>
  );
}
