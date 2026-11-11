import Link from "next/link";
import { PageHead, Status } from "@/components/AdminUI";
import { rank } from "@/lib/analysis";
import { dateTime, won } from "@/lib/format";
import { getBids, listInquiries } from "@/lib/store";
import type { Inquiry } from "@/lib/types";
import { setInquiryStatusAction } from "../../actions";

export const metadata = { title: "상담 신청" };
const STATUSES: Inquiry["status"][] = ["신규", "연락완료", "체험전환", "보류"];

export default async function Inquiries() {
  const bids = await getBids();
  const list = await listInquiries();
  return (
    <>
      <PageHead title="상담 신청" desc="사이트 무료 진단 신청 내역입니다. 고객사로 전환하면 조건이 그대로 등록됩니다." />
      <div className="space-y-3">
        {list.map((q) => {
          const ok = rank(bids, q).filter((r) => r.eligible).length;
          return (
            <div key={q.id} className="card grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><p className="font-bold">{q.company}</p><Status value={q.status} /></div>
                <p className="mt-0.5 text-sm text-ink-500">{q.contactName} · {q.phone} · {q.email}</p>
                {q.message && <p className="mt-2 rounded-lg bg-paper p-2.5 text-sm">{q.message}</p>}
                <p className="mt-2 text-xs text-ink-300">{dateTime(q.createdAt)}</p>
              </div>
              <div className="text-sm">
                <p><span className="text-ink-300">면허</span> {q.licenses.join(", ") || "-"}</p>
                <p><span className="text-ink-300">지역</span> {q.regions.join(", ") || "-"}</p>
                <p><span className="text-ink-300">규모</span> {won(q.minAmount)} ~ {won(q.maxAmount)}</p>
                <p className="mt-1 font-semibold text-mint-600">현재 참가 가능 {ok}건</p>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:w-48 lg:flex-col">
                <div className="flex flex-wrap gap-1">
                  {STATUSES.filter((s) => s !== q.status).map((s) => (
                    <form key={s} action={setInquiryStatusAction.bind(null, q.id, s)}><button className="chip hover:border-ink-300">{s}</button></form>
                  ))}
                </div>
                <Link href={`/admin/clients/new?from=${q.id}`} className="btn-primary btn-sm">고객사로 전환</Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
