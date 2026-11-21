"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { FEATURES, PLANS } from "@/lib/plans";
import { plansOf, useSiteConfig } from "@/lib/siteConfig";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 월간 이용권 카드 세 장. 금액·공고 예측 건수는 관리자 화면의 페이지 설정 값 */
export function PricingCards({ dark = true }: { dark?: boolean }) {
  const cfg = plansOf(useSiteConfig());
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {PLANS.map((p) => {
        const c = cfg.find((x) => x.id === p.id)!;
        const hi = p.highlight && dark;
        return (
          <div key={p.id} className={`relative flex min-w-0 flex-col overflow-hidden rounded-3xl border p-7 ${hi ? "border-ink bg-ink-900 text-white shadow-lift" : p.highlight ? "border-mint bg-white shadow-glow" : "border-ink-100 bg-white shadow-card"}`}>
            {hi && <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-mint/30 blur-3xl" />}
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-lg font-bold">{p.name}</p>
              {p.highlight && <span className="shrink-0 rounded-full bg-mint px-3 py-1 text-xs font-bold text-white">추천</span>}
            </div>
            <p className={`relative mt-1 text-sm ${hi ? "text-ink-300" : "text-ink-500"}`}>{p.tagline}</p>
            <p className="relative mt-6 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {won(c.price)}<span className="text-lg font-bold">원</span>
              <span className={`ml-1 text-sm font-medium ${hi ? "text-ink-300" : "text-ink-400"}`}>/ 월</span>
            </p>
            <p className={`relative mt-3 rounded-xl px-3 py-2 text-sm font-bold ${hi ? "bg-white/10 text-white" : "bg-mint-50 text-mint-700"}`}>
              공고 예측 {c.quota === null ? "무제한" : <>월 <span className="tabular-nums">{won(c.quota)}</span>건</>}
            </p>
            <p className={`relative mt-2 text-xs ${hi ? "text-ink-300" : "text-ink-400"}`}>VAT 포함 · 약정 없음 · 낙찰 성공보수 없음</p>
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
