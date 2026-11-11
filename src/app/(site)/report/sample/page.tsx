import type { Metadata } from "next";
import Link from "next/link";
import { DeskArt } from "@/components/art/Desk";
import { PageHero } from "@/components/PageHero";
import { WeeklyReportView } from "@/components/WeeklyReportView";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";

export const metadata: Metadata = { title: "주간 분석보고서 샘플" };
export const revalidate = 600;

export default async function SampleReport() {
  const bids = await getBids();
  const client = SEED_CLIENTS[1];
  return (
    <>
    <PageHero
      eyebrow="보고서 샘플"
      title={<>주 1회<br />주요 공고 분석보고서</>}
      lead="매주 월요일 아침, 지난주 공고 흐름과 이번 주 집중할 공고를 한 장으로 정리해 드립니다. 아래는 가상의 고객사 기준 샘플입니다."
      art={<DeskArt className="w-full" />}
    />
    <div className="container-x py-12 sm:py-16">
      <div>
        <WeeklyReportView client={client} bids={bids} weekLabel="이번 주" note="대전·세종 권역 통합관리 공고가 늘고 있습니다. 상위 2건은 공동도급이 허용되어 기존 협력사와 컨소시엄을 구성하면 실적점수에서 유리합니다." />
      </div>
      <div className="mt-8 text-center">
        <Link href="/apply" className="btn-mint">우리 회사 보고서 받아보기</Link>
      </div>
    </div>
    </>
  );
}
