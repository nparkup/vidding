"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { EngineId } from "@/lib/engines";

export interface FeatureTab {
  /** 이 화면을 맡는 엔진 (비드파인더·비드아틀라스·비드인사이트) */
  engine?: EngineId;
  label: string;
  title: string;
  desc: string;
  href: string;
  cta: string;
  preview: ReactNode;
}

/** 번호가 붙은 기능 탭 (Feature 01~03) */
export function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const [i, setI] = useState(0);
  const t = tabs[i];
  return (
    <div>
      <div role="tablist" className="mx-auto grid max-w-2xl grid-cols-2 gap-1 rounded-3xl bg-paper p-1 sm:flex sm:rounded-full">
        {tabs.map((x, n) => (
          <button
            key={x.label}
            role="tab"
            aria-selected={n === i}
            onClick={() => setI(n)}
            className={`flex-1 whitespace-nowrap rounded-[1.25rem] sm:rounded-full px-4 py-2.5 text-sm font-semibold transition ${n === i ? "bg-white text-ink shadow-card" : "text-ink-400 hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div key={t.label} className="animate-fade-up">
          <h3 className="text-2xl font-extrabold leading-snug tracking-[-0.03em] sm:text-[32px]">{t.title}</h3>
          <p className="lead mt-4">{t.desc}</p>
          <Link href={t.href} className="mt-7 inline-block font-semibold text-mint-600 underline-offset-4 hover:underline">
            {t.cta}
          </Link>
        </div>
        {/* 미리보기는 그림처럼 보여 주기만 한다: 안의 공고 카드 링크로 이동하지 않게 inert + pointer-events-none */}
        <div key={`p-${t.label}`} inert className="pointer-events-none select-none animate-fade-up rounded-3xl bg-gradient-to-br from-mint-50 via-paper to-sky-100/60 p-4 sm:p-6">
          {t.preview}
        </div>
      </div>
    </div>
  );
}
