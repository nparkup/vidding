import { EngineName } from "@/components/EngineName";
import type { Metadata } from "next";
import { BidSourceTabs } from "@/components/BidSourceTabs";
import { NuriBidsExplorer } from "@/components/NuriBidsExplorer";
import { dateTime } from "@/lib/format";
import { getAptBids, getBids, getNuriBids } from "@/lib/store";

export const metadata: Metadata = {
  title: "누리장터 공고",
  description: "조달청 누리장터에 올라온 민간 기업·재건축조합·법인의 용역·공사·물품 입찰공고를 업무·지역·마감일로 찾고, 같은 기관의 지난 개찰 결과와 계약을 함께 봅니다.",
};
export const revalidate = 600;

export default async function NuriBidsPage() {
  const data = await getNuriBids();
  const now = Date.now();
  const open = data.items.filter((b) => new Date(b.closeAt).getTime() > now).length;
  const g2b = (await getBids()).filter((b) => new Date(b.closeAt).getTime() > now).length;
  const apt = (await getAptBids()).items.length;
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">누리장터 민간 용역·공사·물품 진행 중 공고 {open.toLocaleString()}건</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]"><EngineName id="finder" /> 공고 검색</h1>
        </div>
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs text-ink-500 sm:self-auto">
          <span className={`h-2 w-2 rounded-full ${data.items.length ? "bg-mint" : "bg-amber"}`} />
          {data.items.length ? "조달청 누리장터 연동" : "자료 준비 중"} · 갱신 {dateTime(data.builtAt)}
        </p>
      </div>
      <BidSourceTabs active="nuri" counts={{ g2b, apt, nuri: open }} />
      <NuriBidsExplorer />
    </div>
  );
}
