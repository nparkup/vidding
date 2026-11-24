"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Ellipsis, HardHat, LayoutGrid, Package, Wrench, type LucideIcon } from "lucide-react";
import { NURI_BIZ, type NuriBid, type NuriBidsFile } from "@/lib/nuri";
import { shortDate, won } from "@/lib/format";
import { nuriBidHref } from "@/lib/links";
import { loadSiteJson } from "@/lib/useSiteJson";
import { CloseDdayBadge } from "./Badges";
import { CloseDay } from "./CloseDay";
import { Tile } from "./CategoryTiles";

const BIZ_ICONS: Record<string, LucideIcon> = { 용역: Wrench, 공사: HardHat, 물품: Package, 기타: Ellipsis };
const PAGE = 50;
const KEY = "bidmate.nuribids.v1";
type Sort = "close" | "new" | "budget";
interface Saved { biz: string[]; region: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const hoursLeft = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3600e3;
/** 참가가능지역의 시·도 */
const sidoOf = (r: string) => r.split(/\s+/)[0];

/** 누리장터 민간 입찰공고 검색: 업무·지역·검색어로 거르고, 누르면 공고 상세(/nuri-bids/view)로 간다 */
export function NuriBidsExplorer() {
  const [data, setData] = useState<NuriBidsFile | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [biz, setBiz] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [sheetOnly, setSheetOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("close");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    loadSiteJson<NuriBidsFile>("nuri-bids-data.json").then(setData).catch(() => setError(true));
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      if (s) { setBiz(s.biz ?? []); setRegion(s.region ?? ""); }
    } catch { /* 저장값이 없으면 기본 조건 */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ biz, region } satisfies Saved)); } catch { /* 저장 못 해도 화면은 그대로 */ }
    setLimit(PAGE);
  }, [biz, region]);

  const live = useMemo(() => (data?.items ?? []).filter((b) => hoursLeft(b.closeAt) > 0), [data]);
  const regions = useMemo(() => [...new Set(live.flatMap((b) => b.regions.map(sidoOf)))].sort(), [live]);
  /** 지역을 고르면 그 지역 제한 공고와 지역 제한이 없는 공고를 함께 보여 준다 */
  const inRegion = (b: NuriBid) => !region || !b.regions.length || b.regions.some((r) => sidoOf(r) === region);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of live) if (inRegion(b)) m.set(b.biz, (m.get(b.biz) ?? 0) + 1);
    return m;
  }, [live, region]);

  const shown = useMemo(() => {
    const all = q.trim().split(/\s+/).filter(Boolean);
    const words = all.filter((w) => !w.startsWith("-")).map(norm);
    const not = all.filter((w) => w.startsWith("-") && w.length > 1).map((w) => norm(w.slice(1)));
    const xs = live.filter((b) => {
      if (urgent && hoursLeft(b.closeAt) > 72) return false;
      if (sheetOnly && !b.sheet) return false;
      if (biz.length && !biz.includes(b.biz)) return false;
      if (!inRegion(b)) return false;
      const hay = norm(`${b.title} ${b.agency} ${b.category} ${b.no} ${b.licenseGroups.flat().map((r) => r.name).join(" ")}`);
      return words.every((w) => hay.includes(w)) && !not.some((w) => hay.includes(w));
    });
    const by: Record<Sort, (a: NuriBid, b: NuriBid) => number> = {
      close: (a, b) => a.closeAt.localeCompare(b.closeAt),
      new: (a, b) => b.postedAt.localeCompare(a.postedAt) || a.closeAt.localeCompare(b.closeAt),
      budget: (a, b) => (b.refAmount ?? b.budget ?? -1) - (a.refAmount ?? a.budget ?? -1),
    };
    return xs.sort(by[sort]);
  }, [live, q, biz, region, urgent, sheetOnly, sort]);

  if (error) return <div className="card mt-6 p-10 text-center text-ink-500">민간 공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>;
  if (!data) return <div className="card mt-6 p-10 text-center text-ink-500">민간 공고를 불러오는 중…</div>;

  const toggle = (c: string) => setBiz(biz.includes(c) ? biz.filter((x) => x !== c) : [...biz, c]);
  return (
    <>
      <section className="card mt-6 p-4 sm:p-5" aria-label="업무 선택">
        <p className="text-sm font-bold">업무로 찾기 <span className="font-normal text-ink-400">여러 개 고를 수 있습니다</span></p>
        <div className="mt-3 grid grid-cols-5 gap-1.5 sm:max-w-xl sm:gap-2">
          <Tile icon={LayoutGrid} label="전체" title="전체 업무" count={[...counts.values()].reduce((a, b) => a + b, 0)} on={biz.length === 0} onClick={() => setBiz([])} />
          {NURI_BIZ.map((c) => <Tile key={c} icon={BIZ_ICONS[c]} label={c} count={counts.get(c) ?? 0} on={biz.includes(c)} onClick={() => toggle(c)} />)}
        </div>
      </section>

      <div className="card mt-3 grid min-w-0 grid-cols-[1fr_auto] items-center gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="공고명·기관명·면허 (예: 재건축, -채용)" className="input col-span-2 min-w-0 sm:col-span-1" aria-label="검색어" />
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="input sm:w-40" aria-label="지역">
          <option value="">전국</option>
          {regions.map((r) => <option key={r}>{r}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-[#0FA37F]" /> 3일 내 마감
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">
            <input type="checkbox" checked={sheetOnly} onChange={(e) => setSheetOnly(e.target.checked)} className="h-4 w-4 accent-[#0FA37F]" /> 배점표 있음
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{shown.length.toLocaleString()}건 · 지역을 고르면 지역 제한이 없는 공고도 함께 보입니다</p>
        <label className="flex items-center gap-2 text-sm text-ink-500">
          <span className="whitespace-nowrap">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="input h-9 w-auto py-0 pr-8 text-sm" aria-label="정렬 기준">
            <option value="close">마감 임박순</option>
            <option value="new">최신 공고순</option>
            <option value="budget">금액 높은순</option>
          </select>
        </label>
      </div>
      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((b) => <NuriRow key={b.no} bid={b} />)}
        {shown.length === 0 && <li className="card p-10 text-center text-ink-500">검색 조건에 맞는 공고가 없습니다.</li>}
      </ul>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="btn-ghost mt-4 w-full">
          더 보기 ({limit.toLocaleString()} / {shown.length.toLocaleString()}건)
        </button>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-300">
        누리장터는 나라장터 수요기관이 아닌 민간(기업·재건축조합·사회복지법인·종교단체 등)이 조달청 전자조달 시스템으로 입찰하는 곳입니다.
        누리장터 이용자 등록이 따로 필요할 수 있습니다.<br />투찰 전 반드시 공고문 원문을 확인하세요.
      </p>
    </>
  );
}

function NuriRow({ bid: b }: { bid: NuriBid }) {
  const amount = b.refAmount ?? b.budget;
  return (
    <li className="min-w-0">
      <Link
        href={nuriBidHref(b.no)}
        className="group grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-mint hover:shadow-card sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <CloseDdayBadge iso={b.closeAt} />
            <span className="chip">{b.biz}</span>
            {b.category && b.category !== b.biz && <span className="chip">{b.category}</span>}
            {b.award && <span className="chip">{b.award.replace("에의한낙찰자결정", "")}</span>}
            {b.regions.length > 0 && <span className="chip">{b.regions.map(sidoOf).filter((x, i, a) => a.indexOf(x) === i).join("·")} 제한</span>}
            {b.method === "직찰" && <span className="chip">직접 제출</span>}
            {b.sheet && <span className="chip border-mint/40 bg-mint-100 text-mint-600">배점표 있음</span>}
            {b.state !== "등록공고" && <span className="chip border-amber/40 bg-amber-100/60 text-ink">{b.state}</span>}
          </div>
          <p className="mt-2 text-[16px] font-semibold leading-snug group-hover:text-mint-600 [overflow-wrap:anywhere]">
            <CloseDay iso={b.closeAt} />
            {b.title}
          </p>
          <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{b.agency}{b.licenseGroups.length ? ` · ${b.licenseGroups.map((g) => g.map((r) => r.name).join("+")).join(" 또는 ")}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:block sm:text-right">
          {amount ? (
            <div>
              <p className="text-xs text-ink-500">{b.refAmount ? "기준금액" : "배정예산"}</p>
              <p className="text-lg font-bold tabular-nums">{won(amount)}</p>
            </div>
          ) : <p className="whitespace-nowrap text-sm text-ink-300">금액 비공개</p>}
          <p className="whitespace-nowrap text-xs text-ink-300">마감 {shortDate(b.closeAt)}</p>
        </div>
      </Link>
    </li>
  );
}
