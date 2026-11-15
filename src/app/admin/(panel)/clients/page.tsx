import Link from "next/link";
import { PageHead, Status } from "@/components/AdminUI";
import { rank } from "@/lib/analysis";
import { shortDate, won } from "@/lib/format";
import { planName } from "@/lib/plans";
import { getBids, listClients } from "@/lib/store";

export const metadata = { title: "고객사" };

export default async function Clients() {
  const bids = await getBids();
  const clients = await listClients();
  return (
    <>
      <PageHead title="고객사" desc="면허·지역·규모 조건으로 매일 공고를 선별합니다.">
        <Link href="/admin/clients/new" className="btn-primary btn-sm">고객사 등록</Link>
      </PageHead>
      <div className="card overflow-x-auto">
        <table className="table-x md:min-w-[860px]">
          <thead><tr><th>고객사</th><th className="hidden md:table-cell">면허</th><th className="hidden md:table-cell">지역</th><th className="hidden md:table-cell">규모</th><th className="hidden md:table-cell">요금제</th><th>상태</th><th className="whitespace-nowrap">참가 가능</th><th className="hidden md:table-cell">가입</th></tr></thead>
          <tbody>
            {clients.map((c) => {
              const ok = rank(bids, c).filter((r) => r.eligible).length;
              return (
                <tr key={c.id} className="hover:bg-paper/60">
                  <td><Link href={`/admin/clients/${c.id}`} className="font-semibold hover:text-mint-600">{c.company}</Link><p className="text-xs text-ink-300">{c.contactName}</p><p className="mt-1 text-xs leading-relaxed text-ink-500 md:hidden">{planName(c.plan)} · {won(c.minAmount)} ~ {won(c.maxAmount)}<br />{c.regions.join(", ")}</p></td>
                  <td className="hidden max-w-[200px] text-xs text-ink-500 md:table-cell">{c.licenses.join(", ")}</td>
                  <td className="hidden text-xs text-ink-500 md:table-cell">{c.regions.join(", ")}</td>
                  <td className="hidden whitespace-nowrap text-xs md:table-cell">{won(c.minAmount)} ~ {won(c.maxAmount)}</td>
                  <td className="hidden md:table-cell"><span className="chip">{planName(c.plan)}</span></td>
                  <td><Status value={c.status} /></td>
                  <td className="font-bold tabular-nums text-mint-600">{ok}건</td>
                  <td className="hidden text-xs text-ink-300 md:table-cell">{shortDate(c.joinedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
