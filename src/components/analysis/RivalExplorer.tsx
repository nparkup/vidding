"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DistChart } from "@/components/BidPriceAnalysis";
import { YearChart } from "@/components/charts/YearChart";
import { HBarList } from "@/components/charts/HBarList";
import { NetworkGraph, type NetEdge, type NetNode } from "@/components/charts/NetworkGraph";
import { CHART } from "@/components/charts/useWidth";
import { METHOD_NAME, bandLabel, bandOfAmount, methodCode, provinceKey, quantile } from "@/lib/awards/analysis";
import { assessStats, type AssessData, type AssessSample } from "@/lib/awards/assess";
import type { AwardLookup, AwardWin } from "@/lib/awards/read";
import { normalizeBizno, validBizno } from "@/lib/corpLookup";
import { won } from "@/lib/format";
import { CorpSearch } from "@/components/CorpSearch";
import { CorpIndustryLine, MineIndustry, corpIndustries } from "@/components/analysis/MineIndustry";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const API = STATIC ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "/api/premium/perf";
const KEYS = { rival: "bidmate.rivals.v1", mine: "bidmate.mycorp.v1" };
type Mode = keyof typeof KEYS;
const pct = (n: number, d = 3) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

interface Saved { bizno: string; name: string }
function loadSaved(mode: Mode): Saved[] {
  try { return JSON.parse(localStorage.getItem(KEYS[mode]) ?? "[]") as Saved[]; } catch { return []; }
}
function save(mode: Mode, list: Saved[]) {
  try { localStorage.setItem(KEYS[mode], JSON.stringify(list.slice(0, mode === "mine" ? 3 : 20))); } catch { /* 저장 못 해도 화면은 그대로 */ }
}

/** 경쟁사 투찰 성향: 사업자번호로 그 업체의 10년치 나라장터 낙찰을 모아 투찰 습관을 본다 */
/** mode "rival": 경쟁사 투찰 성향 (관심 업체 여러 곳), "mine": 우리 회사 투찰 진단 (진단 문장을 더 보여 준다) */
export function RivalExplorer({ mode = "rival" }: { mode?: Mode }) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [input, setInput] = useState("");
  const [bizno, setBizno] = useState("");
  const [data, setData] = useState<AwardLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    const l = loadSaved(mode);
    setSaved(l);
    // 우리 회사는 지난번 번호로 바로 조회한다
    if (mode === "mine" && l[0]) { setInput(l[0].bizno); look(l[0].bizno); }
    // 다른 화면(최근 낙찰 결과 등)에서 ?bizno= 로 넘어오면 그 업체를 바로 조회한다
    const q = mode === "rival" ? new URLSearchParams(window.location.search).get("bizno") : null;
    if (q) { setInput(q); look(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function look(no: string) {
    const n = normalizeBizno(no);
    if (!validBizno(n)) { setErr("사업자등록번호 10자리를 확인해 주세요."); return; }
    if (!API) { setErr("이 미리보기에서는 낙찰 조회를 쓸 수 없습니다."); return; }
    setErr(""); setLoading(true); setBizno(n); setData(null);
    try {
      const r = await fetch(`${API}?${new URLSearchParams({ awards: n })}`);
      const j = (await r.json()) as AwardLookup & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "조회 실패");
      if (!j.ready) throw new Error("낙찰 저장소를 다시 만드는 중입니다. 잠시 뒤 다시 시도해 주세요.");
      setData(j);
      const name = j.wins[0] ? winnerName(j.wins) : "";
      const next = [{ bizno: n, name }, ...loadSaved(mode).filter((s) => s.bizno !== n)];
      save(mode, next); setSaved(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
    } finally { setLoading(false); }
  }
  // 관계도에서 기업을 누르면 그 기업을 기준으로 다시 본다 (우리 회사 진단에서는 경쟁사 화면으로 넘긴다)
  const [back, setBack] = useState<Saved[]>([]);
  const router = useRouter();
  function pick(no: string) {
    if (mode === "mine") { router.push(`/analysis/rival?bizno=${no}`); return; }
    if (no === bizno) return;
    setBack((b) => [...b, { bizno, name: data ? winnerName(data.wins) : "" }].slice(-10));
    setInput(no); look(no);
    const el = document.getElementById("rival-no")?.closest(".container-x");
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: "smooth" });
  }
  const remove = (n: string) => { const next = saved.filter((s) => s.bizno !== n); save(mode, next); setSaved(next); };

  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[320px_1fr]">
      <aside className="min-w-0">
        <CorpSearch id="rival-no" label={mode === "mine" ? "우리 회사 사업자등록번호 또는 기업명" : "경쟁사 사업자등록번호 또는 기업명"}
          value={input} onChange={setInput} onBizno={(no) => look(no)} busy={loading} />
        {err && <p className="mt-2 text-sm text-coral">{err}</p>}
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{mode === "mine" ? "기업명으로 찾으면 같은 이름 업체를 사업자번호와 함께 보여 드립니다. 고른 번호는 이 브라우저에만 남아 다음에 바로 진단합니다." : "기업명으로 찾으면 같은 이름 업체를 사업자번호와 함께 보여 드립니다. 조회한 업체는 관심 업체로 이 브라우저에 남습니다. 공고 상세의 참가 예상 기업이나 개찰 순위에 나온 업체를 넣어 보세요."}</p>
        {saved.length > 0 && (
          <ul className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
            {saved.map((s) => (
              <li key={s.bizno} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${s.bizno === bizno ? "bg-mint-50" : ""}`}>
                <button type="button" className="min-w-0 text-left font-semibold" onClick={() => { setInput(s.bizno); look(s.bizno); }}>
                  {s.name || "업체명 없음"} <span className="text-xs font-normal text-ink-500">{s.bizno.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")}</span>
                </button>
                <button type="button" className="shrink-0 text-xs text-ink-400 hover:text-coral" onClick={() => remove(s.bizno)}>빼기</button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="min-w-0">
        {!data && !loading && <p className="card p-6 text-sm text-ink-500">사업자등록번호나 기업명을 넣으면 그 업체가 나라장터에서 낙찰받은 공고로 투찰 습관(사정율, 하한율 위 폭, 주요 발주처, 자주 맞붙는 업체)을 보여 드립니다.</p>}
        {loading && <p className="card p-6 text-sm text-ink-400">10년치 낙찰을 찾는 중…</p>}
        {back.length > 0 && !loading && (
          <button type="button" className="btn-ghost btn-sm mb-3" onClick={() => { const prev = back[back.length - 1]; setBack(back.slice(0, -1)); setInput(prev.bizno); look(prev.bizno); }}>
            이전 기업으로: {prev(back)}
          </button>
        )}
        {data && <RivalDetail wins={data.wins} bizno={bizno} from={data.meta?.from} mine={mode === "mine"} onPick={pick} />}
      </div>
    </div>
  );
}

const prev = (b: Saved[]) => b[b.length - 1].name || b[b.length - 1].bizno.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3");

function winnerName(wins: AwardWin[]) {
  return wins.find((w) => w.winner)?.winner ?? "";
}

export interface RivalMeet {
  /** 사업자번호 (개찰 순위 자료에 없으면 빈 값) */
  bizno: string;
  /** 그 업체의 순위 합·건수 (평균 순위용) */
  rankSum: number;
  n: number;
  /** 가장 최근에 함께 든 날 */
  last: string;
  /** 그 업체가 쓴 투찰률 (0 제외) */
  rates: number[];
}

export interface RivalProfile {
  n: number;
  years: [number, number, number][];
  groups: { label: string; n: number; rate?: number; gap?: number; bidders: number }[];
  agencies: [string, number, number][];
  rivals: [string, number][];
  /** 함께 개찰 1~5위에 든 업체가 어느 기관 공고에서 만났는지 [업체명, 기관, 횟수] */
  links: [string, string, number][];
  /** 함께 든 업체별 자세한 정보 (관계도 말풍선·기업 기준 전환용) */
  rivalInfo: Record<string, RivalMeet>;
  assess?: AssessData;
  firstShare?: number;
  /** 참가 지역(시·도)별 [지역, 건수, 낙찰금액 합] */
  regions: [string, number, number][];
  /** 금액 구간별 [구간 이름, 건수, 낙찰률 가운데 값(없으면 0)] (작은 구간부터) */
  bands: [string, number, number][];
  /** 최근 1년 낙찰 건수와 그 전 3년 연평균 */
  trend: { last: number; prevAvg: number };
}

/** 낙찰 목록 → 투찰 성향 요약 */
export function rivalProfile(wins: AwardWin[], bizno: string): RivalProfile {
  const seen = new Set<string>();
  const xs = wins.filter((w) => (seen.has(w.bidNtceNo) ? false : (seen.add(w.bidNtceNo), true))).sort((a, b) => b.date.localeCompare(a.date));
  const ys = new Map<number, [number, number]>();
  for (const w of xs) { const y = Number(w.date.slice(0, 4)); const v = ys.get(y) ?? [0, 0]; v[0]++; v[1] += w.amount; ys.set(y, v); }
  const g = new Map<string, AwardWin[]>();
  for (const w of xs) { const k = `${bizOf(w)} ${METHOD_NAME[methodCode(w.method)]}`; (g.get(k) ?? g.set(k, []).get(k)!).push(w); }
  const med = (v: number[]) => (v.length ? r3(quantile([...v].sort((a, b) => a - b), 0.5)) : undefined);
  const groups = [...g.entries()].map(([label, ws]) => ({
    label, n: ws.length,
    rate: med(ws.map((w) => w.rate).filter((v) => v > 0 && v <= 110)),
    gap: med(ws.filter((w) => w.rate > 0 && w.lwlt > 0).map((w) => w.rate - w.lwlt)),
    bidders: Math.round(med(ws.map((w) => w.bidders).filter((v) => v > 0)) ?? 0),
  })).sort((a, b) => b.n - a.n);
  const ag = new Map<string, [number, number]>();
  for (const w of xs) { const v = ag.get(w.agency) ?? [0, 0]; v[0]++; v[1] += w.amount; ag.set(w.agency, v); }
  const rv = new Map<string, number>();
  const lk = new Map<string, number>();
  const meet = new Map<string, RivalMeet>();
  let first = 0, ranked = 0;
  for (const w of xs) {
    if (!w.top.length) continue;
    ranked++;
    if (w.top.find((t) => t.bizno === bizno)?.rank === 1) first++;
    for (const t of w.top) {
      if (!t.name || t.bizno === bizno) continue;
      rv.set(t.name, (rv.get(t.name) ?? 0) + 1);
      const k = `${t.name}\t${w.agency}`;
      lk.set(k, (lk.get(k) ?? 0) + 1);
      const m = meet.get(t.name) ?? { bizno: "", rankSum: 0, n: 0, last: "", rates: [] };
      if (!m.bizno && t.bizno) m.bizno = t.bizno;
      m.n++; m.rankSum += t.rank;
      if (w.date > m.last) m.last = w.date;
      if (t.rate > 0 && t.rate <= 110) m.rates.push(t.rate);
      meet.set(t.name, m);
    }
  }
  // 이 업체의 사정율 = 낙찰금액 ÷ (기초금액 × 하한율)
  const samples: AssessSample[] = xs
    .filter((w) => w.base > 0 && w.lwlt > 0 && w.amount > 0 && !/협상/.test(w.method))
    .map((w): AssessSample => [w.date, r3((w.amount / (w.base * (w.lwlt / 100))) * 100), 0, 0])
    .filter((s) => s[1] > 95 && s[1] < 105)
    .slice(0, 200);
  const rg = new Map<string, [number, number]>();
  for (const w of xs) { const k = provinceKey(w.region || undefined).replace(/\+/g, "·"); const v = rg.get(k) ?? [0, 0]; v[0]++; v[1] += w.amount; rg.set(k, v); }
  const bd = new Map<string, AwardWin[]>();
  for (const w of xs) { const k = bandOfAmount(w.base || w.amount); (bd.get(k) ?? bd.set(k, []).get(k)!).push(w); }
  const yearAgo = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  const fourAgo = new Date(Date.now() - 4 * 365 * 86400e3).toISOString().slice(0, 10);
  return {
    regions: [...rg.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([n, [c, a]]) => [n, c, Math.round(a)]),
    bands: [...bd.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, ws]) => [bandLabel(k), ws.length, med(ws.map((w) => w.rate).filter((v) => v > 0 && v <= 110)) ?? 0]),
    trend: { last: xs.filter((w) => w.date >= yearAgo).length, prevAvg: Math.round((xs.filter((w) => w.date < yearAgo && w.date >= fourAgo).length / 3) * 10) / 10 },
    n: xs.length,
    years: [...ys.entries()].sort((a, b) => a[0] - b[0]).map(([y, [n, a]]) => [y, n, Math.round(a)]),
    groups,
    agencies: [...ag.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([n, [c, a]]) => [n, c, Math.round(a)]),
    rivals: [...rv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    links: [...lk.entries()].map(([k, c]) => { const [n, a] = k.split("\t"); return [n, a, c] as [string, string, number]; }),
    rivalInfo: Object.fromEntries([...rv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => [n, meet.get(n)!])),
    assess: samples.length ? { scope: "agency", samples } : undefined,
    firstShare: ranked >= 5 ? first / ranked : undefined,
  };
}
const bizOf = (w: AwardWin) => w.biz ?? (w.cls?.mainWork ? "공사" : "");

function RivalDetail({ wins, bizno, from, mine, onPick }: { wins: AwardWin[]; bizno: string; from?: string; mine?: boolean; onPick: (bizno: string) => void }) {
  const p = useMemo(() => rivalProfile(wins, bizno), [wins, bizno]);
  const name = winnerName(wins);
  const st = useMemo(() => assessStats(p.assess, [-3, 3]), [p]);
  const inds = useMemo(() => (mine ? corpIndustries(wins) : []), [wins, mine]);
  if (!p.n) return <p className="card p-6 text-sm text-ink-500">{from ? `${from} 이후 ` : ""}나라장터 낙찰 기록이 없습니다.</p>;
  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-xl font-extrabold">{name ? `${name} · ` : ""}낙찰 {p.n.toLocaleString()}건</h2>
        <p className="mt-1 text-sm text-ink-500">{from ? `${from} 이후 ` : ""}나라장터 낙찰 기준입니다.<br />떨어진 입찰은 공개 자료에 없어 넣지 않았습니다.{p.firstShare !== undefined ? ` 개찰 순위를 아는 낙찰 중 1위로 낙찰받은 비율 ${Math.round(p.firstShare * 100)}%.` : ""}</p>
        {mine && <CorpIndustryLine list={inds} />}
        <YearChart years={p.years.slice(-10).map(([y, n, a]) => [y, n, a])} title="연도별 낙찰" />
        <Link href={`/contracts?corp=${bizno}`} className="btn-ghost btn-sm mt-4 inline-flex">이 업체의 최근 2주 계약 보기</Link>
      </section>
      <section className="card p-6">
        <h3 className="font-bold">계약방법별 투찰</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="table-x min-w-[460px]">
            <thead className="text-xs text-ink-500"><tr><th className="py-1.5">업무·계약방법</th><th>낙찰</th><th>낙찰률 가운데</th><th>하한율 위 폭</th><th>참가업체</th></tr></thead>
            <tbody className="divide-y divide-ink-100">
              {p.groups.slice(0, 6).map((g) => (
                <tr key={g.label}>
                  <td className="py-2 font-semibold">{g.label}</td>
                  <td className="tabular-nums">{g.n}</td>
                  <td className="tabular-nums">{g.rate ? pct(g.rate) : "-"}</td>
                  <td className="tabular-nums">{g.gap !== undefined ? `${g.gap >= 0 ? "+" : ""}${g.gap.toFixed(3)}%p` : "-"}</td>
                  <td className="tabular-nums">{g.bidders ? `${g.bidders}곳` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h3 className="font-bold">이 업체가 쓴 사정율 <span className="text-sm font-normal text-ink-400">낙찰금액 ÷ (기초금액 × 하한율)</span></h3>
          {st ? (
            <>
              <DistChart st={st} />
              <p className="mt-2 text-xs text-ink-500">{st.n}건 · 가운데 값 {pct(st.q[2])} · 가장 많이 쓴 구간 {st.windows[0] ? `${pct(st.windows[0].lo, 2)}~${pct(st.windows[0].hi, 2)}` : "-"}</p>
            </>
          ) : <p className="mt-3 text-sm text-ink-500">기초금액·하한율이 공개된 가격 경쟁 낙찰이 적어 분포를 만들지 못했습니다.</p>}
        </section>
        <section className="card p-6">
          <h3 className="font-bold">주요 발주처</h3>
          <HBarList rows={p.agencies.map(([n, c, a]) => ({ label: n, value: c, text: `${c}건 · ${won(a)}` }))} />
          {p.rivals.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-500">이 업체가 낙찰받을 때 개찰 1~5위에 함께 든 업체: {p.rivals.slice(0, 8).map(([n, c]) => `${n} ${c}회`).join(", ")}</p>
          )}
        </section>
      </div>
      <RivalNetwork p={p} name={name || "이 업체"} onPick={onPick} mine={mine} />
      {mine && <Diagnosis p={p} st={st} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h3 className="font-bold">지역별 낙찰 <span className="text-sm font-normal text-ink-400">공고 참가 지역 기준</span></h3>
          <HBarList rows={p.regions.map(([n, c, a]) => ({ label: n === "전국" ? "지역 제한 없음" : n, value: c, text: `${c}건 · ${won(a)}` }))} />
        </section>
        <section className="card p-6">
          <h3 className="font-bold">금액 구간별 낙찰 <span className="text-sm font-normal text-ink-400">기초금액 기준</span></h3>
          <HBarList rows={p.bands.map(([n, c, r]) => ({ label: n, value: c, text: `${c}건${r ? ` · 낙찰률 가운데 ${pct(r)}` : ""}` }))} />
        </section>
      </div>
      <section className="card p-6">
        <h3 className="font-bold">최근 낙찰</h3>
        <ul className="mt-3 divide-y divide-ink-100">
          {wins.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map((w) => (
            <li key={`${w.bidNtceNo}-${w.bidNtceOrd}`} className="py-2 text-sm">
              <p className="font-semibold">{w.title}</p>
              <p className="text-xs text-ink-500">{[w.date, w.agency, `낙찰금액 ${won(w.amount)}${w.rate ? ` (낙찰률 ${pct(w.rate)})` : ""}`, w.lwlt ? `하한율 ${pct(w.lwlt)}` : "", w.bidders ? `${w.bidders}곳` : ""].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>
      {mine && <MineIndustry list={inds} name={name} />}
    </div>
  );
}

/** 우리 회사 투찰 진단: 숫자를 문장으로 */
function Diagnosis({ p, st }: { p: RivalProfile; st: ReturnType<typeof assessStats> }) {
  const lines: string[] = [];
  const top = p.groups[0];
  if (top) lines.push(`주력은 ${top.label}입니다 (낙찰 ${p.n}건 중 ${top.n}건).`);
  const q = p.groups.find((g) => /적격/.test(g.label) && g.gap !== undefined);
  if (q?.gap !== undefined) lines.push(q.gap < 0.3 ? `${q.label}에서 낙찰하한율 바로 위(가운데 +${q.gap.toFixed(3)}%p)에 붙여 쓰는 편입니다. 사정율이 조금만 어긋나도 하한율 아래로 떨어질 수 있습니다.` : `${q.label}에서 낙찰하한율보다 가운데 +${q.gap.toFixed(3)}%p 높게 써서 낙찰받았습니다. 경쟁이 센 공고에서는 더 낮은 업체에 밀릴 수 있습니다.`);
  if (st?.windows[0]) lines.push(`낙찰 때 쓴 사정율은 ${pct(st.windows[0].lo, 2)}~${pct(st.windows[0].hi, 2)}에 가장 많이 모였습니다. 발주처 분석의 기관 사정율 분포와 비교해 보세요.`);
  if (p.firstShare !== undefined) lines.push(`개찰 순위를 아는 낙찰 중 ${Math.round(p.firstShare * 100)}%를 1위로 받았습니다${p.firstShare < 0.6 ? ". 앞 순위 업체가 적격심사에서 떨어져 차례가 온 경우가 많다는 뜻입니다" : ""}.`);
  if (p.trend.prevAvg > 0) lines.push(p.trend.last >= p.trend.prevAvg ? `최근 1년 낙찰 ${p.trend.last}건으로 그 전 3년 평균(${p.trend.prevAvg}건)보다 많습니다.` : `최근 1년 낙찰 ${p.trend.last}건으로 그 전 3년 평균(${p.trend.prevAvg}건)보다 적습니다.`);
  if (p.agencies[0]) lines.push(`가장 많이 낙찰받은 기관은 ${p.agencies[0][0]}(${p.agencies[0][1]}건)입니다.`);
  return (
    <section className="card p-6">
      <h3 className="font-bold">진단</h3>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
        {lines.map((l) => <li key={l} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />{l}</li>)}
      </ul>
    </section>
  );
}

/** 관계도 말풍선에 쓰는 업체 요약. 한 번 받은 업체는 이 화면에 있는 동안 다시 받지 않는다 */
interface CorpBrief { n: number; amount: number; last1y: number; main?: string; agencies: string[]; recent?: AwardWin; from?: string }
const briefCache = new Map<string, CorpBrief | "loading" | "error">();
async function loadBrief(no: string): Promise<CorpBrief> {
  const r = await fetch(`${API}?${new URLSearchParams({ awards: no })}`);
  const j = (await r.json()) as AwardLookup & { error?: string };
  if (!r.ok || j.error || !j.ready) throw new Error("조회 실패");
  const p = rivalProfile(j.wins, no);
  const recent = j.wins.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  return { n: p.n, amount: p.years.reduce((t, y) => t + y[2], 0), last1y: p.trend.last, main: p.groups[0]?.label.trim() || undefined, agencies: p.agencies.slice(0, 3).map(([a, c]) => `${a} ${c}건`), recent, from: j.meta?.from };
}
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** 관계도: 이 업체 ― 주요 발주처 ― 그 기관 공고에서 개찰 1~5위에 함께 든 업체 */
function RivalNetwork({ p, name, onPick, mine }: { p: RivalProfile; name: string; onPick: (bizno: string) => void; mine?: boolean }) {
  const [, bump] = useState(0);
  const g = useMemo(() => {
    const ags = new Set(p.agencies.map(([a]) => a));
    const rivals = p.rivals.slice(0, 10);
    const nodes: NetNode[] = [
      { id: "me", label: name, group: "me", weight: p.n, tip: [name, `낙찰 ${p.n.toLocaleString()}건`] },
      ...p.agencies.map(([a, c, amt]): NetNode => {
        const met = p.links.filter(([n, ag]) => ag === a && p.rivalInfo[n]).sort((x, y) => y[2] - x[2]);
        return { id: `a:${a}`, label: a, group: "agency", weight: c, tip: [a, `${name} 낙찰 ${c}건 · ${won(amt)}`, ...(met.length ? [`이 기관 공고에서 함께 든 업체: ${met.slice(0, 3).map(([n, , k]) => `${cut(n, 10)} ${k}회`).join(", ")}`] : [])] };
      }),
      ...rivals.map(([r, c]): NetNode => ({ id: `r:${r}`, label: r, group: "rival", weight: c, tip: [r, `${name} 낙찰 공고에서 개찰 1~5위에 함께 든 횟수 ${c}회`] })),
    ];
    const edges: NetEdge[] = p.agencies.map(([a, c]) => ({ a: "me", b: `a:${a}`, w: c }));
    for (const [r, c] of rivals) {
      const ls = p.links.filter(([n, a]) => n === r && ags.has(a));
      for (const [, a, k] of ls) edges.push({ a: `r:${r}`, b: `a:${a}`, w: k });
      if (!ls.length) edges.push({ a: "me", b: `r:${r}`, w: c });
    }
    return { nodes, edges };
  }, [p, name]);
  const infoOf = (n: NetNode) => (n.id.startsWith("r:") ? p.rivalInfo[n.id.slice(2)] : undefined);
  const focusNode = (n: NetNode) => {
    const no = infoOf(n)?.bizno;
    if (!no || !API || briefCache.has(no)) return;
    briefCache.set(no, "loading");
    loadBrief(no).then((b) => briefCache.set(no, b), () => briefCache.set(no, "error")).finally(() => bump((v) => v + 1));
  };
  const tipOf = (n: NetNode, touch: boolean): string[] => {
    const m = infoOf(n);
    if (!m) return n.tip;
    const lines = [n.label];
    const rank = m.n ? Math.round((m.rankSum / m.n) * 10) / 10 : 0;
    const rate = m.rates.length ? quantile([...m.rates].sort((a, b) => a - b), 0.5) : 0;
    lines.push(`## ${cut(name, 14)} 낙찰 공고에서`);
    lines.push(`개찰 1~5위에 함께 든 횟수 ${m.n}회${rank ? ` · 평균 ${rank}위` : ""}`);
    if (rate) lines.push(`그때 쓴 투찰률 가운데 ${pct(rate)}`);
    if (m.last) lines.push(`마지막으로 함께 든 날 ${m.last}`);
    const ags = p.links.filter(([r]) => r === n.label).sort((a, b) => b[2] - a[2]).slice(0, 2);
    if (ags.length) lines.push(`만난 기관: ${ags.map(([, a, k]) => `${cut(a, 12)} ${k}회`).join(", ")}`);
    const b = m.bizno ? briefCache.get(m.bizno) : undefined;
    if (!m.bizno) lines.push("사업자번호가 없어 자세한 낙찰 정보를 볼 수 없습니다.");
    else if (b === "loading" || b === undefined) lines.push("이 업체의 10년 낙찰을 불러오는 중…");
    else if (b === "error") lines.push("이 업체의 낙찰 정보를 불러오지 못했습니다.");
    else {
      lines.push(`## 이 업체의 낙찰 (${b.from ? `${b.from.slice(0, 4)}년 이후` : "나라장터"})`);
      lines.push(`${b.n.toLocaleString()}건 · ${won(b.amount)}`);
      lines.push(`최근 1년 ${b.last1y}건${b.main ? ` · 주력 ${b.main}` : ""}`);
      if (b.agencies.length) lines.push(`주요 발주처: ${b.agencies.map((a) => cut(a, 14)).join(", ")}`);
      if (b.recent) lines.push(`최근 낙찰: ${b.recent.date} ${cut(b.recent.title, 24)} ${won(b.recent.amount)}`);
    }
    if (m.bizno) lines.push(`## ${touch ? "아래 버튼으로" : "누르면"}${mine ? " 경쟁사 투찰 성향에서" : ""} 이 업체 기준으로 봅니다`);
    return lines;
  };
  if (!p.agencies.length) return null;
  return (
    <section className="card p-6">
      <h3 className="font-bold">발주처·경쟁 업체 관계도 <span className="text-sm font-normal text-ink-400">원 크기 = 건수, 선 굵기 = 함께 나온 횟수</span></h3>
      <NetworkGraph
        nodes={g.nodes} edges={g.edges} centerId="me" ariaLabel="발주처와 경쟁 업체 관계도"
        groups={[{ key: "agency", label: "주요 발주처 (낙찰 건수)", color: CHART.cat[0] }, { key: "rival", label: "개찰 1~5위에 함께 든 업체 (횟수)", color: CHART.cat[1] }]}
        tipOf={tipOf} tipWidth={260} onFocusNode={focusNode}
        canOpen={(n) => !!infoOf(n)?.bizno} onOpen={(n) => onPick(infoOf(n)!.bizno)} openLabel="이 기업 기준으로 보기"
      />
      <p className="mt-2 text-xs leading-relaxed text-ink-500">업체와 기관을 잇는 선은 그 기관 공고에서 이 업체가 낙찰받을 때 그 업체가 개찰 1~5위에 함께 든 경우입니다.<br />개찰 순위는 받아 둔 공고만 셉니다.<br />업체 원에 마우스를 올리면 그 업체의 낙찰 정보가 보이고, 누르면 그 업체를 기준으로 관계도를 다시 그립니다.<br />휴대폰에서는 한 번 눌러 정보를 보고 아래 버튼으로 넘어갑니다.</p>
    </section>
  );
}
