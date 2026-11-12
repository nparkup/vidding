"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { BidDetailView } from "@/components/BidDetailView";
import { useBids } from "@/lib/useBids";

/** /bids/view?id=공고번호-차수 : 공고 목록 파일에서 한 건을 찾아 분석 화면을 그린다 */
export function BidView() {
  const id = useSearchParams().get("id") ?? "";
  const { bids, error } = useBids();
  const bid = bids?.find((b) => b.id === id) ?? bids?.find((b) => b.bidNtceNo === id.split("-")[0]);

  useEffect(() => {
    if (bid) document.title = `${bid.title} 공고 분석 | 입찰메이트LAB`;
  }, [bid]);

  if (error) return <Message text="공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." />;
  if (!bids) return <BidViewFallback />;
  if (!bid) return <Message text="마감되었거나 취소된 공고일 수 있습니다." />;
  return <BidDetailView bid={bid} />;
}

function Message({ text }: { text: string }) {
  return (
    <div className="container-x py-20 text-center">
      <p className="text-3xl font-extrabold tracking-tight">공고를 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">{text}</p>
      <Link href="/bids" className="btn-primary mt-8">공고 검색으로</Link>
    </div>
  );
}

export function BidViewFallback() {
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="h-4 w-24 animate-pulse rounded bg-ink-100" />
      <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-ink-100" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="card h-80 animate-pulse" />
        <div className="card h-80 animate-pulse" />
      </div>
    </div>
  );
}
