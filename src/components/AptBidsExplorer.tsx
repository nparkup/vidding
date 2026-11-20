"use client";

import { useEffect, useMemo, useState } from "react";
import { APT_CATEGORIES, APT_REGIONS, aptDetailUrl, aptFileUrl, type AptBid, type AptBidsFile } from "@/lib/apt";
import { dateTime, shortDate, won, wonFull } from "@/lib/format";
import { loadSiteJson } from "@/lib/useSiteJson";
import { CloseDdayBadge } from "./Badges";
import { CloseDay } from "./CloseDay";

const PAGE = 50;
const KEY = "bidmate.aptbids.v1";
type Sort = "close" | "new" | "prior";
interface Saved { cats: string[]; region: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const hoursLeft = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3600e3;

/** 아파트(공동주택) 입찰공고 검색: 분야·지역·검색어로 거르고, 펼치면 일정·서류·첨부·직전 낙찰을 본다 */
export function AptBidsExplorer() {
  const [data, setData] = useState<AptBidsFile | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [sort, setSort] = useState<Sort>("close");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    loadSiteJson<AptBidsFile>("apt-bids-data.json").then(setData).catch(() => setError(true));
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      if (s) { setCats(s.cats ?? []); setRegion(s.region ?? ""); }
    } catch { /* 저장값이 없으면 기본 조건 */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ cats, region } satisfies Saved)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    setLimit(PAGE);
  }, [cats, region]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data?.items ?? []) if (hoursLeft(b.closeAt) > 0 && (!region || b.region === region)) m.set(b.category, (m.get(b.category) ?? 0) + 1);
    return m;
  }, [data, region]);

  const shown = useMemo(() => {
    const all = q.trim().split(/\s+/).filter(Boolean);
    const words = all.filter((w) => !w.startsWith("-")).map(norm);
    const not = all.filter((w) => w.startsWith("-") && w.length > 1).map((w) => norm(w.slice(1)));
    const xs = (data?.items ?? []).filter((b) => {
      const left = hoursLeft(b.closeAt);
      if (left <= 0 || (urgent && left > 72)) return false;
      if (cats.length && !cats.includes(b.category)) return false;
      if (region && b.region !== region) return false;
      const hay = norm(`${b.title} ${b.apt} ${b.classLabel} ${b.no}`);
      return words.every((w) => hay.includes(w)) && !not.some((w) => hay.includes(w));
    });
    const by: Record<Sort, (a: AptBid, b: AptBid) => number> = {
      close: (a, b) => a.closeAt.localeCompare(b.closeAt),
      new: (a, b) => b.postedAt.localeCompare(a.postedAt) || a.closeAt.localeCompare(b.closeAt),
      prior: (a, b) => (b.prior?.amount ?? -1) - (a.prior?.amount ?? -1),
    };
    return xs.sort(by[sort]);
  }, [data, q, cats, region, urgent, sort]);

  if (error) return <div className="card mt-6 p-10 text-center text-ink-500">아파트 공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>;
  if (!data) return <div className="card mt-6 p-10 text-center text-ink-500">아파트 공고를 불러오는 중…</div>;

  const toggle = (c: string) => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);
  return (
    <>
      <div className="card mt-6 grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="공고명, 단지명 검색 (예: 경비, 헬리오시티, -재활용)" className="input min-w-0" aria-label="검색어" />
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="input sm:w-36" aria-label="지역">
          <option value="">전국</option>
          {APT_REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-[#0FA37F]" /> 3일 내 마감
        </label>
        <div className="flex min-w-0 flex-wrap gap-1.5 sm:col-span-3">
          <button type="button" onClick={() => setCats([])} className={`rounded-full border px-3 py-1.5 text-sm ${cats.length === 0 ? "border-mint bg-mint text-white" : "border-ink-100 bg-white text-ink-500"}`}>전체 분야</button>
          {APT_CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={cats.includes(c)} className={`rounded-full border px-3 py-1.5 text-sm ${cats.includes(c) ? "border-mint bg-mint text-white" : "border-ink-100 bg-white text-ink-500"}`}>
              {c} <span className="tabular-nums opacity-70">{(counts.get(c) ?? 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{shown.length.toLocaleString()}건 · 분야와 지역은 이 기기에 저장됩니다</p>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          <span className="whitespace-nowrap">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input h-9 w-auto py-0 pr-8 text-sm" aria-label="정렬 기준">
            <option value="close">마감 임박순</option>
            <option value="new">최신 공고순</option>
            <option value="prior">직전 낙찰금액 높은순</option>
          </select>
        </label>
      </div>
      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((b) => <AptRow key={b.no} bid={b} />)}
        {shown.length === 0 && <li className="card p-10 text-center text-ink-500">검색 조건에 맞는 공고가 없습니다.</li>}
      </ul>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="btn-ghost mt-4 w-full">
          더 보기 ({limit.toLocaleString()} / {shown.length.toLocaleString()}건)
        </button>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-300">
        출처: 국토교통부 공동주택관리정보시스템(K-apt) 입찰공고·입찰결과공지. K-apt와 조달청·민간 전자입찰을 거친 공고가 함께 들어옵니다.
        직전 낙찰은 같은 단지·같은 분야의 최근 2년 낙찰 중 가장 최근 건입니다. 투찰 전 반드시 공고문 원문을 확인하세요.
      </p>
    </>
  );
}

function Fact({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-ink-500">{k}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}

function AptRow({ bid: b }: { bid: AptBid }) {
  return (
    <li className="min-w-0 rounded-2xl border border-ink-100 bg-white transition hover:border-mint">
      <details className="group">
        <summary className="grid min-w-0 cursor-pointer list-none grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <CloseDdayBadge iso={b.closeAt} />
              <span className="chip">{b.category}</span>
              {b.region && <span className="chip">{b.region}</span>}
              {b.award && <span className="chip">{b.award}</span>}
              {b.kind && b.kind !== "일반경쟁" && <span className="chip">{b.kind}</span>}
              {b.state !== "신규공고" && <span className="chip border-amber/40 bg-amber-100/60 text-ink">{b.state}</span>}
              {b.urgent && <span className="chip border-coral/30 bg-coral-100/60 text-coral">긴급</span>}
            </div>
            <p className="mt-2 text-[16px] font-semibold leading-snug group-hover:text-mint-600 [overflow-wrap:anywhere]">
              <CloseDay iso={b.closeAt} />
              {b.title}
            </p>
            <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{b.apt}{b.system ? ` · ${b.system}` : ""}{b.way ? ` ${b.way}` : ""}</p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
            {b.prior ? (
              <div>
                <p className="text-xs text-ink-500">직전 낙찰</p>
                <p className="text-lg font-bold tabular-nums">{won(b.prior.amount)}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-300">직전 낙찰 자료 없음</p>
            )}
            <p className="text-xs text-ink-300">마감 {shortDate(b.closeAt)} · 펼쳐 보기</p>
          </div>
        </summary>
        <div className="grid min-w-0 gap-4 border-t border-ink-100 p-4 sm:grid-cols-2 sm:p-5">
          <dl className="min-w-0 divide-y divide-ink-100/70">
            <Fact k="입찰번호" v={b.no} />
            <Fact k="입찰분류" v={b.classLabel} />
            <Fact k="공고일" v={b.postedAt} />
            <Fact k="입찰 마감" v={dateTime(b.closeAt)} />
            <Fact k="현장설명" v={[b.briefingAt && dateTime(b.briefingAt), b.briefingPlace].filter(Boolean).join(" · ") || undefined} />
            <Fact k="서류 마감" v={b.docsBy && b.docsBy !== b.closeAt ? dateTime(b.docsBy) : undefined} />
            <Fact k="구비서류" v={b.docs} />
            <Fact k="입찰보증금" v={b.guarantee ? "입찰가격의 5% 이상 제출" : undefined} />
            <Fact k="지급조건" v={b.payTerms} />
          </dl>
          <div className="min-w-0 space-y-3">
            {b.prior && (
              <div className="rounded-xl bg-paper p-3 text-sm">
                <p className="font-semibold">같은 단지 직전 {b.category} 낙찰</p>
                <p className="mt-1 text-ink-500 [overflow-wrap:anywhere]">{b.prior.title}</p>
                <p className="mt-1 tabular-nums"><b>{wonFull(b.prior.amount)}</b>{b.prior.start && b.prior.end ? ` · 계약 ${b.prior.start} ~ ${b.prior.end}` : ""}</p>
              </div>
            )}
            {b.content && <p className="whitespace-pre-line text-sm text-ink-700 [overflow-wrap:anywhere]">{b.content}</p>}
            <div className="flex flex-wrap gap-2">
              {(b.files ?? []).map((f, i) => (
                <a key={f} href={aptFileUrl(f)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">공고 첨부{(b.files?.length ?? 0) > 1 ? ` ${i + 1}` : ""} 내려받기</a>
              ))}
              <a href={aptDetailUrl(b.no)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">K-apt 원문 보기</a>
            </div>
          </div>
        </div>
      </details>
    </li>
  );
}
