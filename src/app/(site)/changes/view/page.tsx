import type { Metadata } from "next";
import { Suspense } from "react";
import { BidViewFallback } from "../../bids/view/BidView";
import { ChangeView } from "./ChangeView";

export const metadata: Metadata = { title: "정정·취소 공고 상세" };

export default function ChangeViewPage() {
  return (
    <Suspense fallback={<BidViewFallback />}>
      <ChangeView />
    </Suspense>
  );
}
