"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BidRow } from "./BidRow";
import { LicensePicker } from "./LicensePicker";
import { daysLeft, rank } from "@/lib/analysis";
import { BIZ_TYPES, CATEGORY_GROUPS, REGIONS, type Bid, type License, type Region } from "@/lib/types";
import { useBids } from "@/lib/useBids";
import { bidHref } from "@/lib/links";

const PAGE = 50;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * 검색어 매칭: 띄어쓰기로 나눈 단어가 모두 들어 있으면 일치 (순서·띄어쓰기 무관).
 * 공고명·발주기관·수요기관·공고번호(R26BK01234567, 차수 포함 R26BK01234567-000)를 함께 본다.
 */
export function matchesQuery(q: string): (b: Bid) => boolean {
  const words = q.split(/\s+/).map(norm).filter(Boolean);
  return (b) => {
    const hay = norm(`${b.title} ${b.demandAgency} ${b.agency} ${b.bidNtceNo ?? ""} ${b.id}`);
    return words.every((w) => hay.includes(w));
  };
}

/** 공고 검색 (필터·내 조건 점수 계산은 모두 브라우저에서 처리: 서버/정적 배포 공용) */
export function BidsExplorer() {
  const { bids, error } = useBids();
  if (error) return <div className="card mt-6 p-10 text-center text-ink-500">공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>;
  if (!bids) return <BidsExplorerFallback />;
  return <Explorer bids={bids} />;
}

function Explorer({ bids }: { bids: Bid[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k) ?? "";

  const q = get("q").trim();
  const biz = get("biz");
  const cat = get("cat");
  const region = get("region");
  const urgent = get("urgent") === "1";
  const onlyOk = get("ok") === "1";
  const lic = get("lic").split(",").filter(Boolean) as License[];
  const rg = get("rg").split(",").filter(Boolean) as Region[];
  const min = Number(get("min") || 0);
  const max = Number(get("max") || 10_000_000_000);
  const hasProfile = lic.length > 0;

  const [limit, setLimit] = useState(PAGE);
  const go = (patch: Record<string, string>) => {
    setLimit(PAGE);
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.push(`${pathname}?${next}`);
  };

  const { list, matches } = useMemo(() => {
    let l = bids.filter((b) => daysLeft(b.closeAt) > 0);
    if (q) l = l.filter(matchesQuery(q));
    if (biz) l = l.filter((b) => (b.bizType ?? "용역") === biz);
    if (cat) l = l.filter((b) => b.category === cat);
    if (region) l = l.filter((b) => b.region === "전국" || (b.regions ?? [b.region]).includes(region as Region));
    if (urgent) l = l.filter((b) => daysLeft(b.closeAt) <= 3);
    const m = hasProfile ? rank(l, { licenses: lic, regions: rg, minAmount: min, maxAmount: max, pastPerformance: max }) : null;
    return { list: l, matches: m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bids, sp]);

  const shown = matches ? (onlyOk ? matches.filter((m) => m.eligible) : matches) : null;
  const profileQs = new URLSearchParams({ lic: lic.join(","), rg: rg.join(","), min: String(min), max: String(max) }).toString();

  return (
    <>
      <form
        key={sp.toString()}
        className="card mt-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          go({ q: String(f.get("q") ?? ""), biz: String(f.get("biz") ?? ""), cat: String(f.get("cat") ?? ""), region: String(f.get("region") ?? ""), urgent: f.get("urgent") ? "1" : "" });
        }}
      >
        <input name="q" defaultValue={q} placeholder="공고명, 발주기관, 공고번호 검색 (예: 청사 유지보수, R26BK01234567)" className="input sm:col-span-2 lg:col-span-1" />
        <select name="biz" defaultValue={biz} className="input lg:w-28" aria-label="업무 구분">
          <option value="">용역·공사·물품</option>
          {BIZ_TYPES.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select name="cat" defaultValue={cat} className="input lg:w-44" aria-label="업종">
          <option value="">전체 업종</option>
          {Object.entries(CATEGORY_GROUPS).map(([g, cs]) => (
            <optgroup key={g} label={g}>
              {cs.map((c) => <option key={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
        <select name="region" defaultValue={region} className="input lg:w-32" aria-label="지역">
          <option value="">전체 지역</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm">
          <input type="checkbox" name="urgent" value="1" defaultChecked={urgent} className="h-4 w-4 accent-[#0FA37F]" /> 3일 내 마감
        </label>
        <button className="btn-primary">검색</button>
      </form>

      {hasProfile ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mint-100 bg-mint-50 p-4 text-sm">
          <p className="min-w-0"><b>내 조건 적용 중</b> · 면허 {lic.length > 4 ? `${lic.slice(0, 4).join(", ")} 외 ${lic.length - 4}개` : lic.join(", ")} · 지역 {rg.join(", ") || "미지정"}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => go({ ok: onlyOk ? "" : "1" })} className="btn-ghost btn-sm">{onlyOk ? "전체 보기" : "참가 가능만 보기"}</button>
            <button type="button" onClick={() => go({ lic: "", rg: "", min: "", max: "", ok: "" })} className="btn-ghost btn-sm">조건 해제</button>
          </div>
        </div>
      ) : (
        <ProfileForm onApply={(p) => go(p)} />
      )}

      <p className="mt-6 text-sm text-ink-500">
        {(shown ?? list).length}건{matches && ` · 참가 가능 ${matches.filter((m) => m.eligible).length}건`}
      </p>
      <div className="mt-3 space-y-3">
        {shown
          ? shown.slice(0, limit).map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={bidHref(m.bid.id, profileQs)} />)
          : list.slice(0, limit).map((b) => <BidRow key={b.id} bid={b} />)}
        {(shown ?? list).length === 0 && <div className="card p-10 text-center text-ink-500">검색 조건에 맞는 공고가 없습니다.</div>}
      </div>
      {(shown ?? list).length > limit && (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="btn-ghost mt-4 w-full">
          더 보기 ({limit.toLocaleString()} / {(shown ?? list).length.toLocaleString()}건)
        </button>
      )}
    </>
  );
}

function ProfileForm({ onApply }: { onApply: (p: Record<string, string>) => void }) {
  const [lic, setLic] = useState<string[]>([]);
  const [rg, setRg] = useState<string[]>([]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <details className="card mt-4 p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        <span className="inline-flex items-center gap-1.5 text-mint-600"><Plus className="h-4 w-4" />내 면허·지역·규모 입력하고 입찰 가능성 점수 보기</span>
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onApply({ lic: lic.join(","), rg: rg.join(","), min: String(Number(f.get("min") || 0) * 10000), max: String(Number(f.get("max") || 50000) * 10000) });
        }}
      >
        <div>
          <p className="label">보유 면허 (투찰가능업종)</p>
          <LicensePicker selected={lic} onChange={setLic} />
        </div>
        <div>
          <p className="label">영업 지역</p>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <button key={r} type="button" onClick={() => setRg(toggle(rg, r))} className={`rounded-full border px-3 py-1.5 text-sm ${rg.includes(r) ? "border-mint bg-mint text-white" : "border-ink-100 bg-white text-ink-500"}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="label">최소 규모 (만원)</p><input name="min" type="number" defaultValue={0} className="input" /></div>
          <div><p className="label">최대 규모 (만원)</p><input name="max" type="number" defaultValue={50000} className="input" /></div>
        </div>
        <button className="btn-mint w-full" disabled={lic.length === 0}>조건 적용</button>
      </form>
    </details>
  );
}

export function BidsExplorerFallback() {
  return <div className="card mt-6 p-10 text-center text-ink-500">공고를 불러오는 중…</div>;
}

