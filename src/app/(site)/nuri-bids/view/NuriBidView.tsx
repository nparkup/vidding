"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NuriBidDetailView } from "@/components/NuriBidDetailView";
import type { NuriBidsFile } from "@/lib/nuri";
import { loadSiteJson } from "@/lib/useSiteJson";
import { BidViewFallback } from "../../bids/view/BidView";

/**
 * /nuri-bids/view?no=공고번호 : 누리장터 공고 파일에서 한 건을 찾아 상세 화면을 그린다.
 * 공고마다 정적 페이지를 만들지 않아 빌드 페이지 수·메모리가 늘지 않는다 (/apt-bids/view 와 같은 방식).
 */
export function NuriBidView() {
  const no = useSearchParams().get("no") ?? "";
  const [data, setData] = useState<NuriBidsFile | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadSiteJson<NuriBidsFile>("nuri-bids-data.json").then(setData).catch(() => setError(true));
  }, []);
  const bid = data?.items.find((b) => b.no === no);

  useEffect(() => {
    if (bid) document.title = `${bid.title} 누리장터 공고 | 비드매트릭스`;
  }, [bid]);

  if (error) return <Message text="공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." />;
  if (!data) return <BidViewFallback />;
  if (!bid) return <Message text="마감되었거나 취소된 공고일 수 있습니다." />;
  return <NuriBidDetailView bid={bid} data={data} />;
}

function Message({ text }: { text: string }) {
  return (
    <div className="container-x py-20 text-center">
      <p className="text-3xl font-extrabold tracking-tight">공고를 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">{text}</p>
      <Link href="/nuri-bids" className="btn-primary mt-8">누리장터 공고 목록으로</Link>
    </div>
  );
}
