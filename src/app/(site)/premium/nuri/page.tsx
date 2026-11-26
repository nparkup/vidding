import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { ScorePredictor } from "@/components/premium/ScorePredictor";
import { TRIAL_LIMIT_ENABLED } from "@/lib/trialLimit";

export const metadata: Metadata = {
  title: "누리장터 입찰 예측",
  description: "누리장터 공고 첨부의 평가 배점표와 기업 정보로 적격심사·제안서평가 예상 점수를 계산합니다.",
};

export default function NuriPredictPage() {
  return (
    <>
      <PageHero
        title={<>누리장터 공고도,<br />우리 회사 점수가 나옵니다.</>}
        lead="누리장터 공고(재건축조합·민간 기업·사회복지법인 등)의 첨부에서 평가 배점표를 읽고, 국세청·나라장터·금융위원회 기업 정보와 결합해 이 공고에서 받을 예상 점수와 통과 여부를 계산합니다."
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="#predict" className="btn-mint">지금 예측해 보기</a>
          <Link href="/nuri-bids" className="btn-ghost">누리장터 공고 보기</Link>
        </div>
      </PageHero>

      <section id="predict" className="container-x scroll-mt-20 pt-12">
        <h2 className="h-section">누리장터 공고 하나로 직접 계산해 보세요</h2>
        <p className="lead mt-3 max-w-3xl">첨부에서 평가 배점표를 읽은 누리장터 공고만 고를 수 있습니다. 배점표가 없는 공고(최고가·최저가, 총회 의결 시공자 선정 등)는 예측 대상이 아닙니다.{TRIAL_LIMIT_ENABLED && " 무료 체험으로 입찰공고 3건까지 분석할 수 있습니다(나라장터·공동주택 입찰 예측과 합산)."}</p>
        <div className="mt-8">
          <Suspense fallback={<p className="card p-6 text-sm text-ink-300">불러오는 중…</p>}>
            <ScorePredictor source="nuri" />
          </Suspense>
        </div>
      </section>

      <section className="container-x pt-12">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-7">
            <p className="text-lg font-bold">읽는 자료</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">조달청 누리장터 민간입찰공고·민간낙찰정보를 하루 세 번 모으고, 적격심사·제안서평가 공고의 첨부에서 평가항목·배점·점수 구간을 읽습니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">나라장터 입찰 예측과 다른 점</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">누리장터 공고는 발주처마다 자체 기준을 쓰고 공식 기준표·낙찰하한율 값이 없습니다. 원문 배점표가 있는 공고만 예측하고, 가격 평가 산식은 공고서에서 읽지 못하면 추정합니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">지난 개찰 결과</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">누리장터는 최종 낙찰 자료를 공개하지 않아, 같은 업무·낙찰방법 누리장터 공고의 개찰 1순위 투찰률과 같은 기관의 지난 개찰을 보여 줍니다.</p>
          </div>
        </div>
      </section>
    </>
  );
}
