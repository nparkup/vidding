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
        <table className="table-x min-w-[860px]">
          <thead><tr><th>고객사</th><th>면허</th><th>지역</th><th>규모</th><th>요금제</th><th>상태</th><th>참가 가능</th><th>가입</th></tr></thead>
          <tbody>
            {clients.map((c) => {
              const ok = rank(bids, c).filter((r) => r.eligible).length;
              return (
                <tr key={c.id} className="hover:bg-paper/60">
                  <td><Link href={`/admin/clients/${c.id}`} className="font-semibold hover:text-mint-600">{c.company}</Link><p className="text-xs text-ink-300">{c.contactName}</p></td>
                  <td className="max-w-[200px] text-xs text-ink-500">{c.licenses.join(", ")}</td>
                  <td className="text-xs text-ink-500">{c.regions.join(", ")}</td>
                  <td className="whitespace-nowrap text-xs">{won(c.minAmount)} ~ {won(c.maxAmount)}</td>
                  <td><span className="chip">{planName(c.plan)}</span></td>
                  <td><Status value={c.status} /></td>
                  <td className="font-bold tabular-nums text-mint-600">{ok}건</td>
                  <td className="text-xs text-ink-300">{shortDate(c.joinedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
