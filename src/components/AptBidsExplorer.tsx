"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { APT_CATEGORIES, APT_REGIONS, type AptBid, type AptBidsFile } from "@/lib/apt";
import { shortDate, won } from "@/lib/format";
import { aptBidHref } from "@/lib/links";
import { loadSiteJson } from "@/lib/useSiteJson";
import { CloseDdayBadge } from "./Badges";
import { CloseDay } from "./CloseDay";
import { Tile } from "./CategoryTiles";
import { ArrowUpDown, BrushCleaning, Building, Droplets, Ellipsis, HardHat, LayoutGrid, Package, PlugZap, Shield, SprayCan, type LucideIcon } from "lucide-react";

/** 아파트 공고 업종별 선 아이콘 (공고 검색 업종 타일과 같은 모양) */
const APT_ICONS: Record<string, LucideIcon> = {
  청소: BrushCleaning,
  경비: Shield,
  소독: SprayCan,
  승강기유지: ArrowUpDown,
  전기안전관리: PlugZap,
  "정화조·저수조": Droplets,
  "기타 용역": Ellipsis,
  "주택관리(위탁)": Building,
  공사: HardHat,
  "물품·기타": Package,
};

const PAGE = 50;
/** 직전 낙찰을 비교하는 분야 (공사·기타는 단지마다 일이 달라 비교하지 않는다) */
const COMPARABLE = new Set<string>(["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "주택관리(위탁)"]);
const KEY = "bidmate.aptbids.v1";
type Sort = "close" | "new" | "prior";
interface Saved { cats: string[]; region: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const hoursLeft = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3600e3;

/** 아파트(공동주택) 입찰공고 검색: 분야·지역·검색어로 거르고, 누르면 공고 상세(/apt-bids/view)로 간다 */
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
      <section className="card mt-6 p-4 sm:p-5" aria-label="업종 선택">
        <p className="text-sm font-bold">업종으로 찾기 <span className="font-normal text-ink-400">여러 개 고를 수 있습니다</span></p>
        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 lg:grid-cols-11">
          <Tile icon={LayoutGrid} label="전체" title="전체 업종" count={[...counts.values()].reduce((a, b) => a + b, 0)} on={cats.length === 0} onClick={() => setCats([])} />
          {APT_CATEGORIES.map((c) => (
            <Tile key={c} icon={APT_ICONS[c] ?? Ellipsis} label={c} count={counts.get(c) ?? 0} on={cats.includes(c)} onClick={() => toggle(c)} />
          ))}
        </div>
      </section>

      <div className="card mt-3 grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="공고명·단지명 (예: 경비, -재활용)" className="input col-span-2 min-w-0 sm:col-span-1" aria-label="검색어" />
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="input sm:w-36" aria-label="지역">
          <option value="">전국</option>
          {APT_REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-[#0FA37F]" /> 3일 내 마감
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{shown.length.toLocaleString()}건 · 업종과 지역은 이 기기에 저장됩니다</p>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          <span className="whitespace-nowrap">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input h-9 w-auto py-0 pr-8 text-sm" aria-label="정렬 기준">
            <option value="close">마감 임박순</option>
            <option value="new">최신 공고순</option>
            <option value="prior">직전 계약금액 높은순</option>
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
        출처: 국토교통부 공동주택관리정보시스템(K-apt) 입찰공고·입찰결과공지·수의계약 공지. K-apt와 조달청·민간 전자입찰을 거친 공고가 함께 들어옵니다.
        직전 계약은 같은 단지·같은 업종의 최근 3개 연도 낙찰·수의계약 중 가장 최근 건입니다. 투찰 전 반드시 공고문 원문을 확인하세요.
      </p>
    </>
  );
}

function AptRow({ bid: b }: { bid: AptBid }) {
  const router = useRouter();
  return (
    <li className="min-w-0">
      <Link
        href={aptBidHref(b.no)}
        className="group grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-mint hover:shadow-card sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
      >
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
              <p className="text-xs text-ink-500">{b.prior.via === "수의계약" ? "직전 수의계약" : "직전 낙찰"}</p>
              <p className="text-lg font-bold tabular-nums">{won(b.prior.amount)}</p>
            </div>
          ) : COMPARABLE.has(b.category) ? (
            <p className="text-sm text-ink-300">직전 계약 자료 없음</p>
          ) : <span />}
          <p className="text-xs text-ink-300">마감 {shortDate(b.closeAt)}</p>
          {COMPARABLE.has(b.category) && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/premium?apt=${encodeURIComponent(b.no)}#apt-price`); }}
              className="btn-mint btn-sm mt-2 shrink-0"
            >
              입찰가격 예측
            </button>
          )}
        </div>
      </Link>
    </li>
  );
}
