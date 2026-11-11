import type { Metadata } from "next";
import Link from "next/link";
import { BidRow } from "@/components/BidRow";
import { daysLeft, rank } from "@/lib/analysis";
import { getBids, getSyncInfo } from "@/lib/store";
import { CATEGORIES, LICENSES, REGIONS, type License, type Region } from "@/lib/types";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "공고 검색" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function BidsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const cat = sp.cat ?? "";
  const region = sp.region ?? "";
  const urgent = sp.urgent === "1";
  const onlyOk = sp.ok === "1";
  const lic = (sp.lic ?? "").split(",").filter(Boolean) as License[];
  const rg = (sp.rg ?? "").split(",").filter(Boolean) as Region[];
  const min = Number(sp.min ?? 0);
  const max = Number(sp.max ?? 10_000_000_000);
  const hasProfile = lic.length > 0;

  const all = await getBids();
  const sync = getSyncInfo();
  let list = all.filter((b) => daysLeft(b.closeAt) > 0);
  if (q) list = list.filter((b) => `${b.title} ${b.demandAgency} ${b.agency}`.includes(q));
  if (cat) list = list.filter((b) => b.category === cat);
  if (region) list = list.filter((b) => b.region === region || b.region === "전국");
  if (urgent) list = list.filter((b) => daysLeft(b.closeAt) <= 3);

  const matches = hasProfile ? rank(list, { licenses: lic, regions: rg, minAmount: min, maxAmount: max, pastPerformance: max }) : null;
  const shown = matches ? (onlyOk ? matches.filter((m) => m.eligible) : matches) : null;

  return (
    <div className="container-x py-10 sm:py-14">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">청소·시설관리 용역 공고</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">공고 검색</h1>
        </div>
        <p className="text-xs text-ink-300">
          {sync.source === "g2b" ? "나라장터 실시간 연동" : "데모 데이터"} · 갱신 {dateTime(sync.syncedAt)}
        </p>
      </div>

      <form className="card mt-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto_auto]">
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
        {hasProfile && (
          <>
            <input type="hidden" name="lic" value={lic.join(",")} />
            <input type="hidden" name="rg" value={rg.join(",")} />
            <input type="hidden" name="min" value={min} />
            <input type="hidden" name="max" value={max} />
          </>
        )}
        <button className="btn-primary">검색</button>
      </form>

      {hasProfile ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mint-100 bg-mint-50 p-4 text-sm">
          <p>
            <b>내 조건 적용 중</b> · 면허 {lic.join(", ")} · 지역 {rg.join(", ") || "미지정"}
          </p>
          <div className="flex gap-2">
            <Link
              href={`/bids?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), ok: onlyOk ? "" : "1" })}`}
              className="btn-ghost btn-sm"
            >
              {onlyOk ? "전체 보기" : "참가 가능만 보기"}
            </Link>
            <Link href="/bids" className="btn-ghost btn-sm">조건 해제</Link>
          </div>
        </div>
      ) : (
        <ProfileForm />
      )}

      <p className="mt-6 text-sm text-ink-500">
        {(shown ?? list).length}건
        {matches && ` · 참가 가능 ${matches.filter((m) => m.eligible).length}건`}
      </p>
      <div className="mt-3 space-y-3">
        {shown
          ? shown.map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={`/bids/${m.bid.id}?${new URLSearchParams({ lic: lic.join(","), rg: rg.join(","), min: String(min), max: String(max) })}`} />)
          : list.map((b) => <BidRow key={b.id} bid={b} />)}
        {(shown ?? list).length === 0 && (
          <div className="card p-10 text-center text-ink-500">검색 조건에 맞는 공고가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function ProfileForm() {
  return (
    <details className="card mt-4 p-4">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        <span className="text-mint-600">＋ 내 면허·지역·규모 입력하고 입찰 가능성 점수 보기</span>
      </summary>
      <form className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label">보유 면허 (복수 선택)</p>
          <select name="lic" multiple className="input h-36">
            {LICENSES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <p className="label">영업 지역 (복수 선택)</p>
          <select name="rg" multiple className="input h-36">
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <p className="label">최소 규모(원)</p>
          <input name="min" type="number" defaultValue={0} className="input" />
        </div>
        <div>
          <p className="label">최대 규모(원)</p>
          <input name="max" type="number" defaultValue={500000000} className="input" />
        </div>
        <p className="text-xs text-ink-300 sm:col-span-2">Ctrl(⌘) 키를 누른 채 여러 개를 선택할 수 있습니다.</p>
        <button className="btn-mint sm:col-span-2" formAction="/bids/profile">조건 적용</button>
      </form>
    </details>
  );
}
