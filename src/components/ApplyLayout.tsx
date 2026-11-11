import { Check } from "lucide-react";
import { HeroCity } from "./art/HeroCity";

export function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-x grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_1.25fr] lg:gap-12">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 p-7 text-white sm:p-9">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-mint/25 blur-[100px]" />
          <div className="relative">
            <p className="text-sm font-semibold text-mint-400">무료 맞춤 진단</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-[1.2] tracking-[-0.04em] sm:text-4xl">조건만 알려주세요.<br />나머지는 저희가 찾습니다.</h1>
            <p className="mt-4 leading-relaxed text-ink-300">신청 즉시 지금 참가 가능한 공고 목록을 보여드리고, 영업일 기준 1일 이내 담당 매니저가 연락드립니다.</p>
            <HeroCity className="mx-auto mt-4 w-full max-w-sm" />
            <ul className="mt-2 space-y-3">
              {[
                ["즉시", "현재 참가 가능한 공고 수와 상위 공고 확인"],
                ["1영업일 내", "담당 매니저 전화 상담, 조건 세부 조정"],
                ["다음 날 아침", "첫 맞춤 공고 요약 이메일 발송, 2주 무료"],
              ].map(([k, v]) => (
                <li key={k} className="glass flex items-center gap-3 rounded-2xl p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>
                  <span className="text-sm"><b className="text-mint-300">{k}</b> <span className="text-ink-100">{v}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
