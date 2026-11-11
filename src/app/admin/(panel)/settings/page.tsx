import { PageHead } from "@/components/AdminUI";
import { NARA_APIS } from "@/lib/nara/endpoints";
import { usingDevPassword } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { smtpConfigured } from "@/lib/mail/send";
import { getSettings, getSyncInfo, storageKind } from "@/lib/store";
import { saveSettings } from "../../actions";

export const metadata = { title: "설정·API" };

export default async function Settings() {
  const sync = getSyncInfo();
  const s = await getSettings();
  return (
    <>
      <PageHead title="설정·API" desc="공공데이터포털 연동 상태와 발송 설정을 관리합니다." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">공공데이터포털 나라장터 API</h2>
            <span className={`chip ${sync.hasKey ? "border-mint-100 bg-mint-50 text-mint-600" : "border-amber-100 bg-amber-100 text-[#9A6412]"}`}>
              {sync.hasKey ? "인증키 설정됨" : "인증키 없음 · 목업 모드"}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-500">
            서버 환경변수 <code className="rounded bg-paper px-1.5 py-0.5">DATA_GO_KR_SERVICE_KEY</code>에 일반 인증키(Decoding)를 넣으면 실제 공고로 전환됩니다.
            마지막 수집 {dateTime(sync.syncedAt)} · {sync.count}건
          </p>
          {sync.error && <p className="mt-2 rounded-lg bg-coral-100 p-2.5 text-sm text-coral">{sync.error}</p>}
          <ul className="mt-5 space-y-3">
            {NARA_APIS.map((a) => (
              <li key={a.key} className="rounded-xl border border-ink-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{a.name}</p>
                  <span className="flex gap-1">
                    <span className={`chip ${a.approved ? "border-mint-100 bg-mint-50 text-mint-600" : "border-coral-100 bg-coral-100 text-coral"}`}>{a.approved ? "승인됨" : "활용신청 필요"}</span>
                    <span className={`chip ${a.required ? "border-ink bg-ink text-white" : ""}`}>{a.required ? "필수" : "권장"}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-500">{a.usage}</p>
                <p className="mt-2 break-all font-mono text-xs text-ink-300">{a.path} · {Object.values(a.operations).join(", ")}</p>
                <a href={`https://www.data.go.kr/data/${a.datasetId}/openapi.do`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-mint-600">공공데이터포털에서 활용신청</a>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <form action={saveSettings} className="card space-y-4 p-5">
            <h2 className="font-bold">메일 발송</h2>
            <div><label className="label">일일 요약 발송 시각</label>
              <select name="sendHour" defaultValue={s.sendHour} className="input">
                {[6, 7, 8, 9].map((h) => <option key={h} value={h}>오전 {h}시</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weekdays" defaultChecked={s.sendOnWeekdaysOnly} className="h-4 w-4 accent-[#0FA37F]" /> 영업일(월~금, 공휴일 제외)만 발송</label>
            <p className="text-xs text-ink-300">휴일 목록은 src/lib/holidays.ts 에서 관리합니다.</p>
            <button className="btn-primary btn-sm">저장</button>
          </form>
          <section className="card space-y-2 p-5 text-sm">
            <h2 className="font-bold">연동 상태</h2>
            <p>데이터 저장: <b>{storageKind() === "postgres" ? "PostgreSQL (DATABASE_URL)" : "로컬 파일 (data/runtime-db.json)"}</b></p>
            <p>메일 발송: <b className={smtpConfigured() ? "text-mint-600" : "text-coral"}>{smtpConfigured() ? "SMTP 설정됨" : "SMTP 미설정 (기록만 남김)"}</b></p>
            <p>자동 발송: <b className={process.env.CRON_SECRET ? "text-mint-600" : "text-coral"}>{process.env.CRON_SECRET ? "CRON_SECRET 설정됨" : "CRON_SECRET 미설정"}</b></p>
            <p className="text-xs text-ink-300">스케줄러가 매시 /api/cron/daily, 매주 월요일 /api/cron/weekly 를 Authorization: Bearer CRON_SECRET 헤더로 호출합니다.</p>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">보안</h2>
            <p className={`mt-2 text-sm ${usingDevPassword() ? "text-coral" : "text-ink-500"}`}>
              {usingDevPassword() ? "ADMIN_PASSWORD 환경변수가 없어 개발용 기본 비밀번호를 사용 중입니다. 배포 전 반드시 설정하세요." : "관리자 비밀번호가 환경변수로 설정되어 있습니다."}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
