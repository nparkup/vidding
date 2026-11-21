"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { FEATURES, PLANS } from "@/lib/plans";
import { plansOf, useSiteConfig } from "@/lib/siteConfig";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR");

/** 월간 이용권 카드 세 장. 세 장 모두 같은 디자인이고 추천 표시는 없다. 금액·공고 예측 건수는 관리자 화면의 페이지 설정 값 */
export function PricingCards() {
  const cfg = plansOf(useSiteConfig());
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {PLANS.map((p) => {
        const c = cfg.find((x) => x.id === p.id)!;
        return (
          <div key={p.id} className="flex min-w-0 flex-col rounded-3xl border border-ink-100 bg-white p-7 shadow-card">
            <p className="text-lg font-bold">{p.name}</p>
            <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
            <p className="mt-6 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {won(c.price)}<span className="text-lg font-bold">원</span>
              <span className="ml-1 text-sm font-medium text-ink-400">/ 월</span>
            </p>
            <p className="mt-3 rounded-xl bg-mint-50 px-3 py-2 text-sm font-bold text-mint-700">
              공고 예측 {c.quota === null ? "무제한" : <>월 <span className="tabular-nums">{won(c.quota)}</span>건</>}
            </p>
            <p className="mt-2 text-xs text-ink-400">VAT 포함 · 약정 없음 · 낙찰 성공보수 없음</p>
            <ul className="mt-6 flex-1 space-y-3 border-t border-ink-100 pt-6 text-sm">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />{f}</li>
              ))}
            </ul>
            <Link href={`/apply?plan=${p.id}`} className="btn-mint mt-8">무료 체험으로 시작</Link>
          </div>
        );
      })}
    </div>
  );
}
