import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { AptPredictor } from "@/components/premium/AptPredictor";

export const metadata: Metadata = {
  title: "아파트 예측",
  description: "K-apt 아파트 청소·경비·소독 공고의 예상 낙찰금액을 같은 단지 직전 계약과 과거 낙찰 변화율로 계산합니다.",
};

export default function AptPredictPage() {
  return (
    <>
      <PageHero
        eyebrow="프리미엄 · 평가점수 예측 · 아파트 예측"
        title={<>아파트 공고를 고르면,<br />예상 낙찰금액이 나옵니다.</>}
        lead="공동주택관리정보시스템(K-apt)의 입찰결과·수의계약 공지에서 같은 단지·같은 분야의 직전 계약금액을 찾고, 과거에 직전 계약 다음 낙찰이 얼마나 달라졌는지로 이번 공고의 예상 낙찰금액과 구간을 계산합니다."
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="#predict" className="btn-mint">지금 예측해 보기</a>
          <Link href="/apt-bids" className="btn-ghost">아파트 공고 보기</Link>
        </div>
      </PageHero>

      <section id="predict" className="container-x scroll-mt-20 pt-12">
        <p className="eyebrow">아파트 예측</p>
        <h2 className="h-section mt-3">아파트 공고 하나로 직접 계산해 보세요</h2>
        <p className="lead mt-3 max-w-3xl">공고를 고르면 같은 단지의 직전 계약이 바로 적용됩니다. 이번 계약기간이나 규모가 직전과 다르면 바꿔 넣어 보세요. 오른쪽에 예상 낙찰금액과 구간이 계산됩니다.</p>
        <div className="mt-8">
          <Suspense fallback={<p className="card p-6 text-sm text-ink-300">불러오는 중…</p>}>
            <AptPredictor />
          </Suspense>
        </div>
      </section>

      <section className="container-x pt-12">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-7">
            <p className="text-lg font-bold">읽는 자료</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">국토교통부 공동주택 입찰공고·입찰결과·수의계약 공지를 하루 세 번 모아, 같은 단지·같은 분야의 직전 낙찰과 수의계약 금액을 공고마다 붙입니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">예측 구조</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">K-apt 결과에는 예정가격이 없어 투찰률 대신 직전 계약 대비 다음 낙찰의 변화율을 분야·낙찰방법별로 모으고, 규모가 비슷했던 계약만으로 가운데값과 구간을 냅니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">정확도 확인</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">지난해까지 자료로 만든 계산을 올해 실제 낙찰에 맞춰 본 결과를 함께 보여 주고, 직전 금액을 그대로 썼을 때와 비교합니다.</p>
          </div>
        </div>
      </section>
    </>
  );
}
