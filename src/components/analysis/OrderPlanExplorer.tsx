"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ColumnChart, MetricToggle } from "@/components/charts/ColumnChart";
import { won, wonFull } from "@/lib/format";
import { bidHref } from "@/lib/links";
import { orderPlanUrl, type OrderPlan } from "@/lib/orderPlans";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const KEY = "bidmate.plans.v1";
type Sort = "month" | "amount" | "new";
interface Saved { q: string; biz: string; cat: string; month: string; min: string; max: string; seen?: string }

function loadSaved(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;

/** 발주계획 모아보기: 이번 달부터 몇 달 동안 발주 예정인 사업을 찾고, 관심 조건을 저장해 새로 올라온 계획을 표시한다 */
export function OrderPlanExplorer() {
  const [list, setList] = useState<OrderPlan[] | null>(null);
  const [q, setQ] = useState("");
  const [biz, setBiz] = useState("");
  const [cat, setCat] = useState("");
  const [month, setMonth] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetch(`${BASE}/order-plans-data.json`).then((r) => (r.ok ? r.json() : [])).then((l: OrderPlan[]) => setList(l)).catch(() => setList([]));
    const s = loadSaved();
    if (s) { setSaved(s); setQ(s.q); setBiz(s.biz); setCat(s.cat); setMonth(s.month); setMin(s.min); setMax(s.max); }
  }, []);

  const cats = useMemo(() => [...new Set((list ?? []).filter((p) => !biz || p.biz === biz).map((p) => p.category))].sort(), [list, biz]);
  const months = useMemo(() => [...new Set((list ?? []).map((p) => p.month))].sort(), [list]);
  /** 예정월만 빼고 거른 목록 (월별 차트용) */
  const anyMonth = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    const lo = Number(min) * 1e4 || 0, hi = Number(max) * 1e4 || Infinity;
    return (list ?? []).filter((p) =>
      (!biz || p.biz === biz) && (!cat || p.category === cat) &&
      (!lo || p.amount >= lo) && (hi === Infinity || (p.amount > 0 && p.amount <= hi)) &&
      words.every((w) => `${p.title} ${p.agency} ${p.top ?? ""} ${p.item ?? ""} ${p.site ?? ""}`.includes(w)));
  }, [list, q, biz, cat, min, max]);
  const shown = useMemo(() => {
    const xs = anyMonth.filter((p) => !month || p.month === month);
    const by: Record<Sort, (a: OrderPlan, b: OrderPlan) => number> = {
      month: (a, b) => a.month.localeCompare(b.month) || b.amount - a.amount,
      amount: (a, b) => b.amount - a.amount,
      new: (a, b) => b.postedAt.localeCompare(a.postedAt),
    };
    return xs.sort(by[sort]);
  }, [anyMonth, month, sort]);
  const isNew = (p: OrderPlan) => !!saved?.seen && p.postedAt > saved.seen;
  const newCount = saved?.seen ? shown.filter(isNew).length : 0;
  const total = useMemo(() => shown.reduce((s, p) => s + p.amount, 0), [shown]);

  function saveCond() {
    const s: Saved = { q, biz, cat, month, min, max, seen: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    setSaved({ ...s, seen: saved?.seen ?? s.seen });
  }

  return (
    <div className="container-x py-8">
      <div className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-7 sm:p-5">
        <label className="col-span-2 min-w-0">
          <span className="label">검색어</span>
          <input className="input" placeholder="사업명·기관·지역 (예: 청소, 경기도)" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="label">업무</span>
          <select className="input" value={biz} onChange={(e) => { setBiz(e.target.value); setCat(""); }}>
            <option value="">전체</option><option>용역</option><option>공사</option><option>물품</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">분야</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">전체</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">발주 예정월</span>
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">전체</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">금액 (만원 이상)</span>
          <input className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="min-w-0">
          <span className="label">금액 (만원 이하)</span>
          <input className="input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-span-7">
          <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="new">최근 올라온 순</option><option value="month">발주 예정월 빠른순</option><option value="amount">금액 큰순</option>
          </select>
          <button type="button" onClick={saveCond} className="btn-primary btn-sm ml-auto">이 조건 저장</button>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-500">
        {list ? `발주 예정 ${list.length.toLocaleString()}건 중 ${shown.length.toLocaleString()}건${total ? ` · 합계 ${won(total)}` : ""}` : "불러오는 중…"}
        {saved?.seen && ` · 저장한 조건 기준 지난 방문 뒤 새로 올라온 계획 ${newCount}건`}
      </p>

      <MonthChart plans={anyMonth} month={month} onPick={(m) => setMonth(month === m ? "" : m)} />

      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((p) => (
          <li key={p.no} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-1.5">
              {isNew(p) && <span className="chip border-mint/30 bg-mint-50 text-mint-700">새로 올라옴</span>}
              <span className="chip border-ink bg-ink text-white">{monthLabel(p.month)} 발주 예정</span>
              <span className="chip">{p.biz}{p.div && p.div !== p.biz ? ` · ${p.div}` : ""}</span>
              <span className="chip">{p.category}</span>
              <span className="chip">{p.method}</span>
              {p.central && <span className="chip">조달청 대행</span>}
              {p.bidIds?.length ? <span className="chip border-mint/30 bg-mint-50 text-mint-700">공고 나온 것으로 보임</span> : null}
            </div>
            <h3 className="mt-2 font-bold leading-snug [overflow-wrap:anywhere]">{p.title}</h3>
            <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">
              {[p.top && !p.agency.startsWith(p.top) ? `${p.top} ${p.agency}` : p.agency, p.amount ? `발주 예정 금액 ${won(p.amount)} (${wonFull(p.amount)})` : "금액 미공개", p.site ? `현장 ${p.site}` : "", p.work ? `${p.work}공사` : "", p.item ? `품목 ${p.item}` : "", p.kind ?? ""].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {[`게시 ${kstDay(p.postedAt)}`, p.dept ? `담당 ${p.dept}` : "", p.tel ?? ""].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={orderPlanUrl(p.no)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">나라장터 발주계획 보기</a>
              {(p.bidIds ?? []).map((id) => <Link key={id} href={bidHref(id)} className="btn-mint btn-sm">진행 중인 공고 보기</Link>)}
            </div>
          </li>
        ))}
      </ul>
      {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="btn-ghost mt-4 w-full">더 보기 ({(shown.length - limit).toLocaleString()}건 남음)</button>}
      <p className="mt-6 text-xs leading-relaxed text-ink-400">
        발주계획은 기관이 앞으로 발주할 사업을 미리 올린 예정 목록입니다. 시기와 금액은 실제 공고에서 바뀌거나 취소될 수 있습니다. 이미 공고가 연결된 계획과 수의계약 계획은 뺐습니다. &quot;공고 나온 것으로 보임&quot;은 같은 기관의 비슷한 이름 공고를 찾아 붙인 것이라 직접 확인이 필요합니다. 저장한 조건은 이 브라우저에만 남습니다.
      </p>
    </div>
  );
}

/** 발주 예정월별 건수·금액. 막대를 누르면 그 달만 본다 */
function MonthChart({ plans, month, onPick }: { plans: OrderPlan[]; month: string; onPick: (m: string) => void }) {
  const [m, setM] = useState<"n" | "amt">("n");
  const rows = useMemo(() => {
    const d = new Map<string, [number, number, number]>();
    for (const p of plans) { const v = d.get(p.month) ?? [0, 0, 0]; v[0]++; v[1] += p.amount; if (p.amount > 0) v[2]++; d.set(p.month, v); }
    return [...d.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans]);
  if (rows.length < 2 && !month) return null;
  return (
    <section className="card mt-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">발주 예정월별 {m === "n" ? "건수" : "금액 합계"} <span className="font-normal text-ink-400">막대를 누르면 그 달만 봅니다</span></p>
        <MetricToggle value={m} onChange={setM} options={[["n", "건수"], ["amt", "금액"]]} />
      </div>
      <ColumnChart
        ariaLabel="발주 예정월별 발주계획" height={170} onPick={onPick}
        fmt={m === "n" ? (v) => `${Math.round(v).toLocaleString()}건` : (v) => (v ? won(v) : "0")}
        cols={rows.map(([mo, [n, a, priced]]) => ({ key: mo, label: `${Number(mo.slice(5))}월`, value: m === "n" ? n : a, hot: mo === month, tip: [monthLabel(mo), `${n.toLocaleString()}건`, `금액 합계 ${won(a)}${priced < n ? ` (금액 공개 ${priced.toLocaleString()}건)` : ""}`] }))}
      />
    </section>
  );
}
