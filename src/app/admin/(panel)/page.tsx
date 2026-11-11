import Link from "next/link";
import { Kpi, PageHead, Status } from "@/components/AdminUI";
import { daysLeft } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { dateTime, won } from "@/lib/format";
import { planName } from "@/lib/plans";
import { getBids, getSettings, getSyncInfo, listClients, listInquiries, listReports } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import { runDailyNow, runSync } from "../actions";

export const metadata = { title: "대시보드" };

export default async function Dashboard() {
  const bids = await getBids();
  const clients = await listClients();
  const active = clients.filter((c) => c.status !== "일시중지");
  const inquiries = await listInquiries();
  const sync = getSyncInfo();
  const settings = await getSettings();
  const open = bids.filter((b) => daysLeft(b.closeAt) > 0);
  const today = bids.filter((b) => Date.now() - new Date(b.postedAt).getTime() < 24 * 3600 * 1000);
  const digests = active.map((c) => buildDigest(c, bids));
  const totalRecs = digests.reduce((s, d) => s + d.recommended.length, 0);
  const draftReports = (await listReports()).filter((r) => r.status === "초안").length;
  const maxCat = Math.max(1, ...CATEGORIES.map((c) => open.filter((b) => b.category === c).length));

  return (
    <>
      <PageHead title="대시보드" desc={`공고 갱신 ${dateTime(sync.syncedAt)} · ${sync.source === "g2b" ? "나라장터 API" : "목업 데이터"}`}>
        <form action={runSync}><button className="btn-ghost btn-sm">공고 다시 수집</button></form>
        <form action={runDailyNow}><button className="btn-primary btn-sm">오늘 메일 지금 발송</button></form>
      </PageHead>

      {sync.error && <p className="mb-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">API 수집 실패로 목업 데이터를 사용 중입니다: {sync.error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="오늘 신규 공고" value={today.length} sub={`진행 중 ${open.length}건`} />
        <Kpi label="서비스 고객사" value={active.length} sub={`체험 ${clients.filter((c) => c.status === "체험").length}곳 포함`} tone="mint" />
        <Kpi label="오늘 발송 예정 추천" value={totalRecs} sub={`${active.length}통 · ${String(settings.sendHour).padStart(2, "0")}:00 발송`} tone="amber" />
        <Kpi label="미처리 상담" value={inquiries.filter((q) => q.status === "신규").length} sub={`보고서 초안 ${draftReports}건`} tone="coral" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <h2 className="font-bold">오늘의 맞춤 메일 발송 대기열</h2>
            <span className="chip">영업일 {String(settings.sendHour).padStart(2, "0")}:00</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-x min-w-[560px]">
              <thead><tr><th>고객사</th><th>요금제</th><th>추천</th><th>3일 내 마감</th><th>제외</th><th></th></tr></thead>
              <tbody>
                {digests.map((d) => (
                  <tr key={d.client.id}>
                    <td><p className="font-semibold">{d.client.company}</p><p className="text-xs text-ink-300">{d.client.email}</p></td>
                    <td><span className="chip">{planName(d.client.plan)}</span></td>
                    <td className="font-bold tabular-nums">{d.recommended.length}건</td>
                    <td className="tabular-nums text-coral">{d.closingSoon.length}건</td>
                    <td className="tabular-nums text-ink-300">{d.excluded}건</td>
                    <td className="text-right"><Link href={`/admin/clients/${d.client.id}`} className="text-sm font-semibold text-mint-600">미리보기</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-bold">업종별 진행 중 공고</h2>
          <ul className="mt-4 space-y-3">
            {CATEGORIES.map((c) => {
              const n = open.filter((b) => b.category === c).length;
              return (
                <li key={c} className="grid grid-cols-[72px_1fr_28px] items-center gap-3 text-sm">
                  <span>{c}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-mint" style={{ width: `${(n / maxCat) * 100}%` }} /></span>
                  <span className="text-right font-semibold tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between p-5"><h2 className="font-bold">마감 임박 공고</h2><Link href="/admin/bids" className="text-sm font-semibold text-mint-600">전체</Link></div>
          <ul className="divide-y divide-ink-100">
            {open.sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt)).slice(0, 6).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{b.title}</p><p className="text-xs text-ink-300">{b.demandAgency} · {won(b.baseAmount)}</p></div>
                <span className="shrink-0 rounded-md bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral">D-{daysLeft(b.closeAt)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between p-5"><h2 className="font-bold">최근 상담 신청</h2><Link href="/admin/inquiries" className="text-sm font-semibold text-mint-600">전체</Link></div>
          <ul className="divide-y divide-ink-100">
            {inquiries.slice(0, 6).map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{q.company}</p><p className="text-xs text-ink-300">{q.licenses.join(", ") || "면허 미입력"} · {q.regions.join(", ") || "지역 미입력"}</p></div>
                <Status value={q.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
