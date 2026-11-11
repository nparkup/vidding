import type { Metadata } from "next";
import { Suspense } from "react";
import { BidsExplorer, BidsExplorerFallback } from "@/components/BidsExplorer";
import { dateTime } from "@/lib/format";
import { getBids, getSyncInfo } from "@/lib/store";

export const metadata: Metadata = { title: "공고 검색" };
export const revalidate = 600;

export default async function BidsPage() {
  const bids = await getBids();
  const sync = getSyncInfo();
  const open = bids.filter((b) => new Date(b.closeAt).getTime() > Date.now()).length;
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">나라장터 용역·공사·물품 전 업종 공고 {open.toLocaleString()}건</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">공고 검색</h1>
        </div>
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs text-ink-500 sm:self-auto">
          <span className={`h-2 w-2 rounded-full ${sync.source === "g2b" ? "bg-mint" : "bg-amber"}`} />
          {sync.source === "g2b" ? "나라장터 연동" : "데모 데이터"} · 갱신 {dateTime(sync.syncedAt)}
        </p>
      </div>
      <Suspense fallback={<BidsExplorerFallback />}>
        <BidsExplorer />
      </Suspense>
    </div>
  );
}
