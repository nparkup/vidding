import type { Metadata } from "next";
import { Suspense } from "react";
import { BidView, BidViewFallback } from "./BidView";

export const metadata: Metadata = { title: "공고 분석" };

export default function BidViewPage() {
  return (
    <Suspense fallback={<BidViewFallback />}>
      <BidView />
    </Suspense>
  );
}
