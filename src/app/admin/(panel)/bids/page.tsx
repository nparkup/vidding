import Link from "next/link";
import { PageHead } from "@/components/AdminUI";
import { DdayBadge } from "@/components/Badges";
import { daysLeft, evaluate } from "@/lib/analysis";
import { dateTime, won } from "@/lib/format";
import { getBids, getSyncInfo, listClients } from "@/lib/store";
import { BIZ_TYPES, CATEGORY_GROUPS } from "@/lib/types";
import { runSync } from "../../actions";

export const metadata = { title: "공고 수집·선별" };

const PER_PAGE = 100;

export default async function AdminBids({ searchParams }: { searchParams: Promise<{ cat?: string; biz?: string; q?: string; page?: string }> }) {
  const { cat = "", biz = "", q = "", page } = await searchParams;
  const all = (await getBids())
    .filter((b) => !cat || b.category === cat)
    .filter((b) => !biz || (b.bizType ?? "용역") === biz)
    .filter((b) => !q || `${b.title} ${b.demandAgency} ${b.agency} ${b.bidNtceNo}`.includes(q));
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const cur = Math.min(pages, Math.max(1, Number(page) || 1));
  const bids = all.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const qs = (p: number) => `/admin/bids?${new URLSearchParams({ ...(cat && { cat }), ...(biz && { biz }), ...(q && { q }), page: String(p) })}`;
  const clients = (await listClients()).filter((c) => c.status !== "일시중지");
  const sync = getSyncInfo();

  return (
    <>
      <PageHead title="공고 수집·선별" desc={`${sync.source === "g2b" ? "나라장터 입찰공고정보서비스" : "목업 데이터"} · 마지막 수집 ${dateTime(sync.syncedAt)} · ${sync.count}건`}>
        <form action={runSync}><button className="btn-primary btn-sm">지금 수집</button></form>
      </PageHead>

      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="q" defaultValue={q} placeholder="공고명·기관·공고번호" className="input" />
        <select name="biz" defaultValue={biz} className="input sm:w-32">
          <option value="">전체 구분</option>
          {BIZ_TYPES.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select name="cat" defaultValue={cat} className="input sm:w-44">
          <option value="">전체 업종</option>
          {Object.entries(CATEGORY_GROUPS).map(([g, cs]) => (
            <optgroup key={g} label={g}>{cs.map((c) => <option key={c}>{c}</option>)}</optgroup>
          ))}
        </select>
        <button className="btn-primary btn-sm">검색</button>
      </form>
      <p className="mb-2 text-sm text-ink-500">{all.length.toLocaleString()}건 · {cur}/{pages} 페이지</p>

      <div className="card overflow-x-auto">
        <table className="table-x min-w-[960px]">
          <thead><tr><th>마감</th><th>공고</th><th>구분·업종</th><th>지역</th><th>면허</th><th>기초금액</th><th>계약방법</th><th>매칭 고객사</th></tr></thead>
          <tbody>
            {bids.map((b) => {
              const matched = clients.filter((c) => evaluate(b, c).eligible);
              return (
                <tr key={b.id} className={daysLeft(b.closeAt) <= 0 ? "opacity-40" : ""}>
                  <td><DdayBadge days={daysLeft(b.closeAt)} /></td>
                  <td className="max-w-[280px]">
                    <Link href={`/bids/${b.id}`} target="_blank" className="block truncate font-semibold hover:text-mint-600">{b.title}</Link>
                    <p className="truncate text-xs text-ink-300">{b.bidNtceNo} · {b.demandAgency}</p>
                  </td>
                  <td className="text-xs"><span className="text-ink-300">{b.bizType ?? "용역"}</span><br />{b.category}</td>
                  <td className="text-xs">{b.region}</td>
                  <td className="max-w-[160px] text-xs text-ink-500"><span className="line-clamp-2">{b.licenseRaw || b.licenses.join(", ") || "-"}</span></td>
                  <td className="whitespace-nowrap tabular-nums">{won(b.baseAmount)}</td>
                  <td className="text-xs">{b.contractMethod}</td>
                  <td>
                    {matched.length ? (
                      <div className="flex flex-wrap gap-1">
                        {matched.map((c) => <Link key={c.id} href={`/admin/clients/${c.id}`} className="chip border-mint-100 bg-mint-50 text-mint-600">{c.company}</Link>)}
                      </div>
                    ) : <span className="text-xs text-ink-300">없음</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {cur > 1 && <Link href={qs(cur - 1)} className="btn-ghost btn-sm">이전</Link>}
          <span className="tabular-nums text-ink-500">{cur} / {pages}</span>
          {cur < pages && <Link href={qs(cur + 1)} className="btn-ghost btn-sm">다음</Link>}
        </div>
      )}
    </>
  );
}
