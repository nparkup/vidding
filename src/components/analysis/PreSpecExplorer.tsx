"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { won } from "@/lib/format";
import { bidHref } from "@/lib/links";
import { preSpecFileUrl, type PreSpec } from "@/lib/preSpecs";
import { useBids } from "@/lib/useBids";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const KEY = "bidmate.prespec.v1";
type Sort = "new" | "opinion" | "budget";
interface Saved { q: string; biz: string; cat: string; min: string; max: string; seen?: string }

function loadSaved(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const ddays = (iso?: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400e3) : undefined);

/** 사전규격 미리보기: 최근 2주 공개된 사전규격을 찾고, 관심 조건을 저장해 새로 올라온 건을 표시한다 */
export function PreSpecExplorer() {
  const [list, setList] = useState<PreSpec[] | null>(null);
  const { bids } = useBids();
  const [q, setQ] = useState("");
  const [biz, setBiz] = useState("");
  const [cat, setCat] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [openOnly, setOpenOnly] = useState(true);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetch(`${BASE}/prespecs-data.json`).then((r) => (r.ok ? r.json() : [])).then((l: PreSpec[]) => setList(l)).catch(() => setList([]));
    const s = loadSaved();
    if (s) { setSaved(s); setQ(s.q); setBiz(s.biz); setCat(s.cat); setMin(s.min); setMax(s.max); }
  }, []);

  const bidIds = useMemo(() => new Map((bids ?? []).map((b) => [b.bidNtceNo, b.id])), [bids]);
  const cats = useMemo(() => [...new Set((list ?? []).map((p) => p.category))].sort(), [list]);
  const shown = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    const lo = Number(min) * 1e4 || 0, hi = Number(max) * 1e4 || Infinity;
    const now = Date.now();
    const xs = (list ?? []).filter((p) =>
      (!biz || p.biz === biz) && (!cat || p.category === cat) && p.budget >= lo && p.budget <= hi &&
      (!openOnly || !p.opinionBy || new Date(p.opinionBy).getTime() >= now) &&
      words.every((w) => `${p.title} ${p.demand} ${p.agency} ${(p.items ?? []).join(" ")}`.includes(w)));
    const by: Record<Sort, (a: PreSpec, b: PreSpec) => number> = {
      new: (a, b) => b.postedAt.localeCompare(a.postedAt),
      opinion: (a, b) => (a.opinionBy ?? "9").localeCompare(b.opinionBy ?? "9"),
      budget: (a, b) => b.budget - a.budget,
    };
    return xs.sort(by[sort]);
  }, [list, q, biz, cat, min, max, sort, openOnly]);
  const isNew = (p: PreSpec) => !!saved?.seen && p.postedAt > saved.seen;
  const newCount = saved?.seen ? shown.filter(isNew).length : 0;

  function saveCond() {
    const s: Saved = { q, biz, cat, min, max, seen: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    setSaved({ ...s, seen: saved?.seen ?? s.seen });
  }

  return (
    <div className="container-x py-8">
      <div className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-6 sm:p-5">
        <label className="col-span-2 min-w-0">
          <span className="label">검색어</span>
          <input className="input" placeholder="예: CCTV, 급식, 청소" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="label">업무</span>
          <select className="input" value={biz} onChange={(e) => setBiz(e.target.value)}>
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
          <span className="label">예산 (만원 이상)</span>
          <input className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="min-w-0">
          <span className="label">예산 (만원 이하)</span>
          <input className="input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />의견 등록 마감 전만</label>
          <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="new">최근 공개순</option><option value="opinion">의견 마감 임박순</option><option value="budget">예산 큰순</option>
          </select>
          <button type="button" onClick={saveCond} className="btn-primary btn-sm ml-auto">이 조건 저장</button>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-500">
        {list ? `최근 2주 사전규격 ${list.length.toLocaleString()}건 중 ${shown.length.toLocaleString()}건` : "불러오는 중…"}
        {saved?.seen && ` · 저장한 조건 기준 지난 방문 뒤 새로 올라온 사전규격 ${newCount}건`}
      </p>

      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((p) => {
          const dd = ddays(p.opinionBy);
          const linked = p.bidNos.map((n) => bidIds.get(n.split("-")[0])).filter(Boolean) as string[];
          return (
            <li key={p.no} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                {isNew(p) && <span className="chip border-mint/30 bg-mint-50 text-mint-700">새로 올라옴</span>}
                <span className="chip">{p.biz}{p.div && p.div !== p.biz ? ` · ${p.div}` : ""}</span>
                <span className="chip">{p.category}</span>
                {dd !== undefined && <span className={`chip ${dd <= 2 ? "border-coral/30 bg-coral-100/60 text-coral" : ""}`}>의견 마감 {dd < 0 ? "지남" : dd === 0 ? "오늘" : `D-${dd}`}</span>}
                {p.bidNos.length > 0 && <span className="chip border-ink bg-ink text-white">본공고 나옴</span>}
              </div>
              <h3 className="mt-2 font-bold leading-snug">{p.title}</h3>
              <p className="mt-1 text-sm text-ink-500">
                {[p.demand, p.budget ? `배정예산 ${won(p.budget)}` : "", `공개 ${kstDay(p.postedAt)}`, p.opinionBy ? `의견 마감 ${p.opinionBy.slice(0, 16).replace("T", " ")}` : "", p.days ? `납품 ${p.days}일` : ""].filter(Boolean).join(" · ")}
              </p>
              {p.items && <p className="mt-0.5 text-xs text-ink-400">세부품명 {p.items.join(", ")}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.files.map((seq) => (
                  <a key={seq} href={preSpecFileUrl(p.no, seq)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">규격서 {seq}</a>
                ))}
                {linked.map((id) => <Link key={id} href={bidHref(id)} className="btn-mint btn-sm">본공고 분석 보기</Link>)}
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="btn-ghost mt-4 w-full">더 보기 ({(shown.length - limit).toLocaleString()}건 남음)</button>}
      <p className="mt-6 text-xs leading-relaxed text-ink-400">
        사전규격은 본공고 전에 규격서를 미리 공개하고 업체 의견을 받는 단계입니다.<br />금액과 내용은 본공고에서 바뀔 수 있습니다.<br />저장한 조건은 이 브라우저에만 남고, 맞춤공고 메일을 받는 고객은 같은 분야의 사전규격을 메일로도 받습니다.
      </p>
    </div>
  );
}
