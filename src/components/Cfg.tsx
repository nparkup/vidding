"use client";

import Link from "next/link";
import { priceOf, useSiteConfig } from "@/lib/siteConfig";

type PriceKey = keyof ReturnType<typeof priceOf>;

/** 관리자 화면에서 정한 요금 숫자 (천 단위 쉼표, '원'은 붙이지 않는다). 서버 렌더는 기본값 */
export function Price({ k }: { k: PriceKey }) {
  const v = priceOf(useSiteConfig())[k];
  return <>{Math.round(v).toLocaleString("ko-KR")}</>;
}

/** 무료 체험 공고 수 */
export function TrialN() {
  return <>{useSiteConfig().trialLimit}</>;
}

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 사이트 맨 위 공지 띠. 관리자 화면에서 켜고, 기간을 정하면 그 기간에만 보인다 */
export function SiteBanner() {
  const { banner: b } = useSiteConfig();
  const today = kstToday();
  if (!b.on || !b.text || (b.from && today < b.from) || (b.to && today > b.to)) return null;
  const tone = b.tone === "warn" ? "bg-amber-100 text-ink" : "bg-ink text-white";
  return (
    <div className={`${tone} text-sm`} role="status">
      <div className="container-x flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center">
        <span className="[overflow-wrap:anywhere]">{b.text}</span>
        {b.link && (b.link.startsWith("/")
          ? <Link href={b.link} className="font-bold underline underline-offset-2">{b.linkLabel || "자세히"}</Link>
          : <a href={b.link} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">{b.linkLabel || "자세히"}</a>)}
      </div>
    </div>
  );
}
