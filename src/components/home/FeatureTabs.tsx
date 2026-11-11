"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export interface FeatureTab {
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
      <div role="tablist" className="mx-auto flex max-w-2xl gap-1 overflow-x-auto rounded-full bg-paper p-1">
        {tabs.map((x, n) => (
          <button
            key={x.label}
            role="tab"
            aria-selected={n === i}
            onClick={() => setI(n)}
            className={`flex-1 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition ${n === i ? "bg-white text-ink shadow-card" : "text-ink-400 hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div key={t.label} className="animate-fade-up">
          <p className="text-sm font-bold tracking-wide text-mint-600">Feature 0{i + 1}</p>
          <h3 className="mt-3 text-2xl font-extrabold leading-snug tracking-[-0.03em] sm:text-[32px]">{t.title}</h3>
          <p className="lead mt-4">{t.desc}</p>
          <Link href={t.href} className="group mt-7 inline-flex items-center gap-1 font-semibold text-mint-600">
            {t.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
        <div key={`p-${t.label}`} className="animate-fade-up rounded-3xl bg-gradient-to-br from-mint-50 via-paper to-sky-100/60 p-4 sm:p-6">
          {t.preview}
        </div>
      </div>
    </div>
  );
}
