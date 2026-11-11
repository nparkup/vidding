import Link from "next/link";
import { PageHead } from "@/components/AdminUI";
import { DdayBadge } from "@/components/Badges";
import { daysLeft, evaluate } from "@/lib/analysis";
import { dateTime, won } from "@/lib/format";
import { getBids, getSyncInfo, listClients } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import { runSync } from "../../actions";

export const metadata = { title: "공고 수집·선별" };

export default async function AdminBids({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const bids = (await getBids()).filter((b) => !cat || b.category === cat);
  const clients = listClients().filter((c) => c.status !== "일시중지");
  const sync = getSyncInfo();

  return (
    <>
      <PageHead title="공고 수집·선별" desc={`${sync.source === "g2b" ? "나라장터 입찰공고정보서비스" : "목업 데이터"} · 마지막 수집 ${dateTime(sync.syncedAt)} · ${sync.count}건`}>
        <form action={runSync}><button className="btn-primary btn-sm">지금 수집</button></form>
      </PageHead>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/admin/bids" className={`chip ${!cat ? "border-ink bg-ink text-white" : ""}`}>전체</Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={`/admin/bids?cat=${encodeURIComponent(c)}`} className={`chip ${cat === c ? "border-ink bg-ink text-white" : ""}`}>{c}</Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-x min-w-[960px]">
          <thead><tr><th>마감</th><th>공고</th><th>업종</th><th>지역</th><th>면허</th><th>기초금액</th><th>계약방법</th><th>매칭 고객사</th></tr></thead>
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
                  <td className="text-xs">{b.category}</td>
                  <td className="text-xs">{b.region}</td>
                  <td className="max-w-[160px] text-xs text-ink-500">{b.licenses.join(", ") || "-"}</td>
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
    </>
  );
}
