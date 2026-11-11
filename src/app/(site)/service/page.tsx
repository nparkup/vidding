import type { Metadata } from "next";
import Link from "next/link";
import { EmailPreview } from "@/components/EmailPreview";
import { buildDigest } from "@/lib/digest";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";

export const metadata: Metadata = { title: "서비스 소개" };
export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", t: "수집", d: "매일 새벽, 공공데이터포털의 나라장터 입찰공고·사전규격 데이터를 수집합니다.", items: ["입찰공고정보서비스", "사전규격정보서비스"] },
  { n: "02", t: "분류", d: "공고명·업종코드로 청소·시설관리·경비·방역 공고만 분류합니다.", items: ["청소/미화", "시설·설비 유지관리", "경비·주차", "방역·소독"] },
  { n: "03", t: "1차 선별", d: "고객사별 면허·참가가능지역·수행 가능 규모로 참가 불가 공고를 제외합니다.", items: ["면허제한", "지역제한", "금액 범위", "중소기업 제한"] },
  { n: "04", t: "분석", d: "참가조건과 마감일, 제출서류를 정리하고 입찰 가능성 점수를 매깁니다.", items: ["경쟁 강도", "실적 대비 규모", "준비 기간", "낙찰하한율"] },
  { n: "05", t: "전달", d: "영업일 오전 7시 요약 메일, 매주 월요일 분석보고서로 전달합니다.", items: ["일일 요약 메일", "주간 보고서", "매니저 상담"] },
];

export default async function ServicePage() {
  const bids = await getBids();
  const digest = buildDigest(SEED_CLIENTS[0], bids);
  return (
    <>
      <section className="container-x py-14 sm:py-20">
        <p className="eyebrow">서비스 소개</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">앱을 파는 게 아니라,<br />입찰 업무를 대신합니다.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-500">
          입찰파트너는 검색 도구가 아닙니다. 고객사가 공고를 찾고 검토하는 시간을 통째로 가져와, 결정에 필요한 정보만 정리해 드리는 대행 서비스입니다.
        </p>
      </section>

      <section className="container-x">
        <ol className="grid gap-4 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="card flex flex-col p-5">
              <span className="text-sm font-bold text-mint-600">{s.n}</span>
              <p className="mt-2 text-xl font-bold">{s.t}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{s.d}</p>
              <div className="mt-4 flex flex-wrap gap-1">
                {s.items.map((i) => <span key={i} className="chip">{i}</span>)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-x grid items-start gap-12 py-20 lg:grid-cols-2">
        <div className="lg:sticky lg:top-24">
          <p className="eyebrow">매일 받는 것</p>
          <h2 className="h-section mt-2">영업일 아침 7시,<br />오늘 볼 공고만.</h2>
          <ul className="mt-6 space-y-4 text-ink-500">
            <li><b className="text-ink">신규 적합 공고 수</b>와 3일 내 마감 공고를 한눈에</li>
            <li><b className="text-ink">공고별 가능성 등급</b>, 규모, 지역제한, 계약방법 요약</li>
            <li>조건이 안 맞아 <b className="text-ink">제외한 공고 수</b>까지 투명하게 표시</li>
            <li>공고를 누르면 <b className="text-ink">참가조건·서류 체크리스트</b> 페이지로 연결</li>
          </ul>
          <div className="mt-8 flex gap-3">
            <Link href="/report/sample" className="btn-ghost">주간 보고서 샘플</Link>
            <Link href="/apply" className="btn-mint">무료 진단</Link>
          </div>
        </div>
        <EmailPreview digest={digest} />
      </section>
    </>
  );
}
