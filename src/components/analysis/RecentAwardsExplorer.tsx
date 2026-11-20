"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { won, wonFull } from "@/lib/format";
import { assessRate, methodGroup, type RecentAwardRow, type RecentAwardsFile } from "@/lib/recentAwards";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const KEY = "bidmate.awards.v1";
type Sort = "new" | "amount" | "bidders" | "rateLow";
type Period = "7" | "14" | "31";
interface Saved { biz: string; period: Period; method: string; sort: Sort }

const pct = (n: number, d = 3) => `${n.toFixed(d).replace(/\.?0+$/, "")}%`;
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 9 * 3600e3 - (n - 1) * 86400e3).toISOString().slice(0, 10);
const g2bUrl = (no: string, ord: string) => `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${no}&bidPbancOrd=${ord}`;

/** 최근 낙찰 결과 목록: 최근 한 달 나라장터 최종낙찰을 업무·기간·금액·계약방법으로 찾는다 */
export function RecentAwardsExplorer() {
  const [data, setData] = useState<RecentAwardsFile | null | undefined>();
  const [q, setQ] = useState("");
  const [biz, setBiz] = useState("");
  const [period, setPeriod] = useState<Period>("7");
  const [method, setMethod] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetch(`${BASE}/recent-awards.json`).then((r) => (r.ok ? r.json() : null)).then((d: RecentAwardsFile | null) => setData(d?.rows?.length ? d : null)).catch(() => setData(null));
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      if (s) { setBiz(s.biz); setPeriod(s.period); setMethod(s.method); setSort(s.sort); }
    } catch { /* 저장된 조건이 없어도 화면은 그대로 */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ biz, period, method, sort } satisfies Saved)); } catch { /* 무시 */ }
  }, [biz, period, method, sort]);
  useEffect(() => setLimit(50), [q, biz, period, method, min, max, sort]);

  const shown = useMemo(() => {
    const rows = data?.rows ?? [];
    const since = daysAgo(Number(period));
    const words = q.trim().split(/\s+/).filter(Boolean);
    const lo = Number(min) * 1e4 || 0, hi = Number(max) * 1e4 || Infinity;
    const xs = rows.filter((r) => {
      const amt = r[11] || r[9];
      return r[5] >= since && (!biz || r[2] === biz) && (!method || methodGroup(r[13]) === method) && amt >= lo && amt <= hi &&
        words.every((w) => `${r[3]} ${r[4]} ${r[7]}`.includes(w));
    });
    const by: Record<Sort, (a: RecentAwardRow, b: RecentAwardRow) => number> = {
      new: (a, b) => b[5].localeCompare(a[5]) || b[9] - a[9],
      amount: (a, b) => b[9] - a[9],
      bidders: (a, b) => b[6] - a[6],
      rateLow: (a, b) => (a[10] || 999) - (b[10] || 999),
    };
    return xs.sort(by[sort]);
  }, [data, q, biz, period, method, min, max, sort]);

  const summary = useMemo(() => {
    if (!shown.length) return null;
    const rates = shown.map((r) => r[10]).filter((x) => x > 0).sort((a, b) => a - b);
    const bidders = shown.map((r) => r[6]).filter((x) => x > 0);
    return {
      total: shown.reduce((s, r) => s + r[9], 0),
      medRate: rates.length ? rates[Math.floor(rates.length / 2)] : 0,
      avgBidders: bidders.length ? Math.round(bidders.reduce((a, b) => a + b, 0) / bidders.length) : 0,
    };
  }, [shown]);

  if (data === undefined) return <div className="container-x py-10 text-sm text-ink-400">불러오는 중…</div>;
  if (data === null) {
    return (
      <div className="container-x py-10">
        <div className="card p-6 text-sm text-ink-500">최근 낙찰 결과를 아직 만들지 못했습니다. 다음 사이트 갱신(영업일 06:40·11:40·16:40) 뒤에 다시 확인해 주세요.</div>
      </div>
    );
  }

  return (
    <div className="container-x py-8">
      <div className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-6 sm:p-5">
        <label className="col-span-2 min-w-0">
          <span className="label">검색어</span>
          <input className="input" placeholder="공고명, 수요기관, 낙찰업체" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="label">업무</span>
          <select className="input" value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="">전체</option><option>공사</option><option>용역</option><option>물품</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">기간</span>
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="7">최근 1주</option><option value="14">최근 2주</option><option value="31">최근 1개월</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">기초금액 (만원 이상)</span>
          <input className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="min-w-0">
          <span className="label">기초금액 (만원 이하)</span>
          <input className="input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-6">
          <select className="input w-auto py-1.5 text-sm" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="계약방법">
            <option value="">계약방법 전체</option><option>적격심사</option><option>협상</option><option>최저가</option><option>수의</option><option>기타</option>
          </select>
          <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="new">최근 낙찰순</option><option value="amount">낙찰금액 큰순</option><option value="bidders">참가업체 많은순</option><option value="rateLow">낙찰률 낮은순</option>
          </select>
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-500">
        {data.from}~{data.to} 최종낙찰 {data.rows.length.toLocaleString()}건 중 {shown.length.toLocaleString()}건
        {summary && ` · 낙찰금액 합계 ${won(summary.total)} · 낙찰률 중앙값 ${pct(summary.medRate)} · 평균 참가 ${summary.avgBidders.toLocaleString()}곳`}
      </p>

      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((r) => <AwardCard key={`${r[0]}-${r[1]}-${r[3]}-${r[8]}`} r={r} />)}
      </ul>
      {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="btn-ghost mt-4 w-full">더 보기 ({(shown.length - limit).toLocaleString()}건 남음)</button>}
      {!shown.length && <div className="card mt-3 p-6 text-sm text-ink-500">조건에 맞는 낙찰이 없습니다. 기간을 늘리거나 검색어를 줄여 보세요.</div>}
      <p className="mt-6 text-xs leading-relaxed text-ink-400">
        나라장터 낙찰정보를 매일 아침 모아 최근 한 달 치를 보여 줍니다 (오늘 {kstToday()} 기준). 낙찰률은 예정가격 대비, 사정율은 예정가격 ÷ 기초금액입니다.
        재입찰·분류가 여럿인 공고는 건마다 따로 나옵니다. 개찰 순위는 받아 둔 공고만 나옵니다.
      </p>
    </div>
  );
}

function AwardCard({ r }: { r: RecentAwardRow }) {
  const [no, ord, biz, title, agency, date, bidders, winner, bizno, amount, rate, base, plnprc, method, lwlt, top] = r;
  const ar = assessRate(r);
  const cells: [string, string, string?][] = [
    ["기초금액", base ? won(base) : "-", base ? wonFull(base) : undefined],
    ["낙찰금액", won(amount), wonFull(amount)],
    ["낙찰률", rate ? pct(rate) : "-", rate && plnprc ? `예정가격 ${wonFull(plnprc)} 기준` : undefined],
    ["사정율", ar ? pct(ar, 4) : "-", ar ? "예정가격 ÷ 기초금액" : undefined],
    ["참가업체", bidders ? `${bidders.toLocaleString()}곳` : "-"],
    ["낙찰하한율", lwlt ? pct(lwlt) : "-", lwlt && base ? `기초금액 기준 ${wonFull(Math.round((base * lwlt) / 100))}` : undefined],
  ];
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="chip">{biz}</span>
        {method && <span className="chip">{methodGroup(method) === "기타" ? method.split(" / ")[0] : methodGroup(method)}</span>}
        <span className="chip">낙찰 {date}</span>
      </div>
      <h3 className="mt-2 font-bold leading-snug">{title}</h3>
      <p className="mt-1 text-sm text-ink-500">{agency} · 공고번호 {no}-{ord}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {cells.map(([k, v, sub]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-ink-400">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
            {sub && <dd className="truncate text-[11px] text-ink-400" title={sub}>{sub}</dd>}
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-xl bg-paper px-3 py-2.5 text-sm">
        <p className="min-w-0"><span className="text-ink-400">낙찰업체</span> <span className="font-semibold">{winner}</span></p>
        {top.length > 0 && (
          <ol className="mt-1.5 space-y-0.5 text-xs text-ink-500">
            {top.map(([rank, name, amt, rt]) => (
              <li key={rank} className="flex min-w-0 gap-2">
                <span className="w-8 shrink-0 text-ink-400">{rank}위</span>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <span className="shrink-0 tabular-nums">{wonFull(amt)}{rt ? ` (${pct(rt)})` : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {bizno && <Link href={`/analysis/rival?bizno=${bizno}`} className="btn-ghost btn-sm">이 업체 투찰 성향</Link>}
        <a href={g2bUrl(no, ord)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">나라장터에서 보기</a>
      </div>
    </li>
  );
}
