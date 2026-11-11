"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BidRow } from "./BidRow";
import { daysLeft, rank } from "@/lib/analysis";
import { CATEGORIES, LICENSES, REGIONS, type Bid, type License, type Region } from "@/lib/types";

/** 공고 검색 (필터·내 조건 점수 계산은 모두 브라우저에서 처리: 서버/정적 배포 공용) */
export function BidsExplorer({ bids }: { bids: Bid[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp.get(k) ?? "";

  const q = get("q").trim();
  const cat = get("cat");
  const region = get("region");
  const urgent = get("urgent") === "1";
  const onlyOk = get("ok") === "1";
  const lic = get("lic").split(",").filter(Boolean) as License[];
  const rg = get("rg").split(",").filter(Boolean) as Region[];
  const min = Number(get("min") || 0);
  const max = Number(get("max") || 10_000_000_000);
  const hasProfile = lic.length > 0;

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    router.push(`${pathname}?${next}`);
  };

  const { list, matches } = useMemo(() => {
    let l = bids.filter((b) => daysLeft(b.closeAt) > 0);
    if (q) l = l.filter((b) => `${b.title} ${b.demandAgency} ${b.agency}`.includes(q));
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
        className="card mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          go({ q: String(f.get("q") ?? ""), cat: String(f.get("cat") ?? ""), region: String(f.get("region") ?? ""), urgent: f.get("urgent") ? "1" : "" });
        }}
      >
        <input name="q" defaultValue={q} placeholder="공고명, 발주기관 검색 (예: 청사, 체육센터)" className="input" />
        <select name="cat" defaultValue={cat} className="input sm:w-36">
          <option value="">전체 업종</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select name="region" defaultValue={region} className="input sm:w-32">
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
          <p><b>내 조건 적용 중</b> · 면허 {lic.join(", ")} · 지역 {rg.join(", ") || "미지정"}</p>
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
          ? shown.map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={`/bids/${m.bid.id}?${profileQs}`} />)
          : list.map((b) => <BidRow key={b.id} bid={b} />)}
        {(shown ?? list).length === 0 && <div className="card p-10 text-center text-ink-500">검색 조건에 맞는 공고가 없습니다.</div>}
      </div>
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
        <span className="text-mint-600">＋ 내 면허·지역·규모 입력하고 입찰 가능성 점수 보기</span>
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
          <p className="label">보유 면허</p>
          <div className="flex flex-wrap gap-1.5">
            {LICENSES.map((l) => (
              <button key={l} type="button" onClick={() => setLic(toggle(lic, l))} className={`rounded-full border px-3 py-1.5 text-sm ${lic.includes(l) ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500"}`}>{l}</button>
            ))}
          </div>
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

