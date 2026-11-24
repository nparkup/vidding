"use client";

import Link from "next/link";
import { hardGo } from "@/lib/hardGo";

/** 비드매트릭스 심볼: 3x3 공고 격자 중 가운데 맞는 한 칸(민트)을 골라냄 */
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
      <rect x="7.0" y="7.0" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.62} />
      <rect x="13.6" y="7.0" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.38} />
      <rect x="20.2" y="7.0" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.62} />
      <rect x="7.0" y="13.6" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.38} />
      <rect x="13.6" y="13.6" width="4.8" height="4.8" rx="1.3" fill="#12B886" />
      <rect x="20.2" y="13.6" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.38} />
      <rect x="7.0" y="20.2" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.62} />
      <rect x="13.6" y="20.2" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.38} />
      <rect x="20.2" y="20.2" width="4.8" height="4.8" rx="1.3" fill="#FFFFFF" opacity={0.62} />
    </svg>
  );
}

/** reset: 누르면 모든 화면의 선택·조회·저장 조건을 지우고 첫 화면을 새로 연다 (사이트 헤더·푸터) */
export function Logo({ href = "/", light = false, reset = false }: { href?: string; light?: boolean; reset?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="비드매트릭스 홈" onClick={reset ? (e) => hardGo(e, href) : undefined}>
      <LogoMark className={`h-8 w-8 ${light ? "rounded-lg ring-1 ring-white/15" : ""}`} />
      <span className="flex flex-col leading-none">
        <span className={`text-[17px] font-extrabold tracking-[-0.04em] ${light ? "text-white" : "text-ink"}`}>
          비드<span className="text-mint">매트릭스</span>
        </span>
        <span className={`mt-1 text-[9px] font-bold tracking-[0.14em] ${light ? "text-ink-300" : "text-ink-400"}`}>PUBLIC BID ANALYTICS</span>
      </span>
    </Link>
  );
}
