import { Check } from "lucide-react";
import { Price, TrialN } from "@/components/Cfg";

/** 무료 체험에서 쓸 수 있는 분석 (요금제와 같은 기능, 공고 3건까지) */
const BENEFITS = [
  { t: "평가점수 예측", d: "공고의 평가 기준에 귀사 기업정보를 넣어 항목별 예상 점수와 통과 여부를 계산합니다." },
  { t: "배점표 판독", d: "첨부된 공고서·규격서를 모두 읽어 평가항목과 배점, 통과 점수를 찾아 정리합니다." },
  { t: "낙찰 결과로 본 예측", d: "전년도 낙찰 기업과 금액, 과거 낙찰률, 예상 최저 경쟁 투찰률, 참가 예상 기업을 보여 드립니다." },
  { t: "아파트 공고 예측", d: "같은 단지·같은 업종 직전 계약으로 아파트 관리 입찰의 예상 낙찰금액과 구간을 계산합니다." },
];

const STEPS: [React.ReactNode, string][] = [
  ["회원가입", "사업자등록번호와 연락처만 넣으면 1분이면 끝납니다."],
  [<>공고 <TrialN />건 분석</>, "나라장터·아파트 공고 중 관심 공고를 골라 분석합니다."],
  ["계속 이용", "마음에 드시면 요금제를 고르세요. 자동 결제는 없습니다."],
];

export function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-x grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
      <div className="min-w-0 space-y-6">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 p-7 text-white sm:p-9">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-mint/25 blur-[100px]" />
          <div className="relative">
            <p className="text-sm font-semibold text-mint-400">무료 체험</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-[1.2] tracking-[-0.04em] sm:text-4xl">가입하고<br />입찰공고 <TrialN />건을<br />무료로 분석해 보세요.</h1>
            <p className="mt-4 leading-relaxed text-ink-300">요금제와 같은 분석을 공고 <TrialN />건까지 그대로 써 보실 수 있습니다.<br />나라장터와 아파트 공고를 합쳐 <TrialN />건이며, 이미 분석한 공고는 다시 열어도 차감되지 않습니다.</p>
            <ul className="mt-6 space-y-3">
              {BENEFITS.map((b) => (
                <li key={b.t} className="glass flex gap-3 rounded-2xl p-4">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                  <span className="min-w-0 text-sm">
                    <b className="block text-white">{b.t}</b>
                    <span className="mt-0.5 block leading-relaxed text-ink-300">{b.d}</span>
                  </span>
                </li>
              ))}
            </ul>
            <a href="#signup" className="btn-mint mt-6 w-full lg:hidden">회원가입하고 시작하기</a>
            <p className="mt-5 text-xs text-ink-300">카드 등록 없음 · 자동 결제 없음 · 체험 뒤 월간 이용권 월 <Price k="lite" />원부터, VAT 포함</p>
          </div>
        </div>

        <div className="card p-6">
          <p className="text-sm font-bold">무료 체험은 이렇게 진행됩니다</p>
          <ol className="mt-4 space-y-3">
            {STEPS.map(([k, v], i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white tabular-nums">{i + 1}</span>
                <span className="min-w-0 text-sm"><b>{k}</b><span className="block text-ink-500">{v}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-ink-100 pt-4 text-xs leading-relaxed text-ink-500">맞춤 공고 요약 메일은 요금제를 시작하면 다음 영업일 아침부터 보내 드립니다.</p>
        </div>
      </div>

      <div id="signup" className="min-w-0 scroll-mt-20">{children}</div>
    </div>
  );
}
