import { notFound } from "next/navigation";
import { PageHead, Status } from "@/components/AdminUI";
import { WeeklyReportView } from "@/components/WeeklyReportView";
import { getBids, getClient, getReport } from "@/lib/store";
import { sendReport } from "../../../actions";

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getReport(id);
  const client = r ? getClient(r.clientId) : undefined;
  if (!r || !client) notFound();
  return (
    <>
      <PageHead title={`${client.company} · ${r.weekLabel}`} desc={`수신: ${client.email}`}>
        <Status value={r.status} />
        {r.status === "초안" && <form action={sendReport.bind(null, r.id)}><button className="btn-mint btn-sm">고객사에 발송</button></form>}
      </PageHead>
      <WeeklyReportView client={client} bids={await getBids()} weekLabel={r.weekLabel} note={r.note} />
    </>
  );
}
