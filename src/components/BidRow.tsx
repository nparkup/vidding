import Link from "next/link";
import type { MatchResult } from "@/lib/analysis";
import type { Bid } from "@/lib/types";
import { daysLeft } from "@/lib/analysis";
import { shortDate, won } from "@/lib/format";
import { CloseDay } from "./CloseDay";
import { DdayBadge, ScoreMeter } from "./Badges";
import { bidHref } from "@/lib/links";
import { closedLabel } from "@/lib/bidMethod";
import { AgencyLogo } from "./AgencyLogo";

export function BidRow({ bid, match, href }: { bid: Bid; match?: MatchResult; href?: string }) {
  const left = match?.daysLeft ?? daysLeft(bid.closeAt);
  const closed = closedLabel(bid);
  return (
    <Link
      href={href ?? bidHref(bid.id)}
      className="group grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-mint hover:shadow-card sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <DdayBadge days={left} />
          <span className="chip">{bid.bizType && bid.bizType !== "용역" ? `${bid.bizType} · ` : ""}{bid.category}</span>
          <span className="chip">{bid.region === "전국" ? "전국" : `${bid.region} 제한`}</span>
          <span className="chip">{bid.contractMethod}</span>
          {bid.amend && <span className="chip border-amber/40 bg-amber-100/60 text-ink" title={bid.amend.fields.length ? `바뀐 항목: ${bid.amend.fields.join(", ")}` : "공고서 정정"}>정정 {Number(bid.bidNtceOrd)}차{bid.amend.fields.length ? ` · ${bid.amend.fields.slice(0, 2).join("·")}` : ""}</span>}
          {closed && <span className="chip border-coral/30 bg-coral-100/60 text-coral" title={closed}>참가 불가 · {closed.split(" · ")[1]}</span>}
        </div>
        <p className="mt-2 text-[16px] font-semibold leading-snug group-hover:text-mint-600 [overflow-wrap:anywhere]">
          <CloseDay iso={bid.closeAt} />
          {bid.title}
        </p>
        <p className="mt-1 text-sm text-ink-500">
          <AgencyLogo name={bid.demandAgency} size={16} maxW={72} className="mr-1.5 -mt-0.5" />
          {bid.demandAgency} · 면허 {bid.licenseRaw || bid.licenses.join(", ") || "제한없음"}
        </p>
        {match && !match.eligible && <p className="mt-1 text-xs font-medium text-coral">{match.blockers.join(" · ")}</p>}
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end sm:gap-5">
        <div className="sm:text-right">
          <p className="text-lg font-bold tabular-nums">{won(bid.baseAmount)}</p>
          <p className="text-xs text-ink-300">마감 {shortDate(bid.closeAt)}{(bid.bizType ?? "용역") === "용역" && ` · ${bid.periodMonths}개월`}</p>
        </div>
        {match && <ScoreMeter grade={match.grade} score={match.score} />}
      </div>
    </Link>
  );
}
