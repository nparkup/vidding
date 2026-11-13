import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import { ScorePredictor } from "@/components/premium/ScorePredictor";

export const metadata: Metadata = {
  title: "평가점수 예측",
  description: "공고 첨부파일의 평가기준과 나라장터 기업 정보로 적격심사·협상계약 예상 점수를 계산합니다.",
};

const FLOW = [
  { t: "첨부파일 판독", d: "공고서·규격서·제안요청서에서 평가항목, 배점, 통과 기준, 가격 평가식을 읽어 공고별 평가표를 만듭니다." },
  { t: "기업 정보 결합", d: "사업자번호 하나로 국세청 사업자 상태, 나라장터 조달업체 등록 정보, 금융위원회 기업·재무 정보를 불러오고 신용평가등급확인서, 실적증명과 함께 평가항목에 연결합니다." },
  { t: "항목별 채점", d: "실적은 기초금액 대비 비율, 신용은 사업 규모별 등급 구간, 가격은 공고의 평가식으로 각각 계산합니다." },
  { t: "통과선 역산", d: "적격심사는 통과 가능한 투찰률 범위를, 협상계약은 협상적격자 기준까지 남은 기술점수를 보여 드립니다." },
];

export default function PremiumPage() {
  return (
    <>
      <PageHero
        eyebrow="프리미엄 · 평가점수 예측"
        title={<>공고를 고르면,<br />우리 회사 점수가 나옵니다.</>}
        lead="입찰공고에 첨부된 공고서·규격서에서 평가기준과 배점을 추출하고, 나라장터에 등록된 기업 정보와 신용평가 서류를 결합해 이 공고에서 받을 예상 점수와 통과 여부를 계산합니다."
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href="#predict" className="btn-mint">지금 예측해 보기</a>
          <Link href="/apply?plan=partner" className="btn-ghost">파트너 요금제로 맡기기</Link>
        </div>
      </PageHero>

      <section className="container-x pt-12">
        <ol className="grid gap-4 md:grid-cols-4">
          {FLOW.map((f, i) => (
            <li key={f.t} className="card p-6">
              <p className="text-sm font-bold text-mint-600 tabular-nums">0{i + 1}</p>
              <p className="mt-2 text-lg font-bold">{f.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{f.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="predict" className="container-x scroll-mt-20 pt-12">
        <p className="eyebrow">평가점수 예측</p>
        <h2 className="h-section mt-3">공고 하나로 직접 계산해 보세요</h2>
        <p className="lead mt-3 max-w-3xl">공고를 고르면 그 공고의 첨부파일에서 읽어 둔 평가표가 바로 적용됩니다. 기업 정보를 입력하면 오른쪽에 항목별 예상 점수가 계산됩니다.</p>
        <div className="mt-8">
          <Suspense fallback={<p className="card p-6 text-sm text-ink-300">불러오는 중…</p>}>
            <ScorePredictor />
          </Suspense>
        </div>
      </section>

      <section className="container-x pt-12">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-7">
            <p className="text-lg font-bold">읽는 서류</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">나라장터에 올라온 입찰공고서, 과업지시서·규격서, 제안요청서, 적격심사 세부기준을 하루 세 번 수집해 PDF·HWPX에서 평가표를 읽습니다. 신용평가등급확인서는 고객이 올려 등급을 읽습니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">평가 구조</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">용역·물품 적격심사(85점 통과), 공사 적격심사(92점 통과), 협상에 의한 계약(기술점수 85% 협상적격) 구조를 기본으로 두고, 공고 원문 배점이 있으면 원문을 우선합니다.</p>
          </div>
          <div className="card p-7">
            <p className="text-lg font-bold">파트너 고객에게는</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">관심 공고마다 담당 매니저가 첨부 전체를 판독해 평가표를 검수하고, 예상 점수와 보완할 서류, 통과 가능한 투찰률 범위를 보고서로 전달합니다.</p>
          </div>
        </div>
      </section>
    </>
  );
}
