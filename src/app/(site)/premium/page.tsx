import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { NaraPredictFlow } from "@/components/premium/NaraPredictFlow";
import { AptPriceRedirect } from "@/components/premium/AptPriceRedirect";
import { TRIAL_LIMIT_ENABLED } from "@/lib/trialLimit";

export const metadata: Metadata = {
  title: "나라장터 입찰 예측",
  description: "공고 첨부파일의 평가기준과 나라장터 기업 정보로 적격심사·협상계약 예상 점수를 계산합니다.",
};

export default function PremiumPage() {
  return (
    <>
      <AptPriceRedirect />
      <PageHero
        eyebrow="프리미엄 · 입찰점수 예측 · 나라장터 입찰 예측"
        title={<>기업을 조회하고 공고를 고르면,<br />입찰 점수가 나옵니다.</>}
        lead="입찰공고에 첨부된 공고서·규격서에서 평가기준과 배점을 추출하고, 나라장터에 등록된 기업 정보와 신용평가 서류를 결합해 이 공고에서 받을 예상 점수와 통과 여부를 계산합니다."
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="#predict" className="btn-mint">지금 예측해 보기</a>
          <Link href="/pricing" className="btn-ghost">요금제 보기</Link>
        </div>
      </PageHero>

      <section id="predict" className="container-x scroll-mt-20 pt-12">
        <p className="eyebrow">나라장터 입찰 예측</p>
        <h2 className="h-section mt-3">세 단계로 입찰 점수를 예측합니다</h2>
        <p className="lead mt-3 max-w-3xl">회원가입 때 등록한 기업으로 입찰 기업을 조회하고, 그 기업이 참가할 수 있는 공고 중 하나를 고르면 참가자격, 예상 평가점수, 통과 가능한 투찰률을 계산합니다.{TRIAL_LIMIT_ENABLED && " 무료 체험으로 입찰공고 3건까지 분석할 수 있습니다."}</p>
        <div className="mt-8">
          <Suspense fallback={<p className="card p-6 text-sm text-ink-300">불러오는 중…</p>}>
            <NaraPredictFlow />
          </Suspense>
        </div>
      </section>
    </>
  );
}
