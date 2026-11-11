import Link from "next/link";
import { Kpi, PageHead } from "@/components/AdminUI";
import { dateTime } from "@/lib/format";
import { isBusinessDay, kstDay } from "@/lib/holidays";
import { smtpConfigured } from "@/lib/mail/send";
import { getSettings, listClients, listMailLog } from "@/lib/store";
import { runDailyNow } from "../../actions";

export const metadata = { title: "메일 발송" };

const KIND = { daily: "일일 요약", weekly: "주간 보고서", test: "수동 발송" } as const;
const TONE: Record<string, string> = { 발송: "bg-mint-100 text-mint-600", 실패: "bg-coral-100 text-coral", "미발송(SMTP 미설정)": "bg-amber-100 text-[#9A6412]" };

export default async function MailPage() {
  const [log, clients, settings] = await Promise.all([listMailLog(), listClients(), getSettings()]);
  const today = kstDay().ymd;
  const todays = log.filter((m) => kstDay(new Date(m.createdAt)).ymd === today);
  const name = (id: string) => clients.find((c) => c.id === id)?.company ?? id;
  return (
    <>
      <PageHead title="메일 발송" desc={`영업일 ${String(settings.sendHour).padStart(2, "0")}:00 자동 발송 · 오늘은 ${isBusinessDay() ? "영업일" : "휴일(자동 발송 없음)"}`}>
        <form action={runDailyNow}><button className="btn-primary btn-sm">오늘 메일 지금 발송</button></form>
      </PageHead>
      {!smtpConfigured() && (
        <p className="mb-4 rounded-xl bg-amber-100 p-3 text-sm text-[#9A6412]">
          SMTP가 설정되지 않아 실제 메일은 나가지 않고 기록만 남습니다. 환경변수 SMTP_HOST·SMTP_USER·SMTP_PASS·MAIL_FROM을 설정하세요.
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="오늘 발송" value={todays.filter((m) => m.status === "발송").length} tone="mint" />
        <Kpi label="오늘 실패" value={todays.filter((m) => m.status === "실패").length} tone="coral" />
        <Kpi label="오늘 미발송" value={todays.filter((m) => m.status === "미발송(SMTP 미설정)").length} tone="amber" />
        <Kpi label="전체 기록" value={log.length} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table-x min-w-[760px]">
          <thead><tr><th>시각</th><th>종류</th><th>고객사</th><th>제목</th><th>추천</th><th>상태</th></tr></thead>
          <tbody>
            {log.slice(0, 200).map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs text-ink-500">{dateTime(m.createdAt)}</td>
                <td className="text-xs">{KIND[m.kind]}</td>
                <td><Link href={`/admin/clients/${m.clientId}`} className="font-semibold hover:text-mint-600">{name(m.clientId)}</Link><p className="text-xs text-ink-300">{m.to}</p></td>
                <td className="max-w-[320px] truncate text-xs">{m.subject}</td>
                <td className="tabular-nums">{m.itemCount}</td>
                <td>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${TONE[m.status]}`}>{m.status}</span>
                  {m.error && <p className="mt-1 max-w-[200px] truncate text-xs text-coral" title={m.error}>{m.error}</p>}
                </td>
              </tr>
            ))}
            {log.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-ink-500">아직 발송 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
