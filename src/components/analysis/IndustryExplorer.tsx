"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BidRow } from "@/components/BidRow";
import { CategoryTiles } from "@/components/CategoryTiles";
import { AssessCard, GroupShare, MethodTable, Tile, WinnersHead, WinnersList, type WinnersBy } from "@/components/analysis/AgencyExplorer";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { LineChart } from "@/components/charts/LineChart";
import { YearChart } from "@/components/charts/YearChart";
import { CHART } from "@/components/charts/useWidth";
import { HBarList } from "@/components/charts/HBarList";
import { ScrollRow } from "@/components/ScrollRow";
import { daysLeft } from "@/lib/analysis";
import { METHOD_NAME } from "@/lib/awards/analysis";
import { isVagueAgency } from "@/lib/awards/agency";
import { industryId, periodLabel, type FirmStat, type IndustryAgencyRow, type IndustryIndexRow, type IndustryPeriodData, type IndustrySummary } from "@/lib/awards/industry";
import { won } from "@/lib/format";
import { useBids } from "@/lib/useBids";
import { CATEGORIES, CATEGORY_GROUPS, type Bid, type ServiceCategory } from "@/lib/types";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const pct = (n: number, d = 3) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;

async function loadJson<T>(path: string): Promise<T | null> {
  const r = await fetch(`${BASE}${path}`);
  return r.ok ? ((await r.json()) as T) : null;
}

const GROUP_OF = Object.fromEntries(Object.entries(CATEGORY_GROUPS).flatMap(([g, cs]) => cs.map((c) => [c, g]))) as Record<ServiceCategory, string>;

/** 업종별 분석: 업종 고르기(공고 검색과 같은 타일) → 그 업종의 10년치 낙찰 요약 */
export function IndustryExplorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const raw = sp.get("cat") ?? "";
  const cat = (CATEGORIES as string[]).includes(raw) ? (raw as ServiceCategory) : "";
  const { bids } = useBids();
  const [list, setList] = useState<IndustryIndexRow[] | null>(null);
  const [agencyIds, setAgencyIds] = useState<Map<string, string>>(new Map());
  const [sum, setSum] = useState<IndustrySummary | null | undefined>();

  useEffect(() => {
    loadJson<IndustryIndexRow[]>("/industry-data/index.json").then((l) => setList(l ?? [])).catch(() => setList([]));
    // 주요 발주기관 이름에서 발주처 분석으로 바로 가기 (지금 공고가 있는 기관만 발주처 분석이 있다)
    loadJson<[string, string, number][]>("/agency-data/index.json").then((l) => setAgencyIds(new Map((l ?? []).map(([n, id]) => [n, id])))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!cat) { setSum(undefined); return; }
    let alive = true;
    setSum(undefined);
    loadJson<IndustrySummary>(`/industry-data/${industryId(cat)}.json`).then((s) => alive && setSum(s && { ...s, agencies: s.agencies.filter(([a]) => !isVagueAgency(a)) })).catch(() => alive && setSum(null));
    return () => { alive = false; };
  }, [cat]);

  const open = useMemo(() => (bids ?? []).filter((b) => daysLeft(b.closeAt) > 0), [bids]);
  const openCount = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of open) c[b.category] = (c[b.category] ?? 0) + 1;
    return c;
  }, [open]);
  const byName = useMemo(() => new Map((list ?? []).map((r) => [r[0], r])), [list]);

  const pick = (c: string) => {
    const p = new URLSearchParams(sp.toString());
    if (c) p.set("cat", c); else p.delete("cat");
    const qs = p.toString();
    router.replace(`/analysis/industry${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div className="container-x py-8">
      <CategoryTiles value={cat} counts={openCount} onPick={pick} />
      <p className="mt-2 text-xs text-ink-500">타일 숫자는 지금 마감 전인 나라장터 공고 수입니다. 낙찰은 공고명과 투찰 가능 업종으로 공고 검색과 같은 규칙에 따라 업종을 나눴습니다.</p>

      {!cat ? (
        <section className="card mt-6 overflow-hidden" aria-label="업종 목록">
          <div className="border-b border-ink-100 px-4 py-3">
            <h2 className="font-bold">업종 한눈에 보기</h2>
            <p className="mt-0.5 text-xs text-ink-500">업종을 누르면 그 업종의 낙찰 분석을 봅니다. 낙찰률·참가업체는 최근 해 적격심사 공고의 가운데 값입니다.</p>
          </div>
          <div className="hidden grid-cols-[1fr_5rem_6rem_7rem_12rem_7rem_5rem] gap-3 border-b border-ink-100 bg-paper px-4 py-2 text-xs font-semibold text-ink-500 lg:grid">
            <span>업종</span><span>업무</span><span className="text-right">지금 공고</span><span className="text-right">낙찰 (10년)</span><span className="text-right">최근 4년 낙찰금액</span><span className="text-right">낙찰률</span><span className="text-right">참가업체</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {CATEGORIES.map((c) => {
              const r = byName.get(c);
              const o = openCount[c] ?? 0;
              return (
                <li key={c}>
                  <button type="button" onClick={() => pick(c)} className="grid w-full min-w-0 grid-cols-1 gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-paper lg:grid-cols-[1fr_5rem_6rem_7rem_12rem_7rem_5rem] lg:items-center lg:gap-3">
                    <span className="min-w-0 break-keep font-semibold">{c}</span>
                    <span className="text-xs text-ink-500 lg:hidden">
                      {[GROUP_OF[c], `지금 공고 ${o.toLocaleString()}건`, r ? `낙찰 ${r[2].toLocaleString()}건` : "", r?.[4] ? `낙찰률 ${pct(r[4])}` : "", r?.[5] ? `참가 ${r[5]}곳` : ""].filter(Boolean).join(" · ")}
                    </span>
                    {r && r[3] > 0 && <span className="text-xs text-ink-500 lg:hidden">최근 4년 낙찰금액 {won(r[3])}</span>}
                    <span className="hidden text-ink-600 lg:inline">{GROUP_OF[c]}</span>
                    <span className="hidden text-right tabular-nums lg:inline">{o.toLocaleString()}</span>
                    <span className="hidden text-right tabular-nums lg:inline">{r ? r[2].toLocaleString() : "-"}</span>
                    <span className="hidden text-right tabular-nums lg:inline">{r && r[3] > 0 ? won(r[3]) : "-"}</span>
                    <span className="hidden text-right tabular-nums lg:inline">{r?.[4] ? pct(r[4]) : "-"}</span>
                    <span className="hidden text-right tabular-nums lg:inline">{r?.[5] ? `${r[5]}곳` : "-"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {list && !list.length && <p className="border-t border-ink-100 px-4 py-3 text-sm text-ink-500">업종별 낙찰 분석을 준비하고 있습니다. 다음 정기 갱신 뒤 낙찰 숫자가 채워집니다.</p>}
        </section>
      ) : (
        <div className="mt-6 min-w-0">
          <button type="button" className="btn-ghost mb-3 text-sm" onClick={() => pick("")}>업종 목록으로</button>
          {sum === undefined && <p className="card p-6 text-sm text-ink-400">불러오는 중…</p>}
          {sum === null && <p className="card p-6 text-sm text-ink-500">이 업종의 낙찰 분석을 아직 만들지 못했습니다. 다음 정기 갱신 뒤 다시 확인해 주세요.</p>}
          {sum && <IndustryDetail s={sum} bids={open.filter((b) => b.category === sum.name)} agencyIds={agencyIds} />}
        </div>
      )}
    </div>
  );
}

function IndustryDetail({ s, bids, agencyIds }: { s: IndustrySummary; bids: Bid[]; agencyIds: Map<string, string> }) {
  const recent4 = s.groups.reduce((a, g) => a + g.n, 0);
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="text-xs font-semibold text-ink-400">{GROUP_OF[s.name]}</p>
        <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight">{s.name}</h2>
        <p className="mt-1 text-sm text-ink-500">나라장터 낙찰 {s.n.toLocaleString()}건 · {s.from} ~ {s.to}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile k="최근 4년 낙찰" v={`${recent4.toLocaleString()}건`} />
          <Tile wide k="최근 4년 낙찰금액" v={won(s.groups.reduce((a, g) => a + g.amount, 0))} />
          <Tile k="낙찰받은 업체" v={`${s.firms.toLocaleString()}곳`} sub="최근 4년, 서로 다른 업체" />
          <Tile k="단독 참가 비율" v={`${Math.round(s.single * 100)}%`} sub="참가 1곳 낙찰" />
          <Tile k="지금 공고" v={`${bids.length.toLocaleString()}건`} sub="마감 전" />
        </dl>
      </section>

      <section className="card p-6">
        <h3 className="font-bold">연도별 낙찰</h3>
        <YearChart years={s.years.slice(-10)} title="최근 10년" />
        <GroupShare s={s} />
      </section>

      <TrendCard s={s} />

      <MethodTable s={s} />

      <PeriodSection s={s} agencyIds={agencyIds} />

      <AssessCard s={s} />

      {bids.length > 0 && (
        <section className="card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">이 업종의 지금 공고 <span className="text-sm font-normal text-ink-400">마감 임박 순</span></h3>
            <Link href={`/bids?cat=${encodeURIComponent(s.name)}`} className="text-sm font-semibold text-mint-700 underline-offset-2 hover:underline">공고 검색에서 {bids.length.toLocaleString()}건 모두 보기</Link>
          </div>
          <div className="mt-3 space-y-3">
            {[...bids].sort((a, b) => a.closeAt.localeCompare(b.closeAt)).slice(0, 12).map((b) => <BidRow key={b.id} bid={b} />)}
          </div>
        </section>
      )}

      <section className="card p-6">
        <h3 className="font-bold">최근 낙찰</h3>
        <ul className="mt-3 divide-y divide-ink-100">
          {s.recent.map(([no, title, date, biz, m, amount, rate, bidders, winner], i) => (
            <li key={no} className="min-w-0 py-2 text-sm">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-ink-500">{[date, s.recentAgency[i], `${biz} ${METHOD_NAME[m]}`, winner, amount > 100 ? `낙찰금액 ${won(amount)}${rate ? ` (낙찰률 ${pct(rate)})` : ""}` : rate ? `낙찰률 ${pct(rate)}` : "", bidders ? `${bidders}곳 참가` : ""].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** 연도별 적격심사 낙찰률(가운데 값)과 참가업체 수(가운데 값) */
function TrendCard({ s }: { s: IndustrySummary }) {
  const t = s.trend.slice(-10);
  const rated = t.filter((x) => x[1] > 0);
  if (!t.length) return null;
  const thisYear = new Date().getFullYear();
  return (
    <section className="card p-6">
      <h3 className="font-bold">낙찰률·참가업체 추이 <span className="text-sm font-normal text-ink-400">최근 10년, 해마다 가운데 값</span></h3>
      {rated.length >= 2 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">적격심사 낙찰률</p>
          <LineChart
            ariaLabel="연도별 적격심사 낙찰률"
            xs={t.map(([y]) => `${String(y).slice(2)}년`)}
            series={[{ name: "적격심사 낙찰률", color: CHART.cat[0], values: t.map((x) => (x[1] > 0 ? x[1] : null)) }]}
            tips={t.map(([y, r, , n]) => [`${y}년${y === thisYear ? " (올해, 진행 중)" : ""}`, r > 0 ? `낙찰률 가운데 ${pct(r)}` : "표본 부족", `적격심사 낙찰 ${n.toLocaleString()}건`])}
            fmt={(v) => `${v.toFixed(1)}%`}
          />
        </div>
      )}
      <div className="mt-5">
        <p className="text-sm font-semibold">참가업체 수</p>
        <ColumnChart
          ariaLabel="연도별 참가업체 수 가운데 값"
          fmt={(v) => `${Math.round(v).toLocaleString()}곳`}
          cols={t.map(([y, , b]) => ({ key: String(y), label: `${String(y).slice(2)}년`, value: b, hot: y === thisYear, tip: [`${y}년${y === thisYear ? " (올해, 진행 중)" : ""}`, b ? `참가업체 가운데 ${b.toLocaleString()}곳` : "자료 없음"] }))}
        />
      </div>
      <p className="mt-2 text-xs text-ink-400">낙찰률은 적격심사 낙찰 5건 이상인 해만 그립니다.<br />참가업체 수는 모든 계약방법의 가운데 값입니다.</p>
    </section>
  );
}

type AgRow = { name: string; n: number; amt: number; w?: { firms: number; top: FirmStat[] } };
const SHOW_MATCHES = 30;

/** 기간(최근 4년·전체·연도별)을 골라 자주 낙찰받은 업체와 발주기관별 낙찰 업체를 함께 본다 */
function PeriodSection({ s, agencyIds }: { s: IndustrySummary; agencyIds: Map<string, string> }) {
  const [period, setPeriod] = useState("4y");
  const [by, setBy] = useState<WinnersBy>("count");
  const [d, setD] = useState<IndustryPeriodData | null | undefined>();
  const id = industryId(s.name);
  useEffect(() => { setPeriod("4y"); }, [s]);
  useEffect(() => {
    let alive = true;
    setD(undefined);
    loadJson<IndustryPeriodData>(`/industry-period/${id}-${period}.json`).then((x) => alive && setD(x && { ...x, agencies: x.agencies.filter(([a]) => !isVagueAgency(a)) })).catch(() => alive && setD(null));
    return () => { alive = false; };
  }, [id, period]);
  // 기간 자료가 아직 없으면 최근 4년은 업종 요약에 든 값으로 보여 준다
  const fallback: IndustryPeriodData | null = period === "4y" ? {
    period, n: s.groups.reduce((a, g) => a + g.n, 0), amount: s.groups.reduce((a, g) => a + g.amount, 0), firms: s.firms, agencyCount: 0,
    winners: s.winners.map(([n, c, a]) => [n, c, a, ""] as FirmStat), agencies: s.agencies, agencyWinners: s.agencyWinners ?? {},
  } : null;
  const data = d ?? (d === null ? fallback : undefined);
  const years = s.years.map(([y]) => String(y)).reverse();
  const opts = ["4y", "all", ...years];
  return (
    <>
      <section className="card p-4 sm:p-5" aria-label="조회 기간">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold">조회 기간</p>
          <p className="text-xs text-ink-500">아래 자주 낙찰받은 업체와 발주기관별 낙찰 업체가 이 기간으로 바뀝니다.</p>
        </div>
        <ScrollRow className="mt-3 flex gap-1" active={period}>
          {opts.map((p) => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${p === period ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
              {periodLabel(p)}
            </button>
          ))}
        </ScrollRow>
        {data && (
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile k="낙찰" v={`${data.n.toLocaleString()}건`} sub={periodLabel(period)} />
            <Tile wide k="낙찰금액" v={won(data.amount)} />
            <Tile k="낙찰받은 업체" v={`${data.firms.toLocaleString()}곳`} sub={data.agencyCount ? `발주기관 ${data.agencyCount.toLocaleString()}곳` : undefined} />
          </dl>
        )}
      </section>

      <section className="card p-6">
        <WinnersHead period={periodLabel(period)} by={by} setBy={setBy} />
        {data === undefined && <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
        {data === null && <p className="mt-3 text-sm text-ink-500">이 기간 자료는 다음 정기 갱신 뒤 채워집니다.</p>}
        {data && (data.winners.length
          ? <WinnersList rows={data.winners} by={by} />
          : <p className="mt-3 text-sm text-ink-500">이 기간 낙찰이 없습니다.</p>)}
        {period === "4y" && s.ranked.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-500">개찰 1~5위에 자주 든 업체(낙찰 제외): {s.ranked.slice(0, 6).map(([n, c]) => `${n} ${c}회`).join(", ")}</p>
        )}
      </section>

      {data && <AgencyWinners key={`${id}-${period}`} d={data} listPath={d ? `/industry-period/${id}-${period}-ag.json` : null} agencyIds={agencyIds} />}
    </>
  );
}

/** 발주기관별 낙찰 업체: 이 업종 낙찰이 많은 기관(펼치면 낙찰 업체) + 이 업종의 모든 발주기관 검색 */
function AgencyWinners({ d, listPath, agencyIds }: { d: IndustryPeriodData; listPath: string | null; agencyIds: Map<string, string> }) {
  const [open, setOpen] = useState<string | null>(d.agencies[0]?.[0] ?? null);
  const [q, setQ] = useState("");
  const [all, setAll] = useState<IndustryAgencyRow[] | null | undefined>();
  const load = () => {
    if (all !== undefined || !listPath) return;
    setAll(null);
    loadJson<IndustryAgencyRow[]>(listPath).then((l) => setAll((l ?? []).filter((r) => !isVagueAgency(r[0])))).catch(() => setAll([]));
  };
  const t = q.replace(/\s+/g, "");
  const matches = useMemo(() => (t && all ? all.filter((r) => r[0].replace(/\s+/g, "").includes(t)) : []), [all, t]);
  // 검색하면 첫 기관을 펼친다
  const first = matches[0]?.[0];
  useEffect(() => { if (first) setOpen(first); }, [first]);
  const rows: AgRow[] = t
    ? matches.slice(0, SHOW_MATCHES).map((r) => ({ name: r[0], n: r[1], amt: r[2], w: d.agencyWinners[r[0]] ?? { firms: r[3], top: r[4] } }))
    : d.agencies.map(([n, c, a]) => ({ name: n, n: c, amt: a, w: d.agencyWinners[n] }));
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="card p-6">
      <h3 className="font-bold">발주기관별 낙찰 업체 <span className="text-sm font-normal text-ink-400">{periodLabel(d.period)}</span></h3>
      <div className="mt-3 min-w-0">
        <label className="label" htmlFor="ind-ag-q">이 업종의 발주기관 검색</label>
        <input id="ind-ag-q" className="input" placeholder={listPath ? "예: 서울특별시교육청, 한국도로공사" : "기관 검색은 다음 정기 갱신 뒤 쓸 수 있습니다"} disabled={!listPath} value={q} onFocus={load} onChange={(e) => { load(); setQ(e.target.value); }} />
        <p className="mt-1.5 text-xs text-ink-500">
          {t
            ? all === null || all === undefined ? "기관 목록을 불러오는 중…" : `이 기간 이 업종에 낙찰이 있는 기관 ${all.length.toLocaleString()}곳 중 ${matches.length.toLocaleString()}곳${matches.length > SHOW_MATCHES ? ` (앞 ${SHOW_MATCHES}곳 표시)` : ""}`
            : `이 업종 낙찰이 많은 기관 ${d.agencies.length}곳입니다. 기관을 누르면 이 업종에서 그 기관 공고를 낙찰받은 업체를 봅니다.`}
        </p>
      </div>
      <ol className="mt-2 divide-y divide-ink-100">
        {rows.map((r, i) => {
          const on = open === r.name;
          const id = agencyIds.get(r.name);
          return (
            <li key={r.name} className="min-w-0 py-2">
              <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : r.name)} className="block w-full min-w-0 text-left text-sm">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                  <span className="min-w-0 font-semibold">{t ? "" : `${i + 1}. `}{r.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-500">{r.n.toLocaleString()}건<span className="ml-1.5 text-ink-400">{on ? "닫기" : "업체 보기"}</span></span>
                </span>
                <span className="mt-0.5 block text-xs tabular-nums text-ink-500">낙찰금액 {won(r.amt)}</span>
                <span className="mt-1 block h-2 rounded-full bg-paper">
                  <span className="block h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.n / max) * 100)}%`, background: on ? CHART.cat[0] : CHART.cat[2] }} />
                </span>
              </button>
              {on && (
                <div className="mt-3 rounded-xl bg-paper p-3 sm:p-4">
                  {r.w ? (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">낙찰받은 업체 {r.w.firms.toLocaleString()}곳{r.w.firms > r.w.top.length ? ` 중 많이 낙찰받은 ${r.w.top.length}곳` : ""}</p>
                        {id && <Link href={`/analysis/agency?id=${id}`} className="text-xs font-semibold text-mint-700 underline-offset-2 hover:underline">이 기관 발주처 분석</Link>}
                      </div>
                      <div className="mt-2 hidden grid-cols-[1fr_4rem_12rem_6rem] gap-3 text-xs font-semibold text-ink-500 sm:grid">
                        <span>업체</span><span className="text-right">낙찰</span><span className="text-right">낙찰금액</span><span className="text-right">최근 낙찰</span>
                      </div>
                      <ol className="mt-1 divide-y divide-ink-100">
                        {r.w.top.map(([f, fc, fa, fd], j) => (
                          <li key={f} className="grid min-w-0 grid-cols-1 gap-0.5 py-1.5 text-sm sm:grid-cols-[1fr_4rem_12rem_6rem] sm:items-baseline sm:gap-3">
                            <span className="min-w-0 break-keep font-semibold [overflow-wrap:anywhere]">{j + 1}. {f}</span>
                            <span className="text-xs tabular-nums text-ink-500 sm:hidden">{[`${fc.toLocaleString()}건`, won(fa), fd && `최근 ${fd}`].filter(Boolean).join(" · ")}</span>
                            <span className="hidden text-right tabular-nums sm:inline">{fc.toLocaleString()}건</span>
                            <span className="hidden text-right tabular-nums sm:inline">{won(fa)}</span>
                            <span className="hidden text-right text-xs tabular-nums text-ink-500 sm:inline">{fd}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : <p className="text-sm text-ink-500">이 기관의 낙찰 업체는 다음 정기 갱신 뒤 채워집니다.</p>}
                </div>
              )}
            </li>
          );
        })}
        {t && all && !matches.length && <li className="py-3 text-sm text-ink-500">이 기간 이 업종에 낙찰이 있는 기관 중 맞는 곳이 없습니다.</li>}
      </ol>
    </section>
  );
}
