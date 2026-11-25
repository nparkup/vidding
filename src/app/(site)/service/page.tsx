import type { Metadata } from "next";
import Link from "next/link";
import { DeskArt } from "@/components/art/Desk";
import { EmailPreview } from "@/components/EmailPreview";
import { PageHero } from "@/components/PageHero";
import { TrialN } from "@/components/Cfg";
import { PricingCards } from "@/components/PricingCards";
import { HeroStats } from "@/components/home/HeroStats";
import { EngineName } from "@/components/EngineName";
import { ENGINES, type EngineId } from "@/lib/engines";
import { buildDigest } from "@/lib/digest";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getAptBids, getAwardCount, getBids, getContracts, getNoticeChanges, getNuriBids, getOrderPlans, getPreSpecs, getRecentAwards } from "@/lib/store";

export const metadata: Metadata = { title: "서비스 소개" };
export const revalidate = 600;

/** 공고 한 건을 보는 순서. 각 단계는 실제로 있는 기능만 적는다 */
const FLOW = [
  { t: "수집", e: ["finder"] as EngineId[], d: "영업일 하루 세 번 나라장터·공동주택(K-apt)·누리장터 공고를 새로 받고, 10년간의 낙찰 기록을 함께 쌓습니다.", items: ["입찰공고", "낙찰·개찰 결과", "발주계획·사전규격", "계약 정보"] },
  { t: "판정", e: ["finder"] as EngineId[], d: "업종·지역 제한, 입찰방식, 참가자격을 읽어 귀사가 참가할 수 있는 공고인지 먼저 가립니다.", items: ["업종·면허", "지역제한", "입찰방식", "중소기업 제한"] },
  { t: "분석", e: ["atlas", "insight"] as EngineId[], d: "공고 첨부파일을 모두 읽어 배점표를 찾고, 항목별 예상 평가점수와 낙찰 결과로 본 예측을 냅니다.", items: ["배점표 판독", "예상 평가점수", "직전 낙찰", "예상 예정가격"] },
  { t: "알림", e: ["finder"] as EngineId[], d: "조건에 맞는 공고는 영업일 아침 메일로, 정정·취소와 관심 키워드 공고는 따로 알려 드립니다.", items: ["맞춤 공고 메일", "정정·취소 알림", "키워드 알림"] },
];

/** 평가점수 예측 한 건에 들어 있는 것 */
const PREDICT = [
  { t: "배점표 판독", d: "공고서와 첨부파일을 모두 읽어 평가 항목과 배점을 공고 표 그대로 옮깁니다. 같은 이름의 첨부는 한 번만 읽습니다." },
  { t: "항목별 예상 평가점수", d: "실적·신용평가·신뢰도 가감점(신인도)을 공고별 기준표로 계산하고, 항목마다 어떤 자료로 계산했는지 출처를 보여 드립니다." },
  { t: "이 공고의 직전 낙찰", d: "같은 수요기관의 같은 사업 중 가장 최근 낙찰을 찾아 낙찰 기업과 낙찰금액을 원 단위로 보여 드립니다." },
  { t: "예상 예정가격과 투찰 금액", d: "기초금액과 발주처 사정율로 예상 예정가격을 내고, 낙찰하한율 기준 투찰 금액과 과거 낙찰률을 금액과 함께 보여 드립니다." },
  { t: "참가 예상 기업", d: "비슷한 공고의 개찰 순위로 경쟁 강도와 함께 들어올 만한 기업, 업무별 낙찰 기업을 정리합니다." },
  { t: "공동주택 입찰공고 예측", d: "아파트 청소·경비·위탁관리 공고는 같은 단지의 직전 낙찰·수의계약 금액으로 예상 낙찰금액을 냅니다." },
];

const PRINCIPLES = [
  { t: "공공데이터 원본 그대로", d: "조달청 나라장터, 국토교통부 공동주택관리정보시스템(K-apt), 누리장터가 공공데이터포털로 공개하는 공고·낙찰 데이터를 받아 씁니다." },
  { t: "공고 표가 기준입니다", d: "배점과 참가자격은 공고서에 적힌 기준을 먼저 따르고, 공고에 없는 값만 조달청 기준표로 채웁니다. 추정한 값은 추정이라고 표시합니다." },
  { t: "결정과 투찰은 귀사가 직접", d: "비드매트릭스는 분석 정보 서비스입니다. 판단에 필요한 숫자를 정리해 드리고, 참가 여부와 투찰은 귀사가 정합니다." },
  { t: "필요한 정보만 받습니다", d: "사업자번호와 업종·지역 조건만으로 시작합니다. 공동인증서나 나라장터 비밀번호는 받지 않습니다." },
];

export default async function ServicePage() {
  const builtAt = Date.now();
  const [bids, apt, nuri, plans, preSpecs, contracts, changes, recent] = await Promise.all([
    getBids(), getAptBids(), getNuriBids(), getOrderPlans(), getPreSpecs(), getContracts(), getNoticeChanges(), getRecentAwards(),
  ]);
  const open = (closeAt: string) => new Date(closeAt).getTime() > builtAt;
  const awardCount = getAwardCount();
  // 메인 현황 줄과 같은 셈: 공동주택 입찰공고 중 나라장터와 번호가 겹치는 것은 한 번만, 아파트 낙찰에는 수의계약 포함
  const aptNotices = Math.max(0, (awardCount?.aptNotices ?? 0) - (awardCount?.aptDup ?? 0));
  const aptAwards = (awardCount?.aptAwards ?? apt.awards ?? 0) + (apt.privates ?? 0);
  const digest = buildDigest(SEED_CLIENTS[0], bids, new Date(), [], changes);

  const GROUPS: { engine: EngineId; lead: string; items: { t: string; d: string; href: string; n?: number; unit?: string }[] }[] = [
    {
      engine: "finder",
      lead: "청소·경비 용역부터 전기·통신 공사, 소프트웨어 유지관리, 급식 식자재, 의료 물품까지 전 업종 공고를 한 곳에서 찾습니다.",
      items: [
        { t: "나라장터 공고", d: "나라장터 용역·공사·물품 공고를 업종·지역·금액·마감일로 거르고, 귀사 조건 적합도순으로 정렬합니다.", href: "/bids", n: bids.filter((b) => open(b.closeAt)).length, unit: "마감 전" },
        { t: "공동주택 입찰공고", d: "아파트 청소·경비·위탁관리·공사 입찰을 같은 단지의 직전 낙찰금액과 함께 봅니다.", href: "/apt-bids", n: apt.items.filter((b) => open(b.closeAt)).length, unit: "마감 전" },
        { t: "누리장터 공고", d: "누리장터에 올라온 민간 기업·조합·법인 입찰과 평가 배점표를 봅니다.", href: "/nuri-bids", n: nuri.items.filter((b) => open(b.closeAt)).length, unit: "마감 전" },
        { t: "정정·취소 공고", d: "바뀐 마감일·개찰일·금액을 이전 공고와 비교해 바뀐 항목만 보여 드립니다.", href: "/changes", n: changes.length, unit: "최근 2주" },
        { t: "발주계획", d: "기관이 미리 올린 발주 예정 사업을 업종별로 모아 봅니다.", href: "/plans", n: plans.length, unit: "발주 예정" },
      ],
    },
    {
      engine: "atlas",
      lead: "10년간의 낙찰 기록과 사전규격·계약 정보로 발주처와 경쟁사의 흐름을 봅니다.",
      items: [
        { t: "최근 낙찰 결과", d: "최근 한 달 최종낙찰 업체와 개찰 순위, 사정율, 낙찰금액을 봅니다.", href: "/awards", n: recent?.rows.length, unit: "최근 한 달" },
        { t: "발주처 분석", d: "수요기관별 낙찰률·사정율 분포와 자주 낙찰받은 업체, 지금 올라온 공고를 봅니다.", href: "/analysis/agency" },
        { t: "업종별 분석", d: "업종별 낙찰률 추이와 주요 발주기관·낙찰업체를 확인합니다.", href: "/analysis/industry" },
        { t: "경쟁사 투찰 성향", d: "기업명이나 사업자번호로 경쟁사가 주로 쓰는 사정율 구간과 주요 발주처를 확인합니다.", href: "/analysis/rival" },
        { t: "우리 회사 진단", d: "우리 회사 낙찰 기록을 발주처·지역·금액별로 나누고 투찰 습관을 점검합니다.", href: "/analysis/mine" },
        { t: "사전규격 미리보기", d: "본공고 전에 공개된 규격으로 준비 기간을 먼저 확보합니다.", href: "/prespecs", n: preSpecs.length, unit: "최근 2주" },
        { t: "계약현황", d: "최근 2주 계약업체·계약금액·계약기간을 발주처별로 봅니다.", href: "/contracts", n: contracts.length, unit: "최근 2주" },
      ],
    },
    {
      engine: "insight",
      lead: "공고 하나를 고르면 배점표 판독부터 예상 평가점수, 낙찰 결과로 본 예측까지 한 화면에 정리합니다.",
      items: [
        { t: "나라장터 입찰 예측", d: "적격심사·협상계약 공고의 항목별 예상 평가점수, 이 공고의 직전 낙찰, 예상 예정가격을 봅니다.", href: "/premium" },
        { t: "공동주택 입찰 예측", d: "아파트 관리 입찰의 예상 낙찰금액과 같은 단지 낙찰 이력, 응찰 업체를 봅니다.", href: "/premium/apt" },
      ],
    },
  ];

  return (
    <>
      <PageHero
        title={<>공고마다 데이터로 분석하고,<br /><span className="text-mint-600">결정은 대표님과 실무자가!</span></>}
        lead="비드매트릭스는 입찰공고와 낙찰정보를 빅데이터로 분석하는 입찰 분석 정보 서비스입니다. 공고를 찾는 비드파인더, 입찰을 분석하는 비드아틀라스, 평가점수를 예측하는 비드인사이트 세 엔진으로 참가 여부와 투찰 금액을 정하는 데 필요한 정보를 드립니다."
        art={<DeskArt className="w-full" />}
      >
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/apply" className="btn-mint">무료 체험</Link>
          <Link href="/pricing" className="btn-ghost">요금제 보기</Link>
        </div>
      </PageHero>

      <section className="container-x pt-14">
        <p className="text-center text-sm font-semibold text-ink-500">나라장터 2016년부터, 공동주택 2013년부터 쌓은 데이터로 분석합니다</p>
        <HeroStats builtAt={builtAt} notices={awardCount?.notices ?? null} aptNotices={aptNotices} awards={awardCount?.rows ?? null} aptAwards={aptAwards} />
      </section>

      <section className="container-x pt-20">
        <h2 className="h-section">세 엔진이 공고 한 건을<br className="sm:hidden" /> 이렇게 분석합니다.</h2>
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map(({ t, e, d, items }, i) => (
            <li key={t} className="card flex min-w-0 flex-col p-6">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-extrabold">
                <span className="tabular-nums text-mint-600">0{i + 1}</span>
                {e.map((id) => <EngineName key={id} id={id} className="text-ink-700" />)}
              </p>
              <p className="mt-4 text-xl font-bold">{t}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{d}</p>
              <div className="mt-5 flex flex-wrap gap-1">
                {items.map((x) => <span key={x} className="chip bg-paper">{x}</span>)}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {GROUPS.map((g) => (
        <section key={g.engine} className="container-x pt-20">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="h-section"><EngineName id={g.engine} /></h2>
              <p className="mt-2 text-lg font-bold text-ink-700">{ENGINES[g.engine].area} · {ENGINES[g.engine].tagline}</p>
            </div>
            <p className="max-w-md text-ink-500">{g.lead}</p>
          </div>
          <div className={`mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 ${g.items.length === 5 ? "lg:grid-cols-5" : g.items.length > 2 ? "lg:grid-cols-4" : ""}`}>
            {g.items.map((a) => (
              <Link key={a.href} href={a.href} className="card group flex min-w-0 flex-col p-5 transition hover:border-mint hover:shadow-lift">
                <p className="text-lg font-bold group-hover:text-mint-600">{a.t}</p>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500">{a.d}</p>
                {a.n !== undefined && a.n > 0 && <p className="mt-4 text-sm text-ink-400">{a.unit} <b className="tabular-nums text-ink">{a.n.toLocaleString("ko-KR")}</b>건</p>}
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="container-x pt-24">
        <div className="rounded-[28px] bg-paper p-6 sm:rounded-[36px] sm:p-10 lg:p-14">
          <h2 className="h-section">배점표부터 예상 예정가격까지<br className="hidden sm:block" /> 한 화면에.</h2>
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PREDICT.map(({ t, d }, i) => (
              <div key={t} className="min-w-0 rounded-2xl bg-white p-6 shadow-card">
                <span className="text-sm font-extrabold tabular-nums text-mint-600">0{i + 1}</span>
                <p className="mt-3 text-lg font-bold">{t}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{d}</p>
              </div>
            ))}
          </div>
          <Link href="/premium" className="btn-mint mt-8">비드인사이트로 평가점수 예측하기</Link>
        </div>
      </section>

      <section className="container-x grid grid-cols-1 items-center gap-12 overflow-x-clip py-24 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 className="h-section">영업일 아침,<br />오늘 볼 공고만 메일로.</h2>
          <ul className="mt-8 space-y-3">
            {[
              ["맞춤 공고", " 등록한 업종·지역·금액 조건에 맞는 새 공고와 마감 임박 공고"],
              ["정정·취소", " 관심 공고와 추천 공고의 마감일·개찰일·금액이 바뀌면 바뀐 항목만"],
              ["관심 키워드", " 등록한 낱말이 들어간 공고 (제외어 지정 가능)"],
            ].map(([b, r], i) => (
              <li key={b} className="flex items-center gap-4 rounded-2xl bg-paper p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold text-mint-600 shadow-card">{i + 1}</span>
                <span className="min-w-0 text-ink-500"><b className="block text-ink sm:inline">{b}</b><span className="hidden sm:inline"> · </span>{r.trim()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative min-w-0">
          <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-mint-100 via-white to-sky-100 opacity-80 blur-2xl" />
          <div className="relative"><EmailPreview digest={digest} /></div>
        </div>
      </section>

      <section className="container-x">
        <h2 className="h-section">숫자와 근거는 드리고,<br className="sm:hidden" /> 결정은 귀사가.</h2>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map(({ t, d }) => (
            <div key={t} className="card min-w-0 p-6">
              <p className="text-lg font-bold">{t}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x py-24">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="h-section">입찰공고 <TrialN />건은<br className="sm:hidden" /> 무료로 먼저 써 보세요.</h2>
          </div>
          <p className="max-w-md text-ink-500">모든 기능은 같고, 한 달에 쓸 수 있는 공고 예측 건수만 다릅니다. 금액은 VAT 포함이며 약정이 없습니다. <Link href="/pricing" className="font-semibold text-mint-600 underline-offset-2 hover:underline">요금제 자세히 보기</Link></p>
        </div>
        <div className="mt-10"><PricingCards /></div>
      </section>
    </>
  );
}
