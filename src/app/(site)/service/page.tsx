import type { Metadata } from "next";
import Link from "next/link";
import { DeskArt } from "@/components/art/Desk";
import { EmailPreview } from "@/components/EmailPreview";
import { PageHero } from "@/components/PageHero";
import { buildDigest } from "@/lib/digest";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";

export const metadata: Metadata = { title: "서비스 소개" };
export const revalidate = 600;

const STEPS = [
  { t: "수집", d: "매일 세 번, 공공데이터포털의 나라장터 전 업종 입찰공고를 수집합니다.", items: ["입찰공고정보서비스", "사전규격정보서비스"] },
  { t: "분류", d: "용역·공사·물품 전 공고를 공고명과 투찰가능업종으로 21개 업종에 나눕니다.", items: ["청소·시설관리", "건축·전기·통신 공사", "IT·설계·연구 용역", "의료·급식 물품"] },
  { t: "1차 선별", d: "고객사별 면허·참가가능지역·수행 가능 규모로 참가 불가 공고를 제외합니다.", items: ["면허제한", "지역제한", "금액 범위", "중소기업 제한"] },
  { t: "알고리즘 채점", d: "6개 항목 가중치(면허 30·지역 20·규모 15·경쟁 15·실적 10·기간 10)로 100점 만점 점수와 S·A·B·C 등급을 매깁니다.", items: ["경쟁 강도", "실적 대비 규모", "준비 기간", "투찰 금액 범위"] },
  { t: "전달", d: "영업일 오전 7시 요약 메일, 매주 월요일 분석보고서로 전달합니다.", items: ["일일 요약 메일", "주간 보고서", "매니저 상담"] },
];

export default async function ServicePage() {
  const bids = await getBids();
  const digest = buildDigest(SEED_CLIENTS[0], bids);
  return (
    <>
      <PageHero
        eyebrow="서비스 소개"
        title={<>앱을 파는 게 아니라,<br />입찰 업무를 대신합니다.</>}
        lead="입찰메이트LAB은 검색 도구가 아닙니다. 고객사가 공고를 찾고 검토하는 시간을 통째로 가져와, 결정에 필요한 정보만 정리해 드리는 대행 서비스입니다."
        art={<DeskArt className="w-full" />}
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/apply" className="btn-mint">무료 진단 받기</Link>
          <Link href="/report/sample" className="btn-ghost">주간 보고서 샘플</Link>
        </div>
      </PageHero>

      <section className="container-x pt-20">
        <p className="eyebrow">매일 새벽부터 아침 7시까지</p>
        <h2 className="h-section mt-3">공고 한 건이 메일이 되기까지</h2>
        <ol className="mt-10 grid gap-4 lg:grid-cols-5">
          {STEPS.map(({ t, d, items }, i) => (
            <li key={t} className="card relative flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold tabular-nums text-mint-600">0{i + 1}</span>
              </div>
              <p className="mt-5 text-xl font-bold">{t}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{d}</p>
              <div className="mt-5 flex flex-wrap gap-1">
                {items.map((x) => <span key={x} className="chip bg-paper">{x}</span>)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-x grid items-start gap-12 overflow-x-clip py-24 lg:grid-cols-2">
        <div className="lg:sticky lg:top-24">
          <p className="eyebrow">매일 받는 것</p>
          <h2 className="h-section mt-3">영업일 아침 7시,<br />오늘 볼 공고만.</h2>
          <ul className="mt-8 space-y-3">
            {[
              ["신규 적합 공고 수", "와 3일 내 마감 공고를 한눈에"],
              ["공고별 가능성 등급", ", 규모, 지역제한, 계약방법 요약"],
              ["제외한 공고 수", "까지 투명하게 표시"],
              ["참가조건·서류 체크리스트", " 페이지로 바로 연결"],
            ].map(([b, r], i) => (
              <li key={b} className="flex items-center gap-4 rounded-2xl bg-paper p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-mint-600 shadow-card">{i + 1}</span>
                <span className="text-ink-500"><b className="text-ink">{b}</b>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-mint-100 via-white to-sky-100 opacity-80 blur-2xl" />
          <div className="relative"><EmailPreview digest={digest} /></div>
        </div>
      </section>
    </>
  );
}
