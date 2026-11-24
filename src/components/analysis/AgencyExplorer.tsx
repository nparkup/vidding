"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Building, Building2, Ellipsis, Factory, Handshake, HeartHandshake, Landmark, LayoutGrid, School, Shield, type LucideIcon } from "lucide-react";
import { AgencyLogo } from "@/components/AgencyLogo";
import { BidRow } from "@/components/BidRow";
import { Tile as KindTile } from "@/components/CategoryTiles";
import { AGENCY_KINDS, KIND_LABEL, REGION_ORDER, agencyKind, agencyRegion, type AgencyKind } from "@/lib/agencyKind";
import { AssessDistWide } from "@/components/charts/AssessDistWide";
import { YearChart } from "@/components/charts/YearChart";
import { HBarList } from "@/components/charts/HBarList";
import { NetworkGraph, type NetEdge, type NetNode } from "@/components/charts/NetworkGraph";
import { CHART } from "@/components/charts/useWidth";
import { METHOD_NAME } from "@/lib/awards/analysis";
import { agencyId, type AgencySummary } from "@/lib/awards/agency";
import { cutCats, cutStats, type AgencyCutFile } from "@/lib/awards/agencyCut";
import { periodLabel } from "@/lib/awards/industry";
import { ScrollRow } from "@/components/ScrollRow";
import { assessStats } from "@/lib/awards/assess";
import { won } from "@/lib/format";
import { bidHref } from "@/lib/links";
import { useBids } from "@/lib/useBids";
import { CATEGORIES, type Bid } from "@/lib/types";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const pct = (n: number, d = 3) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;

async function loadJson<T>(path: string): Promise<T | null> {
  const r = await fetch(`${BASE}${path}`);
  return r.ok ? ((await r.json()) as T) : null;
}

type Row = { name: string; id: string; n: number; open: number; kind: AgencyKind; region?: string };

const KIND_ICON: Record<AgencyKind, LucideIcon> = {
  gov: Landmark, local1: Building2, local2: Building, edu: BookOpen, school: School, corp: Factory,
  mil: Shield, welfare: HeartHandshake, biz: Handshake, etc: Ellipsis,
};

const SORTS = [
  { key: "", label: "지금 공고 많은 순" },
  { key: "awards", label: "낙찰 건수 많은 순" },
  { key: "name", label: "이름순" },
];
const PAGE = 100;

/** 발주처 분석: 전체·구분·지역으로 수요기관 고르기 → 그 기관의 10년치 낙찰 요약 */
export function AgencyExplorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = sp.get("id") ?? "";
  const kind = (sp.get("kind") ?? "") as AgencyKind | "";
  const region = sp.get("region") ?? "";
  const sort = sp.get("sort") ?? "";
  const { bids } = useBids();
  const [list, setList] = useState<[string, string, number][] | null>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [sum, setSum] = useState<AgencySummary | null | undefined>();

  useEffect(() => { loadJson<[string, string, number][]>("/agency-data/index.json").then((l) => setList(l ?? [])).catch(() => setList([])); }, []);
  useEffect(() => {
    if (!id) { setSum(undefined); return; }
    let alive = true;
    setSum(undefined);
    loadJson<AgencySummary>(`/agency-data/${id}.json`).then((s) => alive && setSum(s)).catch(() => alive && setSum(null));
    return () => { alive = false; };
  }, [id]);
  useEffect(() => { setShown(PAGE); }, [kind, region, sort, q]);

  const openCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bids ?? []) m.set(b.demandAgency, (m.get(b.demandAgency) ?? 0) + 1);
    return m;
  }, [bids]);
  const rows = useMemo<Row[]>(
    () => (list ?? []).map(([name, aid, n]) => ({ name, id: aid, n, open: openCount.get(name) ?? 0, kind: agencyKind(name), region: agencyRegion(name) })),
    [list, openCount],
  );
  const t = q.replace(/\s+/g, "");
  const byText = useMemo(() => rows.filter((r) => !t || r.name.replace(/\s+/g, "").includes(t)), [rows, t]);
  /** 구분 타일 숫자: 지역·검색어는 적용하고 구분은 빼고 센다 */
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of byText) if (!region || r.region === region) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [byText, region]);
  const regions = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of byText) if (r.region && (!kind || r.kind === kind)) c.set(r.region, (c.get(r.region) ?? 0) + 1);
    return REGION_ORDER.filter((g) => c.has(g) || g === region).map((g) => [g, c.get(g) ?? 0] as const);
  }, [byText, kind, region]);
  const matches = useMemo(() => {
    const f = byText.filter((r) => (!kind || r.kind === kind) && (!region || r.region === region));
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      "": (a, b) => b.open - a.open || b.n - a.n,
      awards: (a, b) => b.n - a.n || b.open - a.open,
      name: (a, b) => a.name.localeCompare(b.name, "ko"),
    };
    return f.sort(cmp[sort] ?? cmp[""]);
  }, [byText, kind, region, sort]);

  const setParam = (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    const qs = p.toString();
    router.replace(`/analysis/agency${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const pick = (aid: string) => setParam({ id: aid });
  const total = Object.values(kindCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="container-x py-8">
      <section className="card p-4 sm:p-5" aria-label="기관 구분 선택">
        <p className="text-sm font-bold">기관 구분으로 찾기</p>
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 lg:grid-cols-11">
          <KindTile icon={LayoutGrid} label="전체" title="전체 수요기관" count={total} on={!kind} onClick={() => setParam({ kind: "" })} />
          {AGENCY_KINDS.map((k) => (
            <KindTile key={k.key} icon={KIND_ICON[k.key]} label={k.label} title={k.title} count={kindCounts[k.key] ?? 0} on={kind === k.key} onClick={() => setParam({ kind: kind === k.key ? "" : k.key })} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_11rem]">
          <div className="min-w-0">
            <label className="label" htmlFor="agency-q">기관 이름 검색</label>
            <input id="agency-q" className="input" placeholder="예: 서울특별시교육청, 한국도로공사" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="agency-region">지역</label>
            <select id="agency-region" className="input" value={region} onChange={(e) => setParam({ region: e.target.value })}>
              <option value="">전체 지역</option>
              {regions.map(([g, n]) => <option key={g} value={g}>{g} ({n.toLocaleString()})</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="agency-sort">정렬</label>
            <select id="agency-sort" className="input" value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          지금 공고를 낸 수요기관 {list ? list.length.toLocaleString() : "…"}곳 중 {list ? matches.length.toLocaleString() : "…"}곳.
          {region && " 지역은 기관 이름에 든 시·도로 나눠, 이름에 시·도가 없는 기관(중앙행정기관 본부, 대학 등)은 지역을 고르면 빠집니다."}
          {" "}구분은 기관 이름으로 나눈 것이라 일부 기관은 다른 구분에 들어갈 수 있습니다.
        </p>
      </section>

      {!id ? (
        <section className="card mt-6 overflow-hidden" aria-label="수요기관 목록">
          <div className="hidden grid-cols-[1fr_9rem_5rem_6rem_7rem] gap-3 border-b border-ink-100 bg-paper px-4 py-2 text-xs font-semibold text-ink-500 sm:grid">
            <span>수요기관</span><span>구분</span><span>지역</span><span className="text-right">지금 공고</span><span className="text-right">낙찰 (10년)</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {matches.slice(0, shown).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r.id)} className="grid w-full min-w-0 grid-cols-1 gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-paper sm:grid-cols-[1fr_9rem_5rem_6rem_7rem] sm:items-center sm:gap-3">
                  <span className="min-w-0 break-keep font-semibold">{r.name}</span>
                  <span className="text-xs text-ink-500 sm:text-sm sm:text-ink-600">
                    <span className="sm:hidden">{[KIND_LABEL[r.kind], r.region, `공고 ${r.open}`, `낙찰 ${r.n.toLocaleString()}`].filter(Boolean).join(" · ")}</span>
                    <span className="hidden sm:inline">{KIND_LABEL[r.kind]}</span>
                  </span>
                  <span className="hidden text-ink-600 sm:inline">{r.region ?? "-"}</span>
                  <span className="hidden text-right tabular-nums sm:inline">{r.open.toLocaleString()}</span>
                  <span className="hidden text-right tabular-nums sm:inline">{r.n.toLocaleString()}</span>
                </button>
              </li>
            ))}
            {list && !matches.length && <li className="px-4 py-4 text-sm text-ink-500">조건에 맞는 기관이 없습니다.</li>}
            {!list && <li className="px-4 py-4 text-sm text-ink-400">불러오는 중…</li>}
          </ul>
          {matches.length > shown && (
            <div className="border-t border-ink-100 p-3 text-center">
              <button type="button" className="btn-ghost text-sm" onClick={() => setShown((n) => n + PAGE)}>
                더 보기 ({shown.toLocaleString()} / {matches.length.toLocaleString()}곳)
              </button>
            </div>
          )}
        </section>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="hidden min-w-0 lg:block">
            <p className="text-xs text-ink-500">{matches.length.toLocaleString()}곳 · {SORTS.find((s) => s.key === sort)?.label ?? SORTS[0].label}</p>
            <ul className="mt-2 max-h-[40rem] divide-y divide-ink-100 overflow-y-auto rounded-2xl border border-ink-100 bg-white">
              {matches.slice(0, 300).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r.id)} className={`flex w-full min-w-0 items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper ${r.id === id ? "bg-mint-50" : ""}`}>
                    <span className="min-w-0 font-semibold">{r.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">공고 {r.open} · 낙찰 {r.n.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="min-w-0">
            <button type="button" className="btn-ghost mb-3 text-sm" onClick={() => setParam({ id: "" })}>목록으로</button>
            {sum === undefined && <p className="card p-6 text-sm text-ink-400">불러오는 중…</p>}
            {sum === null && <p className="card p-6 text-sm text-ink-500">이 기관의 낙찰 기록을 찾지 못했습니다.</p>}
            {sum && <AgencyDetail s={sum} bids={(bids ?? []).filter((b) => b.demandAgency === sum.name)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function AgencyDetail({ s, bids }: { s: AgencySummary; bids: Bid[] }) {
  const recent4 = s.groups.reduce((a, g) => a + g.n, 0);
  // 업종·기간 선택 (/agency-cut/{id}.json). 기본(전체 업종·최근 4년)은 발주처 요약 그대로
  const [cut, setCut] = useState<AgencyCutFile | null | undefined>();
  const [cat, setCat] = useState(-1);
  const [period, setPeriod] = useState("4y");
  useEffect(() => {
    let alive = true;
    setCut(undefined); setCat(-1); setPeriod("4y");
    loadJson<AgencyCutFile>(`/agency-cut/${agencyId(s.name)}.json`).then((f) => alive && setCut(f)).catch(() => alive && setCut(null));
    return () => { alive = false; };
  }, [s]);
  const cats = useMemo(() => (cut ? cutCats(cut) : []), [cut]);
  const filtered = !!cut && (cat >= 0 || period !== "4y");
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const cs = useMemo(() => (cut && filtered ? cutStats(cut, cat, period, today) : null), [cut, filtered, cat, period, today]);
  const cutYears = useMemo(() => (cut ? [...new Set(cut.rows.map((r) => Math.floor(r[0] / 10000)))].sort((a, b) => b - a).slice(0, 11).map(String) : []), [cut]);
  const label = [cat >= 0 ? CATEGORIES[cat] : "", periodLabel(period)].filter(Boolean).join(" · ");
  const view = cs ? { groups: cs.groups, winners: cs.winners.map(([n, c, a]) => [n, c, a] as [string, number, number]), ranked: [] as [string, number][] } : s;
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-2xl font-extrabold tracking-tight"><AgencyLogo name={s.name} size={30} maxW={170} className="mr-3 -mt-1" />{s.name}</h2>
        <p className="mt-1 text-sm text-ink-500">나라장터 낙찰 {s.n.toLocaleString()}건 · {s.from} ~ {s.to}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile k="최근 4년 낙찰" v={`${recent4.toLocaleString()}건`} />
          <Tile wide k="최근 4년 낙찰금액" v={won(s.groups.reduce((a, g) => a + g.amount, 0))} />
          <Tile k="단독 참가 비율" v={`${Math.round(s.single * 100)}%`} sub="참가 1곳 낙찰" />
          <Tile k="지금 공고" v={`${bids.length}건`} />
        </dl>
      </section>

      {cut && cut.rows.length > 0 && (
        <section className="card p-4 sm:p-5" aria-label="업종·기간 선택">
          <div className="grid gap-3 sm:grid-cols-[16rem_1fr] sm:items-end">
            {cats.length > 0 && (
              <div className="min-w-0">
                <label className="label" htmlFor="ag-cut-cat">업종</label>
                <select id="ag-cut-cat" className="input" value={cat} onChange={(e) => setCat(Number(e.target.value))}>
                  <option value={-1}>전체 업종</option>
                  {cats.map(([c, n]) => <option key={c} value={c}>{CATEGORIES[c]} ({n.toLocaleString()}건)</option>)}
                </select>
              </div>
            )}
            <div className="min-w-0">
              <p className="label">조회 기간</p>
              <ScrollRow className="flex gap-1" active={period}>
                {["4y", "all", ...cutYears].map((p) => (
                  <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${p === period ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
                    {periodLabel(p)}
                  </button>
                ))}
              </ScrollRow>
            </div>
          </div>
          {cs && (
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile k="낙찰" v={`${cs.n.toLocaleString()}건`} sub={label} />
              <Tile wide k="낙찰금액" v={won(cs.amount)} />
              <Tile k="낙찰받은 업체" v={`${cs.firms.toLocaleString()}곳`} sub={`단독 참가 ${Math.round(cs.single * 100)}%`} />
            </dl>
          )}
          <p className="mt-2 text-xs text-ink-500">연도별 낙찰, 계약방법별 낙찰, 자주 낙찰받은 업체가 고른 업종·기간으로 바뀝니다. 사정율 분포와 관계도, 최근 낙찰은 전체 기준입니다.</p>
        </section>
      )}

      <section className="card p-6">
        <h3 className="font-bold">연도별 낙찰{cs && cat >= 0 && <span className="text-sm font-normal text-ink-400"> {CATEGORIES[cat]}</span>}</h3>
        <YearChart years={(cs && cat >= 0 ? cs.years : s.years).slice(-10)} title="최근 10년" />
        <GroupShare s={view} period={cs ? label : undefined} />
      </section>

      <MethodTable s={view} period={cs ? label : undefined} />

      <WinnersCard s={view} period={cs ? label : undefined} />

      <AssessCard s={s} />

      <AgencyNetwork s={s} />

      {bids.length > 0 && (
        <section className="card p-6">
          <h3 className="font-bold">이 기관의 지금 공고</h3>
          <div className="mt-3 space-y-3">
            {[...bids].sort((a, b) => a.closeAt.localeCompare(b.closeAt)).slice(0, 12).map((b) => <BidRow key={b.id} bid={b} />)}
          </div>
        </section>
      )}

      <section className="card p-6">
        <h3 className="font-bold">최근 낙찰</h3>
        <ul className="mt-3 divide-y divide-ink-100">
          {s.recent.map(([no, title, date, biz, m, amount, rate, bidders, winner]) => (
            <li key={no} className="min-w-0 py-2 text-sm">
              <p className="font-semibold">{title}</p>
              <p className="text-xs text-ink-500">{[date, `${biz} ${METHOD_NAME[m]}`, winner, amount > 100 ? `낙찰금액 ${won(amount)}${rate ? ` (낙찰률 ${pct(rate)})` : ""}` : rate ? `낙찰률 ${pct(rate)}` : "", bidders ? `${bidders}곳 참가` : ""].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** wide: 원 단위 전체 금액은 휴대폰에서 두 칸을 쓴다 */
export function Tile({ k, v, sub, wide }: { k: string; v: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-paper px-3 py-2${wide ? " col-span-2" : ""}`}>
      <dt className="text-xs text-ink-500">{k}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums [overflow-wrap:anywhere]">{v}</dd>
      {sub && <dd className="text-xs text-ink-400">{sub}</dd>}
    </div>
  );
}

/** 최근 4년 업무·계약방법별 낙찰 건수 비중 (한 줄 막대) */
export function GroupShare({ s, period }: { s: Pick<AgencySummary, "groups">; period?: string }) {
  const gs = s.groups.slice(0, 4);
  const rest = s.groups.slice(4).reduce((a, g) => a + g.n, 0);
  const total = gs.reduce((a, g) => a + g.n, 0) + rest;
  if (!total) return null;
  const parts = [...gs.map((g, i) => ({ label: `${g.biz} ${METHOD_NAME[g.method]}`, n: g.n, color: CHART.cat[i] })), ...(rest ? [{ label: "그 밖", n: rest, color: CHART.ref }] : [])];
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold">업무·계약방법 비중 <span className="font-normal text-ink-400">{period ?? "최근 4년"} {total.toLocaleString()}건</span></p>
      <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => <span key={p.label} title={`${p.label} ${p.n.toLocaleString()}건`} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
        {parts.map((p) => <li key={p.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.label} {Math.round((p.n / total) * 100)}% ({p.n.toLocaleString()}건)</li>)}
      </ul>
    </div>
  );
}

/** 관계도: 기관 ― 업무(공사·용역·물품) ― 최근 낙찰 업체, 그리고 자주 낙찰·상위에 든 업체 */
function AgencyNetwork({ s }: { s: AgencySummary }) {
  const g = useMemo(() => {
    const nodes = new Map<string, NetNode>();
    const edges = new Map<string, NetEdge>();
    const edge = (a: string, b: string, w: number) => { const k = `${a}|${b}`; const e = edges.get(k); if (e) e.w += w; else edges.set(k, { a, b, w }); };
    nodes.set("ag", { id: "ag", label: s.name, group: "ag", weight: s.n, tip: [s.name, `낙찰 ${s.n.toLocaleString()}건`] });
    const bizN = new Map<string, number>();
    for (const g of s.groups) bizN.set(g.biz, (bizN.get(g.biz) ?? 0) + g.n);
    for (const [b, n] of bizN) { nodes.set(`b:${b}`, { id: `b:${b}`, label: b, group: "biz", weight: n, tip: [b, `최근 4년 낙찰 ${n.toLocaleString()}건`] }); edge("ag", `b:${b}`, n); }
    const winBiz = new Map<string, Map<string, number>>();
    for (const r of s.recent) { if (!r[8]) continue; const m = winBiz.get(r[8]) ?? new Map<string, number>(); m.set(r[3], (m.get(r[3]) ?? 0) + 1); winBiz.set(r[8], m); }
    const link = (id: string, name: string, w: number) => {
      const bs = winBiz.get(name);
      const hit = bs && [...bs.keys()].filter((b) => nodes.has(`b:${b}`));
      if (hit?.length) for (const b of hit) edge(`b:${b}`, id, w); else edge("ag", id, w);
    };
    for (const [n, c, a] of s.winners) { nodes.set(`w:${n}`, { id: `w:${n}`, label: n, group: "win", weight: c, tip: [n, `최근 4년 낙찰 ${c}건 · ${won(a)}`] }); link(`w:${n}`, n, c); }
    for (const [n, c] of s.ranked.slice(0, 8)) { if (nodes.has(`w:${n}`)) continue; nodes.set(`r:${n}`, { id: `r:${n}`, label: n, group: "rank", weight: c, tip: [n, `최근 4년 개찰 1~5위 ${c}회 (낙찰 제외)`] }); link(`r:${n}`, n, c); }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }, [s]);
  if (g.nodes.length < 3) return null;
  return (
    <section className="card p-6">
      <h3 className="font-bold">업무·업체 관계도 <span className="text-sm font-normal text-ink-400">최근 4년, 원 크기 = 건수</span></h3>
      <NetworkGraph
        nodes={g.nodes} edges={g.edges} centerId="ag" ariaLabel="수요기관 업무와 업체 관계도"
        groups={[{ key: "biz", label: "업무 (낙찰 건수)", color: CHART.cat[2] }, { key: "win", label: "자주 낙찰받은 업체", color: CHART.cat[0] }, { key: "rank", label: "개찰 1~5위에 자주 든 업체", color: CHART.cat[1] }]}
      />
      <p className="mt-2 text-xs leading-relaxed text-ink-500">업체는 최근 낙찰 20건에서 맡은 업무에 잇고, 그 안에 없으면 기관에 바로 잇습니다.<br />원을 누르면 이어진 곳만 진하게 보입니다.</p>
    </section>
  );
}

/** 업무·계약방법별 낙찰률·참가업체 (최근 4년). 업종별 분석도 같이 쓴다 */
export function MethodTable({ s, period }: { s: Pick<AgencySummary, "groups">; period?: string }) {
  return (
    <section className="card p-6">
      <h3 className="font-bold">계약방법별 낙찰 <span className="text-sm font-normal text-ink-400">{period ?? "최근 4년"}</span></h3>
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
      <p className="mt-2 text-xs text-ink-400">하한율 위 폭은 낙찰률에서 그 공고 낙찰하한율을 뺀 값의 가운데 값입니다.<br />참가업체는 가운데 값입니다.</p>
    </section>
  );
}

/** 자주 낙찰받은 업체·개찰 상위 업체 (최근 4년) */
export function WinnersCard({ s, period }: { s: Pick<AgencySummary, "winners" | "ranked">; period?: string }) {
  return (
    <section className="card p-6">
      <h3 className="font-bold">자주 낙찰받은 업체 <span className="text-sm font-normal text-ink-400">{period ?? "최근 4년"}</span></h3>
      <HBarList rows={s.winners.map(([n, c, a], i) => ({ label: `${i + 1}. ${n}`, value: c, text: `${c}건 · ${won(a)}` }))} />
      {s.ranked.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ink-500">개찰 1~5위에 자주 든 업체(낙찰 제외): {s.ranked.slice(0, 6).map(([n, c]) => `${n} ${c}회`).join(", ")}</p>
      )}
    </section>
  );
}

/** 사정율 분포 (예정가격 ÷ 기초금액) */
export function AssessCard({ s }: { s: Pick<AgencySummary, "assess"> }) {
  const st = useMemo(() => assessStats(s.assess, undefined), [s]);
  return (
    <section className="card p-6">
      <h3 className="font-bold">사정율 분포 <span className="text-sm font-normal text-ink-400">예정가격 ÷ 기초금액</span></h3>
      {st ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile k="표본" v={`${st.n.toLocaleString()}건`} sub={`${st.from} ~ ${st.to}`} />
            <Tile k="가운데 값" v={pct(st.q[2])} sub={`${pct(st.q[1], 2)} ~ ${pct(st.q[3], 2)}`} />
            <Tile k="최근 10건 평균" v={pct(st.recent)} />
            <Tile k="낙찰자 사정율" v={st.winner ? pct(st.winner.q[1]) : "자료 없음"} sub={st.winner ? `${st.winner.n}건 가운데 값` : undefined} />
          </dl>
          <AssessDistWide st={st} />
          {st.windows.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold">낙찰이 많이 몰린 구간</p>
              <ol className="mt-2 grid gap-2 sm:grid-cols-3">
                {st.windows.map((w, i) => (
                  <li key={w.lo} className="rounded-xl bg-paper px-3 py-2 text-sm">
                    <span className="font-bold tabular-nums">{i + 1}. {pct(w.lo, 2)} ~ {pct(w.hi, 2)}</span>
                    <span className="block text-xs text-ink-500">표본 {w.n}건 · 최근 가중 {Math.round(w.share * 100)}%</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : <p className="mt-3 text-sm text-ink-500">예정가격·기초금액이 공개된 낙찰이 적어 분포를 만들지 못했습니다.</p>}
    </section>
  );
}
