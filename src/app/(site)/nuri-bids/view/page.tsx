import type { Metadata } from "next";
import { Suspense } from "react";
import { BidViewFallback } from "../../bids/view/BidView";
import { NuriBidView } from "./NuriBidView";

export const metadata: Metadata = { title: "민간 공고 상세" };

export default function NuriBidViewPage() {
  return (
    <Suspense fallback={<BidViewFallback />}>
      <NuriBidView />
    </Suspense>
  );
}
