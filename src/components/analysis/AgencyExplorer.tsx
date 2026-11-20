"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DistChart } from "@/components/BidPriceAnalysis";
import { METHOD_NAME } from "@/lib/awards/analysis";
import type { AgencySummary } from "@/lib/awards/agency";
import { assessStats } from "@/lib/awards/assess";
import { won } from "@/lib/format";
import { bidHref } from "@/lib/links";
import { useBids } from "@/lib/useBids";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const pct = (n: number, d = 3) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;

async function loadJson<T>(path: string): Promise<T | null> {
  const r = await fetch(`${BASE}${path}`);
  return r.ok ? ((await r.json()) as T) : null;
}

/** 발주처 분석: 수요기관 검색 → 그 기관의 10년치 낙찰 요약 */
export function AgencyExplorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = sp.get("id") ?? "";
  const { bids } = useBids();
  const [list, setList] = useState<[string, string, number][] | null>(null);
  const [q, setQ] = useState("");
  const [sum, setSum] = useState<AgencySummary | null | undefined>();

  useEffect(() => { loadJson<[string, string, number][]>("/agency-data/index.json").then((l) => setList(l ?? [])).catch(() => setList([])); }, []);
  useEffect(() => {
    if (!id) { setSum(undefined); return; }
    let alive = true;
    setSum(undefined);
    loadJson<AgencySummary>(`/agency-data/${id}.json`).then((s) => alive && setSum(s)).catch(() => alive && setSum(null));
    return () => { alive = false; };
  }, [id]);

  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bids ?? []) m.set(b.demandAgency, (m.get(b.demandAgency) ?? 0) + 1);
    return m;
  }, [bids]);
  const matches = useMemo(() => {
    const t = q.replace(/\s+/g, "");
    return (list ?? [])
      .filter(([name]) => !t || name.replace(/\s+/g, "").includes(t))
      .sort((a, b) => (openCount.get(b[0]) ?? 0) - (openCount.get(a[0]) ?? 0) || b[2] - a[2])
      .slice(0, 60);
  }, [list, q, openCount]);
  const pick = (aid: string) => { router.replace(`/analysis/agency?id=${aid}`, { scroll: false }); };

  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[320px_1fr]">
      <aside className="min-w-0">
        <label className="label" htmlFor="agency-q">수요기관 검색</label>
        <input id="agency-q" className="input" placeholder="예: 서울특별시교육청, 한국도로공사" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="mt-2 text-xs text-ink-500">지금 공고를 낸 수요기관 {list ? list.length.toLocaleString() : "…"}곳. 지금 공고가 많은 순입니다.</p>
        <ul className="mt-3 max-h-[28rem] divide-y divide-ink-100 overflow-y-auto rounded-2xl border border-ink-100 bg-white">
          {matches.map(([name, aid, n]) => (
            <li key={aid}>
              <button type="button" onClick={() => pick(aid)} className={`flex w-full min-w-0 items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper ${aid === id ? "bg-mint-50" : ""}`}>
                <span className="min-w-0 truncate font-semibold">{name}</span>
                <span className="shrink-0 text-xs text-ink-500">공고 {openCount.get(name) ?? 0} · 낙찰 {n.toLocaleString()}</span>
              </button>
            </li>
          ))}
          {list && !matches.length && <li className="px-3 py-3 text-sm text-ink-500">찾는 기관이 없습니다.</li>}
          {!list && <li className="px-3 py-3 text-sm text-ink-400">불러오는 중…</li>}
        </ul>
      </aside>
      <div className="min-w-0">
        {!id && <p className="card p-6 text-sm text-ink-500">왼쪽에서 수요기관을 고르세요. 공고 상세의 수요기관 이름에서도 바로 올 수 있습니다.</p>}
        {id && sum === undefined && <p className="card p-6 text-sm text-ink-400">불러오는 중…</p>}
        {id && sum === null && <p className="card p-6 text-sm text-ink-500">이 기관의 낙찰 기록을 찾지 못했습니다.</p>}
        {sum && <AgencyDetail s={sum} bids={(bids ?? []).filter((b) => b.demandAgency === sum.name)} />}
      </div>
    </div>
  );
}

function AgencyDetail({ s, bids }: { s: AgencySummary; bids: { id: string; title: string; closeAt: string; contractMethod: string }[] }) {
  const st = useMemo(() => assessStats(s.assess, undefined), [s]);
  const maxYear = Math.max(1, ...s.years.map((y) => y[1]));
  const recent4 = s.groups.reduce((a, g) => a + g.n, 0);
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-2xl font-extrabold tracking-tight">{s.name}</h2>
        <p className="mt-1 text-sm text-ink-500">나라장터 낙찰 {s.n.toLocaleString()}건 · {s.from} ~ {s.to}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile k="최근 4년 낙찰" v={`${recent4.toLocaleString()}건`} />
          <Tile k="최근 4년 낙찰금액" v={won(s.groups.reduce((a, g) => a + g.amount, 0))} />
          <Tile k="단독 참가 비율" v={`${Math.round(s.single * 100)}%`} sub="참가 1곳 낙찰" />
          <Tile k="지금 공고" v={`${bids.length}건`} />
        </dl>
      </section>

      <section className="card p-6">
        <h3 className="font-bold">연도별 낙찰 건수</h3>
        <ul className="mt-3 space-y-1.5">
          {s.years.slice(-10).map(([y, n, amt, avg]) => (
            <li key={y} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-sm">
              <span className="tabular-nums text-ink-500">{y}</span>
              <span className="h-3 rounded-full bg-paper"><span className="block h-3 rounded-full bg-mint-400" style={{ width: `${(n / maxYear) * 100}%` }} /></span>
              <span className="text-right text-xs tabular-nums text-ink-500">{n.toLocaleString()}건 · {won(amt)}{avg ? ` · 평균 ${avg}곳` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6">
        <h3 className="font-bold">계약방법별 낙찰 <span className="text-sm font-normal text-ink-400">최근 4년</span></h3>
        <div className="mt-3 overflow-x-auto">
          <table className="table-x min-w-[520px]">
            <thead className="text-xs text-ink-500">
              <tr><th className="py-1.5">업무·계약방법</th><th>건수</th><th>낙찰률 가운데 (25~75%)</th><th>하한율 위 폭</th><th>참가업체</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {s.groups.slice(0, 8).map((g) => (
                <tr key={g.label}>
                  <td className="py-2 font-semibold">{g.biz} {METHOD_NAME[g.method]}</td>
                  <td className="tabular-nums">{g.n.toLocaleString()}</td>
                  <td className="tabular-nums">{g.rate ? `${pct(g.rate[1])} (${pct(g.rate[0], 2)}~${pct(g.rate[2], 2)})` : "-"}</td>
                  <td className="tabular-nums">{g.gap !== undefined ? `${g.gap >= 0 ? "+" : ""}${g.gap.toFixed(3)}%p` : "-"}</td>
                  <td className="tabular-nums">{g.bidders ? `${g.bidders}곳` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-400">하한율 위 폭은 낙찰률에서 그 공고 낙찰하한율을 뺀 값의 가운데 값입니다. 참가업체는 가운데 값입니다.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h3 className="font-bold">자주 낙찰받은 업체 <span className="text-sm font-normal text-ink-400">최근 4년</span></h3>
          <ol className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
            {s.winners.map(([n, c, a], i) => (
              <li key={n} className="flex min-w-0 items-baseline justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate"><span className="mr-1.5 tabular-nums text-ink-400">{i + 1}</span><b>{n}</b></span>
                <span className="shrink-0 text-xs text-ink-500">{c}건 · {won(a)}</span>
              </li>
            ))}
          </ol>
          {s.ranked.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-500">개찰 1~5위에 자주 든 업체(낙찰 제외): {s.ranked.slice(0, 6).map(([n, c]) => `${n} ${c}회`).join(", ")}</p>
          )}
        </section>
        <section className="card p-6">
          <h3 className="font-bold">사정율 분포 <span className="text-sm font-normal text-ink-400">예정가격 ÷ 기초금액</span></h3>
          {st ? (
            <>
              <DistChart st={st} />
              <p className="mt-2 text-xs text-ink-500">{st.n}건 · 가운데 값 {pct(st.q[2])} · 최근 10건 평균 {pct(st.recent)}{st.winner ? ` · 낙찰자 사정율 가운데 ${pct(st.winner.q[1])}` : ""}</p>
            </>
          ) : <p className="mt-3 text-sm text-ink-500">예정가격·기초금액이 공개된 낙찰이 적어 분포를 만들지 못했습니다.</p>}
        </section>
      </div>

      {bids.length > 0 && (
        <section className="card p-6">
          <h3 className="font-bold">이 기관의 지금 공고</h3>
          <ul className="mt-3 divide-y divide-ink-100">
            {bids.slice(0, 12).map((b) => (
              <li key={b.id} className="py-2 text-sm">
                <Link href={bidHref(b.id)} className="font-semibold hover:underline">{b.title}</Link>
                <span className="ml-2 text-xs text-ink-500">{b.contractMethod} · 마감 {b.closeAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6">
        <h3 className="font-bold">최근 낙찰</h3>
        <ul className="mt-3 divide-y divide-ink-100">
          {s.recent.map(([no, title, date, biz, m, amount, rate, bidders, winner]) => (
            <li key={no} className="min-w-0 py-2 text-sm">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-ink-500">{[date, `${biz} ${METHOD_NAME[m]}`, winner, amount > 100 ? won(amount) : "", rate ? `낙찰률 ${pct(rate)}` : "", bidders ? `${bidders}곳 참가` : ""].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <dt className="text-xs text-ink-500">{k}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums">{v}</dd>
      {sub && <dd className="text-xs text-ink-400">{sub}</dd>}
    </div>
  );
}
