import Link from "next/link";
import { Check } from "lucide-react";
import { ANNUAL_SAVING, ANNUAL_SAVING_PCT, FEATURES, MONTHLY_PRICE, PLANS } from "@/lib/plans";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 요금 카드 두 장(연간·월간). 실제 결제 금액을 가장 먼저, 월 환산은 그 다음에 보여 준다. */
export function PricingCards({ dark = true }: { dark?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PLANS.map((p) => {
        const hi = p.highlight && dark;
        const annual = p.months === 12;
        return (
          <div key={p.id} className={`relative flex min-w-0 flex-col overflow-hidden rounded-3xl border p-7 sm:p-8 ${hi ? "border-ink bg-ink-900 text-white shadow-lift" : p.highlight ? "border-mint bg-white shadow-glow" : "border-ink-100 bg-white shadow-card"}`}>
            {hi && <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-mint/30 blur-3xl" />}
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-lg font-bold">{p.name}</p>
              {annual && <span className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-bold text-white">{ANNUAL_SAVING_PCT}% 절약</span>}
            </div>
            <p className={`relative mt-1 text-sm ${hi ? "text-ink-300" : "text-ink-500"}`}>{p.tagline}</p>
            <p className="relative mt-6 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {won(p.charge)}<span className="text-lg font-bold">원</span>
              <span className={`ml-1 text-sm font-medium ${hi ? "text-ink-300" : "text-ink-400"}`}>/ {annual ? "연 1회 결제" : "월"}</span>
            </p>
            <p className={`relative mt-2 text-sm tabular-nums ${hi ? "text-ink-100" : "text-ink-500"}`}>
              {annual
                ? <>월 <b>{won(p.monthly)}원</b> 꼴 · 월간 1년({won(MONTHLY_PRICE * 12)}원)보다 {won(ANNUAL_SAVING)}원 적게</>
                : <>매달 {won(p.charge)}원 결제 · 약정 없음</>}
            </p>
            <p className={`relative mt-1 text-xs ${hi ? "text-ink-300" : "text-ink-400"}`}>VAT 포함 금액 · 낙찰 성공보수 없음</p>
            <ul className={`relative mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${hi ? "border-white/10" : "border-ink-100"}`}>
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />{f}</li>
              ))}
            </ul>
            <Link href={`/apply?plan=${p.id}`} className={`relative mt-8 ${p.highlight ? "btn-mint" : "btn-ghost"}`}>무료 체험으로 시작</Link>
          </div>
        );
      })}
    </div>
  );
}
