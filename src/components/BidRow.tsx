import Link from "next/link";
import type { MatchResult } from "@/lib/analysis";
import type { Bid } from "@/lib/types";
import { daysLeft } from "@/lib/analysis";
import { shortDate, won } from "@/lib/format";
import { DdayBadge, GradeBadge } from "./Badges";

export function BidRow({ bid, match, href }: { bid: Bid; match?: MatchResult; href?: string }) {
  const left = match?.daysLeft ?? daysLeft(bid.closeAt);
  return (
    <Link
      href={href ?? `/bids/${bid.id}`}
      className="group grid gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-mint hover:shadow-card sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <DdayBadge days={left} />
          <span className="chip">{bid.category}</span>
          <span className="chip">{bid.region === "전국" ? "전국" : `${bid.region} 제한`}</span>
          <span className="chip">{bid.contractMethod}</span>
          {match && <GradeBadge grade={match.grade} score={match.score} />}
        </div>
        <p className="mt-2 truncate text-[16px] font-semibold group-hover:text-mint-600">{bid.title}</p>
        <p className="mt-1 line-clamp-1 text-sm text-ink-500">
          {bid.demandAgency} · 면허 {bid.licenseRaw || bid.licenses.join(", ") || "제한없음"}
        </p>
        {match && !match.eligible && <p className="mt-1 text-xs font-medium text-coral">{match.blockers.join(" · ")}</p>}
      </div>
      <div className="flex items-end justify-between gap-6 sm:flex-col sm:items-end sm:gap-1">
        <p className="text-lg font-bold tabular-nums">{won(bid.baseAmount)}</p>
        <p className="text-xs text-ink-300">마감 {shortDate(bid.closeAt)} · {bid.periodMonths}개월</p>
      </div>
    </Link>
  );
}
