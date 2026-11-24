"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AptBidDetailView } from "@/components/AptBidDetailView";
import type { AptBidsFile } from "@/lib/apt";
import { loadSiteJson } from "@/lib/useSiteJson";
import { BidViewFallback } from "../../bids/view/BidView";

/**
 * /apt-bids/view?no=입찰번호 : 아파트 공고 파일에서 한 건을 찾아 상세 화면을 그린다.
 * 공고마다 정적 페이지를 만들지 않아 빌드 페이지 수·메모리가 늘지 않는다 (나라장터 /bids/view 와 같은 방식).
 */
export function AptBidView() {
  const no = useSearchParams().get("no") ?? "";
  const [data, setData] = useState<AptBidsFile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadSiteJson<AptBidsFile>("apt-bids-data.json").then(setData).catch(() => setError(true));
  }, []);
  const bid = data?.items.find((b) => b.no === no);

  useEffect(() => {
    if (bid) document.title = `${bid.title} 아파트 공고 | 비드매트릭스`;
  }, [bid]);

  if (error) return <Message text="공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." />;
  if (!data) return <BidViewFallback />;
  if (!bid) return <Message text="마감되었거나 취소된 공고일 수 있습니다." />;
  return <AptBidDetailView bid={bid} pricing={data.pricing} />;
}

function Message({ text }: { text: string }) {
  return (
    <div className="container-x py-20 text-center">
      <p className="text-3xl font-extrabold tracking-tight">공고를 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">{text}</p>
      <Link href="/apt-bids" className="btn-primary mt-8">아파트 공고 목록으로</Link>
    </div>
  );
}
