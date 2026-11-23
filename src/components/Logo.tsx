"use client";

import Link from "next/link";
import { hardGo } from "@/lib/hardGo";

/** 입찰메이트LAB 심볼: M 자형 분석 라인 + 판정 노드 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#24304A" />
          <stop offset="100%" stopColor="#0B1426" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#lm-bg)" />
      <path d="M8.5 23V9.5L16 17.5L23.5 9.5V23" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="17.5" r="3.2" fill="#12B886" stroke="#0B1426" strokeWidth="1.6" />
    </svg>
  );
}

/** reset: 누르면 모든 화면의 선택·조회·저장 조건을 지우고 첫 화면을 새로 연다 (사이트 헤더·푸터) */
export function Logo({ href = "/", light = false, reset = false }: { href?: string; light?: boolean; reset?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="입찰메이트LAB 홈" onClick={reset ? (e) => hardGo(e, href) : undefined}>
      <LogoMark className={`h-8 w-8 ${light ? "rounded-lg ring-1 ring-white/15" : ""}`} />
      <span className="flex flex-col leading-none">
        <span className={`text-[17px] font-extrabold tracking-[-0.04em] ${light ? "text-white" : "text-ink"}`}>
          입찰메이트<span className="text-mint">LAB</span>
        </span>
        <span className={`mt-1 text-[9px] font-bold tracking-[0.14em] ${light ? "text-ink-300" : "text-ink-400"}`}>PUBLIC BID ANALYTICS</span>
      </span>
    </Link>
  );
}
