import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmailPreview } from "@/components/EmailPreview";
import { TrialN } from "@/components/Cfg";
import { HeroStats } from "@/components/home/HeroStats";
import { EngineName } from "@/components/EngineName";
import { BidRow } from "@/components/BidRow";
import { StepBar } from "@/components/premium/PredictSummary";
import { ENGINES, ENGINE_LIST, type EngineId } from "@/lib/engines";
import { buildDigest } from "@/lib/digest";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import type { Bid } from "@/lib/types";
import { getAptBids, getAwardCount, getBids, getContracts, getNoticeChanges, getNuriBids, getOrderPlans, getPreSpecs, getRecentAwards } from "@/lib/store";

export const metadata: Metadata = { title: "서비스 소개" };
export const revalidate = 600;

/** 영업일 하루. 시각은 실제 수집 일정(.github/workflows awards.yml·pages.yml)과 같다 */
const DAY = [
  { at: "05:10", t: "낙찰 기록 더하기", d: "전날까지 나온 낙찰·개찰 결과를 10년치 낙찰 기록에 더합니다. 주말에도 돕니다." },
  { at: "06:40", t: "첫 공고 수집", d: "나라장터·공동주택·누리장터 공고를 새로 받고, 정정·취소 공고는 이전 차수와 비교합니다." },
  { at: "아침", t: "맞춤 공고 메일", d: "등록한 업종·지역·금액 조건에 맞는 새 공고와 마감 임박 공고를 메일로 받습니다." },
  { at: "11:40", t: "두 번째 수집", d: "오전에 올라온 공고와 바뀐 공고를 다시 받아 목록과 분석에 반영합니다." },
  { at: "16:40", t: "세 번째 수집", d: "오후 공고까지 받아 다음 날 아침 메일에 담을 공고를 준비합니다." },
];

/** 공고를 받아 오는 곳 */
const SOURCES: { name: string; org: string; what: string[]; since: string; href: string; key: "nara" | "apt" | "nuri" }[] = [
  { key: "nara", name: "나라장터", org: "조달청", what: ["용역·공사·물품 입찰공고", "낙찰·개찰 순위", "사전규격·발주계획·계약"], since: "낙찰 기록 2016년부터", href: "/bids" },
  { key: "apt", name: "K-apt 공동주택", org: "국토교통부 공동주택관리정보시스템", what: ["아파트 청소·경비·위탁관리·공사 입찰", "낙찰·수의계약 금액", "응찰 업체"], since: "공고·낙찰 2013년부터", href: "/apt-bids" },
  { key: "nuri", name: "누리장터", org: "조달청 누리장터", what: ["민간 기업·조합·법인 입찰", "개찰 결과·계약", "첨부 평가 배점표"], since: "최근 공고와 개찰 결과", href: "/nuri-bids" },
];

/** 비드파인더가 공고마다 먼저 가리는 것 */
const JUDGE = [
  { t: "업종·면허", d: "공고의 업종 제한을 귀사 면허와 맞춰 보고, 조달청 기준상 포함되는 업종도 인정합니다." },
  { t: "지역제한", d: "참가 가능 지역을 읽어 귀사 소재지로 참가할 수 있는지 봅니다." },
  { t: "입찰방식", d: "수의시담·지명경쟁처럼 누구나 참가할 수 없는 공고는 따로 표시합니다." },
  { t: "금액·규모", d: "기초금액과 중소기업 제한을 귀사 규모 조건과 맞춰 봅니다." },
];

/** 비드아틀라스가 공고 한 건을 둘러싸고 보는 자료 */
const ATLAS_MAP: { t: string; d: string; href: string }[] = [
  { t: "발주처", d: "낙찰률·사정율 분포, 자주 낙찰받은 업체", href: "/analysis/agency" },
  { t: "업종", d: "낙찰률 추이, 주요 발주기관·낙찰업체", href: "/analysis/industry" },
  { t: "경쟁사", d: "자주 쓰는 사정율 구간, 주요 발주처", href: "/analysis/rival" },
  { t: "우리 회사", d: "발주처·지역·금액별 낙찰, 투찰 습관", href: "/analysis/mine" },
  { t: "사전규격", d: "본공고 전에 공개된 규격", href: "/prespecs" },
  { t: "계약", d: "계약업체·계약금액·계약기간", href: "/contracts" },
];

/** 비드인사이트 결과 화면에 위에서부터 나오는 것 */
const INSIGHT_RESULT = [
  { t: "배점표 판독", d: "공고서와 첨부파일을 모두 읽어 평가 항목과 배점을 공고 표 그대로 옮깁니다." },
  { t: "항목별 예상 평가점수", d: "실적·신용평가·신뢰도 가감점(신인도)을 공고별 기준표로 계산하고 항목마다 출처를 붙입니다." },
  { t: "이 공고의 직전 낙찰", d: "같은 수요기관의 같은 사업 중 가장 최근 낙찰 기업과 낙찰금액입니다." },
  { t: "예상 예정가격과 투찰 금액", d: "기초금액과 발주처 사정율로 예정가격을 내고, 낙찰하한율 기준 투찰 금액을 원 단위로 보여 드립니다." },
  { t: "참가 예상 기업", d: "비슷한 공고의 개찰 순위로 경쟁 강도와 함께 들어올 만한 기업을 정리합니다." },
];

const PRINCIPLES = [
  { t: "공공데이터 원본 그대로", d: "조달청 나라장터, 국토교통부 공동주택관리정보시스템(K-apt), 누리장터가 공공데이터포털로 공개하는 공고·낙찰 데이터를 받아 씁니다." },
  { t: "공고 표가 기준입니다", d: "배점과 참가자격은 공고서에 적힌 기준을 먼저 따르고, 공고에 없는 값만 조달청 기준표로 채웁니다. 추정한 값은 추정이라고 표시합니다." },
  { t: "결정과 투찰은 귀사가 직접", d: "비드매트릭스는 분석 정보 서비스입니다. 판단에 필요한 숫자와 근거를 정리해 드리고, 참가 여부와 투찰은 귀사가 정합니다." },
  { t: "필요한 정보만 받습니다", d: "사업자번호와 업종·지역 조건만으로 시작합니다. 공동인증서나 나라장터 비밀번호는 받지 않습니다." },
];

type Menu = { t: string; d: string; href: string; n?: number; unit?: string };

/** 업무 구분마다 마감 전 공고 한 건씩 (예시가 한 업종에 몰리지 않게) */
function varied(bids: Bid[], open: (closeAt: string) => boolean): Bid[] {
  const out: Bid[] = [];
  for (const biz of ["용역", "공사", "물품"]) {
    const b = bids.find((x) => (x.bizType ?? "용역") === biz && open(x.closeAt) && !out.includes(x));
    if (b) out.push(b);
  }
  return out;
}

function count(n: number | undefined, unit?: string) {
  if (!(n && n > 0)) return null;
  return <span className="shrink-0 text-xs text-ink-400">{unit} <b className="tabular-nums text-ink">{n.toLocaleString("ko-KR")}</b>건</span>;
}

/** 엔진 소개 한 묶음: 왼쪽 설명과 메뉴, 오른쪽 화면 예시 (짝수 번째는 좌우를 바꾼다) */
function EngineBlock({ id, flip, lead, menus, children }: { id: EngineId; flip?: boolean; lead: string; menus: Menu[]; children: ReactNode }) {
  const e = ENGINES[id];
  return (
    <section id={id} className="container-x scroll-mt-24 pt-24">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-14">
        <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
          <h2 className="h-section"><EngineName id={id} /></h2>
          <p className="mt-3 text-xl font-bold text-ink-700">{e.area} · {e.tagline}</p>
          <p className="mt-4 leading-relaxed text-ink-500">{lead}</p>
          <ul className="mt-8 divide-y divide-ink-100 border-y border-ink-100">
            {menus.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="group flex min-w-0 items-start justify-between gap-4 py-4">
                  <span className="min-w-0">
                    <span className="block font-bold group-hover:text-mint-600">{m.t}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">{m.d}</span>
                  </span>
                  {count(m.n, m.unit)}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={e.href} className="btn-mint mt-8">{e.cta}</Link>
        </div>
        <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>{children}</div>
      </div>
    </section>
  );
}

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
  const openN = {
    nara: bids.filter((b) => open(b.closeAt)).length,
    apt: apt.items.filter((b) => open(b.closeAt)).length,
    nuri: nuri.items.filter((b) => open(b.closeAt)).length,
  };
  const examples = varied(bids, open);

  return (
    <>
      {/* 머리말: 어두운 판 위에 제목과 세 엔진 바로가기 */}
      <section className="px-2 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-950 text-white sm:rounded-[36px]">
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-mint/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-sky/10 blur-3xl" />
          <div className="container-x relative py-16 sm:py-24">
            <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-[-0.04em] sm:text-[56px]">
              공고를 찾고, 흐름을 읽고,<br /><span className="text-mint-400">점수를 미리 계산합니다.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
              비드매트릭스는 나라장터·K-apt 공동주택·누리장터 공고와 10년간의 낙찰 기록을 분석하는 입찰 분석 정보 서비스입니다. 참가 여부와 투찰 금액을 정하는 데 필요한 숫자와 근거를 공고마다 정리해 드립니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-mint">무료 체험</Link>
              <Link href="/pricing" className="btn border border-white/20 bg-white/5 text-white hover:border-white/40">요금제 보기</Link>
            </div>
            <ol className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ENGINE_LIST.map((e, i) => (
                <li key={e.id} className="min-w-0">
                  <a href={`#${e.id}`} className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-mint-400/60 hover:bg-white/[0.07]">
                    <span className="text-sm font-extrabold tabular-nums text-ink-400">0{i + 1}</span>
                    <span className="mt-2 text-2xl font-extrabold tracking-[-0.03em]"><EngineName id={e.id} dark /></span>
                    <span className="mt-1 text-sm font-semibold text-ink-200">{e.area}</span>
                    <span className="mt-3 flex-1 text-sm leading-relaxed text-ink-300">{e.tagline}</span>
                    <span className="mt-4 text-sm font-semibold text-mint-400 underline-offset-4 group-hover:underline">자세히 보기</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 데이터: 세 곳의 공고와 누적 숫자 */}
      <section className="container-x pt-20">
        <h2 className="h-section">세 곳의 공고와<br className="sm:hidden" /> 10년간의 낙찰 기록을<br />한곳에서 봅니다.</h2>
        <div className="mt-10 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {SOURCES.map((s) => (
            <Link key={s.key} href={s.href} className="card group flex min-w-0 flex-col p-6 transition hover:border-mint hover:shadow-lift">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xl font-extrabold group-hover:text-mint-600">{s.name}</p>
                {count(openN[s.key], "마감 전")}
              </div>
              <p className="mt-1 text-sm text-ink-400">{s.org}</p>
              <ul className="mt-5 flex-1 space-y-2 border-t border-ink-100 pt-5 text-sm text-ink-700">
                {s.what.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <p className="mt-5 text-sm font-semibold text-mint-700">{s.since}</p>
            </Link>
          ))}
        </div>
        <HeroStats builtAt={builtAt} notices={awardCount?.notices ?? null} aptNotices={aptNotices} awards={awardCount?.rows ?? null} aptAwards={aptAwards} />
      </section>

      {/* 영업일 하루 */}
      <section className="container-x pt-24">
        <div className="rounded-[28px] bg-paper p-6 sm:rounded-[36px] sm:p-10 lg:p-14">
          <h2 className="h-section">영업일 하루,<br className="sm:hidden" /> 이렇게 움직입니다.</h2>
          <p className="mt-4 max-w-2xl text-ink-500">공고는 영업일마다 세 번 새로 받습니다. 정정·취소 공고와 관심 키워드 공고는 받을 때마다 다시 확인합니다.</p>
          <ol className="relative mt-10 grid grid-cols-1 gap-3 lg:grid-cols-5">
            {DAY.map((x) => (
              <li key={x.at} className={`min-w-0 rounded-2xl p-5 ${x.at === "아침" ? "bg-mint-600 text-white" : "bg-white shadow-card"}`}>
                <p className={`text-2xl font-extrabold tabular-nums tracking-[-0.02em] ${x.at === "아침" ? "text-white" : "text-mint-600"}`}>{x.at}</p>
                <p className="mt-3 font-bold">{x.t}</p>
                <p className={`mt-1.5 text-sm leading-relaxed ${x.at === "아침" ? "text-mint-50" : "text-ink-500"}`}>{x.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <EngineBlock
        id="finder"
        lead="청소·경비 용역부터 전기·통신 공사, 소프트웨어 유지관리, 급식 식자재, 의료 물품까지 전 업종 공고를 받아, 귀사가 참가할 수 있는 공고인지 먼저 가린 뒤 보여 드립니다."
        menus={[
          { t: "나라장터 공고", d: "업종·지역·금액·마감일로 거르고 귀사 조건 적합도순으로 정렬합니다.", href: "/bids", n: openN.nara, unit: "마감 전" },
          { t: "공동주택 입찰공고", d: "아파트 입찰을 같은 단지의 직전 낙찰금액과 함께 봅니다.", href: "/apt-bids", n: openN.apt, unit: "마감 전" },
          { t: "누리장터 공고", d: "민간 기업·조합·법인 입찰과 첨부 평가 배점표를 봅니다.", href: "/nuri-bids", n: openN.nuri, unit: "마감 전" },
          { t: "정정·취소 공고", d: "바뀐 마감일·개찰일·금액을 이전 공고와 비교해 바뀐 항목만 보여 드립니다.", href: "/changes", n: changes.length, unit: "최근 2주" },
          { t: "발주계획", d: "기관이 미리 올린 발주 예정 사업을 업종별로 모아 봅니다.", href: "/plans", n: plans.length, unit: "발주 예정" },
        ]}
      >
        <div className="rounded-[28px] bg-paper p-5 sm:p-8">
          <p className="font-bold">공고마다 먼저 가리는 네 가지</p>
          <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {JUDGE.map((j, i) => (
              <li key={j.t} className="min-w-0 rounded-2xl bg-white p-4 shadow-card">
                <p className="text-sm font-bold"><span className="mr-2 tabular-nums text-mint-600">{i + 1}</span>{j.t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{j.d}</p>
              </li>
            ))}
          </ol>
          {examples.length > 0 && (
            <>
              <p className="mt-8 font-bold">지금 마감 전인 공고 예시</p>
              <div className="mt-3 space-y-2">
                {examples.map((b) => <BidRow key={b.id} bid={b} />)}
              </div>
            </>
          )}
        </div>
      </EngineBlock>

      <EngineBlock
        id="atlas"
        flip
        lead="10년간의 낙찰 기록과 사전규격·계약 정보로, 공고 한 건을 둘러싼 발주처·업종·경쟁사의 흐름을 숫자로 봅니다. 모든 금액은 원 단위 전체로 보여 드립니다."
        menus={[
          { t: "최근 낙찰 결과", d: "최근 한 달 최종낙찰 업체와 개찰 순위, 사정율, 낙찰금액을 봅니다.", href: "/awards", n: recent?.rows.length, unit: "최근 한 달" },
          { t: "발주처 분석", d: "수요기관별 낙찰률·사정율 분포와 자주 낙찰받은 업체를 봅니다.", href: "/analysis/agency" },
          { t: "업종별 분석", d: "기간을 골라 업종별 낙찰률 추이와 주요 발주기관·낙찰업체를 확인합니다.", href: "/analysis/industry" },
          { t: "경쟁사 투찰 성향", d: "기업명이나 사업자번호로 경쟁사가 주로 쓰는 사정율 구간을 확인합니다.", href: "/analysis/rival" },
          { t: "우리 회사 진단", d: "우리 회사 낙찰 기록을 발주처·지역·금액별로 나누고 투찰 습관을 점검합니다.", href: "/analysis/mine" },
          { t: "사전규격 미리보기", d: "본공고 전에 공개된 규격으로 준비 기간을 먼저 확보합니다.", href: "/prespecs", n: preSpecs.length, unit: "최근 2주" },
          { t: "계약현황", d: "최근 2주 계약업체·계약금액·계약기간을 발주처별로 봅니다.", href: "/contracts", n: contracts.length, unit: "최근 2주" },
        ]}
      >
        <div className="rounded-[28px] bg-ink-950 p-5 text-white sm:p-8">
          <p className="font-bold">공고 한 건을 둘러싼 자료</p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ATLAS_MAP.slice(0, 3).map((m) => <AtlasCell key={m.t} {...m} />)}
            <div className="col-span-2 flex min-w-0 flex-col justify-center rounded-2xl bg-mint-600 p-5 sm:col-span-3">
              <p className="text-xs font-semibold text-mint-100">분석할 공고</p>
              <p className="mt-1 text-lg font-extrabold">입찰공고 한 건</p>
              <p className="mt-1 text-sm text-mint-50">수요기관 · 업종 · 기초금액 · 계약방법</p>
            </div>
            {ATLAS_MAP.slice(3).map((m) => <AtlasCell key={m.t} {...m} />)}
          </div>
          <p className="mt-5 text-sm leading-relaxed text-ink-300">사정율은 예정가격을 기초금액으로 나눈 값입니다. 발주처와 경쟁사의 사정율 분포에서 낙찰이 많이 몰린 구간을 보여 드립니다.</p>
        </div>
      </EngineBlock>

      <EngineBlock
        id="insight"
        lead="공고 하나를 고르고 우리 회사를 조회하면, 배점표 판독부터 예상 평가점수, 이 공고의 직전 낙찰, 예상 예정가격까지 한 화면에 정리합니다."
        menus={[
          { t: "나라장터 입찰 예측", d: "적격심사·협상계약 공고의 항목별 예상 평가점수와 투찰 금액을 봅니다.", href: "/premium" },
          { t: "공동주택 입찰 예측", d: "아파트 관리 입찰의 예상 낙찰금액과 같은 단지 낙찰 이력, 응찰 업체를 봅니다.", href: "/premium/apt" },
          { t: "누리장터 공고 예측", d: "누리장터 공고 중 평가 배점표가 있는 공고의 예상 평가점수를 봅니다.", href: "/premium/nuri" },
        ]}
      >
        <div className="space-y-3 rounded-[28px] bg-paper p-5 sm:p-8">
          <StepBar steps={[
            { label: "공고 선택", state: "done" },
            { label: "우리 회사 조회", state: "done" },
            { label: "결과 확인", state: "now" },
          ]} />
          <ol className="card divide-y divide-ink-100 px-5 sm:px-6">
            {INSIGHT_RESULT.map((r, i) => (
              <li key={r.t} className="flex min-w-0 gap-4 py-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-mint-50 text-sm font-extrabold tabular-nums text-mint-700">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-bold">{r.t}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">{r.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </EngineBlock>

      {/* 맞춤 공고 메일 */}
      <section className="container-x grid grid-cols-1 items-center gap-12 overflow-x-clip pt-28 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <h2 className="h-section">보러 오지 않아도,<br />영업일 아침 메일로.</h2>
          <p className="mt-4 text-ink-500">조건을 한 번 등록하면 세 엔진이 고른 공고가 메일로 옵니다. 메일의 공고를 누르면 분석 화면으로 바로 이어집니다.</p>
          <dl className="mt-8 divide-y divide-ink-100 border-y border-ink-100">
            {[
              ["맞춤 공고", "등록한 업종·지역·금액 조건에 맞는 새 공고와 마감 임박 공고"],
              ["정정·취소", "관심 공고와 추천 공고의 마감일·개찰일·금액이 바뀌면 바뀐 항목만"],
              ["관심 키워드", "등록한 낱말이 들어간 공고 (제외어 지정 가능)"],
            ].map(([t, d]) => (
              <div key={t} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[7rem_1fr] sm:gap-4">
                <dt className="font-bold">{t}</dt>
                <dd className="text-ink-500">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative min-w-0">
          <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-mint-100 via-white to-sky-100 opacity-80 blur-2xl" />
          <div className="relative"><EmailPreview digest={digest} /></div>
        </div>
      </section>

      {/* 원칙 */}
      <section className="container-x pt-28">
        <h2 className="h-section">숫자와 근거는 드리고,<br className="sm:hidden" /> 결정은 귀사가.</h2>
        <div className="mt-10 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          {PRINCIPLES.map(({ t, d }, i) => (
            <div key={t} className="min-w-0 border-t-2 border-ink py-6">
              <p className="flex items-baseline gap-3 text-lg font-bold"><span className="tabular-nums text-mint-600">0{i + 1}</span>{t}</p>
              <p className="mt-2 leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 마무리 */}
      <section className="px-2 py-24 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-950 text-white sm:rounded-[36px]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-mint/25 blur-3xl" />
          <div className="container-x relative flex flex-col justify-between gap-8 py-14 sm:py-20 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl sm:leading-[1.15]">입찰공고 <TrialN />건은<br />무료로 먼저 분석해 보세요.</h2>
              <p className="mt-5 max-w-xl text-ink-300">모든 기능은 같고, 한 달에 쓸 수 있는 공고 예측 건수만 요금제마다 다릅니다. 금액은 VAT 포함이며 약정이 없습니다.</p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-mint">무료 체험</Link>
              <Link href="/pricing" className="btn border border-white/20 bg-white/5 text-white hover:border-white/40">요금제 보기</Link>
              <Link href="/faq" className="btn border border-white/20 bg-white/5 text-white hover:border-white/40">FAQ</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function AtlasCell({ t, d, href }: { t: string; d: string; href: string }) {
  return (
    <Link href={href} className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-mint-400/60">
      <p className="font-bold group-hover:text-mint-400">{t}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-300">{d}</p>
    </Link>
  );
}
