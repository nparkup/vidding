import type { Metadata } from "next";
import { Suspense } from "react";
import { BidViewFallback } from "../../bids/view/BidView";
import { ContractView } from "./ContractView";

export const metadata: Metadata = { title: "계약 상세" };

export default function ContractViewPage() {
  return (
    <Suspense fallback={<BidViewFallback />}>
      <ContractView />
    </Suspense>
  );
}
