import type { Metadata } from "next";
import { Suspense } from "react";
import { BidViewFallback } from "../../bids/view/BidView";
import { AptBidView } from "./AptBidView";

export const metadata: Metadata = { title: "아파트 공고 상세" };

export default function AptBidViewPage() {
  return (
    <Suspense fallback={<BidViewFallback />}>
      <AptBidView />
    </Suspense>
  );
}
