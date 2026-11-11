import Link from "next/link";
import { PageHead, Status } from "@/components/AdminUI";
import { shortDate } from "@/lib/format";
import { getClient, listClients, listReports } from "@/lib/store";
import { createReport } from "../../actions";

export const metadata = { title: "주간 보고서" };

function weekLabel(d = new Date()) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}월 ${Math.ceil(k.getUTCDate() / 7)}주차`;
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const clients = listClients().filter((c) => c.plan !== "basic");
  const reports = listReports();
  return (
    <>
      <PageHead title="주간 보고서" desc="프로·파트너 고객사에 매주 월요일 발송합니다. 자동 초안에 매니저 코멘트를 더해 발송하세요." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <form action={createReport} className="card space-y-4 p-5">
          <h2 className="font-bold">새 보고서 초안 만들기</h2>
          <div><label className="label">고객사</label>
            <select name="clientId" defaultValue={sp.client} className="input">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </div>
          <div><label className="label">주차</label><input name="weekLabel" defaultValue={weekLabel()} className="input" /></div>
          <div><label className="label">매니저 코멘트</label><textarea name="note" rows={4} className="input" placeholder="이번 주 집중할 공고와 이유, 준비 팁 등" /></div>
          <button className="btn-primary w-full">초안 생성</button>
        </form>
        <section className="card overflow-x-auto">
          <table className="table-x min-w-[480px]">
            <thead><tr><th>고객사</th><th>주차</th><th>작성일</th><th>상태</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/reports/${r.id}`} className="font-semibold hover:text-mint-600">{getClient(r.clientId)?.company ?? r.clientId}</Link></td>
                  <td>{r.weekLabel}</td>
                  <td className="text-xs text-ink-300">{shortDate(r.createdAt)}</td>
                  <td><Status value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
