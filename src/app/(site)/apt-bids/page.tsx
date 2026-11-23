import type { Metadata } from "next";
import { AptBidsExplorer } from "@/components/AptBidsExplorer";
import { BidSourceTabs } from "@/components/BidSourceTabs";
import { dateTime } from "@/lib/format";
import { getAptBids, getBids, getNuriBids } from "@/lib/store";

export const metadata: Metadata = {
  title: "아파트 공고",
  description: "전국 아파트(공동주택) 관리주체가 K-apt에 올린 청소·경비·소독·위탁관리 등 사업자 선정 입찰공고를 업종·지역·마감일로 찾습니다.",
};
export const revalidate = 600;

export default async function AptBidsPage() {
  const data = await getAptBids();
  const nuri = (await getNuriBids()).items.filter((b) => new Date(b.closeAt).getTime() > Date.now()).length;
  const g2bOpen = (await getBids()).filter((b) => new Date(b.closeAt).getTime() > Date.now()).length;
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">아파트 청소·경비·위탁관리 등 진행 중 공고 {data.items.length.toLocaleString()}건</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">공고 검색</h1>
        </div>
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs text-ink-500 sm:self-auto">
          <span className={`h-2 w-2 rounded-full ${data.items.length ? "bg-mint" : "bg-amber"}`} />
          {data.items.length ? "공동주택관리정보시스템 연동" : "자료 준비 중"} · 갱신 {dateTime(data.builtAt)}
        </p>
      </div>
      <BidSourceTabs active="apt" counts={{ g2b: g2bOpen, apt: data.items.length, nuri }} />
      <AptBidsExplorer />
    </div>
  );
}
