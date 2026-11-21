"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ContractDetailView } from "@/components/analysis/ContractDetailView";
import { contractShard, type Contract, type ContractDetail } from "@/lib/contracts";
import { loadSiteJson } from "@/lib/useSiteJson";
import { BidViewFallback } from "../../bids/view/BidView";

/**
 * /contracts/view?no=통합계약번호 : 계약 목록 파일에서 한 건을 찾고, 그 계약이 든 상세 조각(/contract-detail/{n}.json)을 받아 그린다.
 * 계약마다 정적 페이지를 만들지 않아 빌드 페이지 수·메모리가 늘지 않는다 (/bids/view, /apt-bids/view 와 같은 방식).
 */
export function ContractView() {
  const no = useSearchParams().get("no") ?? "";
  const [list, setList] = useState<Contract[] | null>(null);
  const [detail, setDetail] = useState<Record<string, ContractDetail> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    loadSiteJson<Contract[]>("contracts-data.json").then(setList).catch(() => setError(true));
  }, []);
  useEffect(() => {
    if (!no) return;
    // 상세 조각을 못 받아도 목록 항목만으로 화면을 그린다
    loadSiteJson<Record<string, ContractDetail>>(`contract-detail/${contractShard(no)}.json`).then(setDetail).catch(() => setDetail({}));
  }, [no]);
  const c = list?.find((x) => x.no === no);

  useEffect(() => {
    if (c) document.title = `${c.title} 계약 상세 | 입찰메이트LAB`;
  }, [c]);

  if (error) return <Message text="계약을 불러오지 못했습니다. 잠시 후 새로고침해 주세요." />;
  if (!list || (c && !detail)) return <BidViewFallback />;
  if (!c) return <Message text="최근 2주 경쟁 계약 목록에서 빠진 계약일 수 있습니다." />;
  return <ContractDetailView contract={{ ...c, x: detail?.[c.no] }} list={list} />;
}

function Message({ text }: { text: string }) {
  return (
    <div className="container-x py-20 text-center">
      <p className="text-3xl font-extrabold tracking-tight">계약을 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">{text}</p>
      <Link href="/contracts" className="btn-primary mt-8">계약현황으로</Link>
    </div>
  );
}
