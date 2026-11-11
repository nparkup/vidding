import { PageHead } from "@/components/AdminUI";
import { NARA_APIS } from "@/lib/nara/endpoints";
import { usingDevPassword } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { getSettings, getSyncInfo } from "@/lib/store";
import { saveSettings } from "../../actions";

export const metadata = { title: "설정·API" };

export default function Settings() {
  const sync = getSyncInfo();
  const s = getSettings();
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
                  <span className={`chip ${a.required ? "border-ink bg-ink text-white" : ""}`}>{a.required ? "필수" : "권장"}</span>
                </div>
                <p className="mt-1 text-sm text-ink-500">{a.usage}</p>
                <p className="mt-2 break-all font-mono text-xs text-ink-300">{a.path} · {Object.values(a.operations).join(", ")}</p>
                <a href={`https://www.data.go.kr/data/${a.datasetId}/openapi.do`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-mint-600">공공데이터포털에서 활용신청 →</a>
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
            <p className="text-xs text-ink-300">실제 발송은 메일 서비스(SES, SendGrid 등) 연동 후 동작합니다.</p>
            <button className="btn-primary btn-sm">저장</button>
          </form>
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
