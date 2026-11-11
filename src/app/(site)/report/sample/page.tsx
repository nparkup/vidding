import type { Metadata } from "next";
import Link from "next/link";
import { WeeklyReportView } from "@/components/WeeklyReportView";
import { getBids, listClients } from "@/lib/store";

export const metadata: Metadata = { title: "주간 분석보고서 샘플" };
export const dynamic = "force-dynamic";

export default async function SampleReport() {
  const bids = await getBids();
  const client = listClients()[1] ?? listClients()[0];
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow">샘플</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">주 1회 주요 공고 분석보고서</h1>
      <p className="mt-3 max-w-2xl text-ink-500">매주 월요일 아침, 지난주 공고 흐름과 이번 주 집중할 공고를 한 장으로 정리해 드립니다. 아래는 가상의 고객사 기준 샘플입니다.</p>
      <div className="mt-8">
        <WeeklyReportView client={client} bids={bids} weekLabel="이번 주" note="대전·세종 권역 통합관리 공고가 늘고 있습니다. 상위 2건은 공동도급이 허용되어 기존 협력사와 컨소시엄을 구성하면 실적점수에서 유리합니다." />
      </div>
      <div className="mt-8 text-center">
        <Link href="/apply" className="btn-mint">우리 회사 보고서 받아보기</Link>
      </div>
    </div>
  );
}
