import Link from "next/link";
import { Check, Plus, X } from "lucide-react";
import { HeroCity } from "@/components/art/HeroCity";
import { ConstructionArt, ITArt, SupplyArt } from "@/components/art/Sectors";
import { DeskArt } from "@/components/art/Desk";
import { BidRow } from "@/components/BidRow";
import { GradeBadge, ScoreBar } from "@/components/Badges";
import { FeatureTabs } from "@/components/home/FeatureTabs";
import { ProductMockup } from "@/components/home/ProductMockup";
import { AnalysisEngine } from "@/components/home/AnalysisEngine";
import { AgencyMark, AGENCY_KINDS } from "@/components/home/AgencyMark";
import { MatchDemo } from "@/components/MatchDemo";
import { documentChecklist, evaluate, rank } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { dday, won } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";
import { CATEGORY_GROUPS, type BizType } from "@/lib/types";
import { bidHref } from "@/lib/links";

export const revalidate = 600;

const BIZ_INFO: Record<keyof typeof CATEGORY_GROUPS, { d: string; tone: string }> = {
  용역: { d: "청소·시설관리, IT, 설계·감리, 연구, 행사, 폐기물 처리 등", tone: "from-mint-50" },
  공사: { d: "건축·토목, 전기·통신, 소방·기계설비, 조경·산림 공사", tone: "from-sky-100" },
  물품: { d: "의료·의약품, 급식 식자재, 전산장비, 관급자재 등 구매", tone: "from-amber-100" },
};

const BIZ_ART = { 용역: ITArt, 공사: ConstructionArt, 물품: SupplyArt } as const;

const COMPARE = [
  ["공고 탐색", "직접 키워드 검색, 수백 건 확인", "조건에 맞는 공고만 매일 배달"],
  ["업종 범위", "전 업종 공고를 한 목록에 나열", "전 업종 수집 후 귀사 면허에 맞는 공고만"],
  ["참가 가능 여부", "공고문을 열어 직접 판단", "면허·지역·규모 3개 필수 조건 알고리즘 판정"],
  ["준비 서류", "공고문·규정을 직접 해석", "계약방법별 체크리스트 제공"],
  ["입찰 판단", "투찰가 분석 위주", "6개 항목 가중 채점과 S·A·B·C 등급"],
];

const TRUST = [
  { t: "공공데이터 원본 그대로", d: "조달청 나라장터가 공공데이터포털로 공개하는 공고 데이터를 가공 없이 받아 씁니다." },
  { t: "영업일 하루 세 번 갱신", d: "아침·점심·저녁에 새 공고를 다시 받아 정정 공고와 마감 변경을 놓치지 않습니다." },
  { t: "17개 시·도 지역제한 판정", d: "공고문의 참가 가능 지역을 읽어 귀사 소재지로 참가할 수 있는지 먼저 가립니다." },
  { t: "가중치와 점수 근거 공개", d: "면허 30·지역 20·규모 15·경쟁 15·실적 10·기간 10점. 가중치와 항목별 점수, 그 근거를 모두 보여 드립니다." },
  { t: "투찰은 귀사가 직접", d: "법령상 투찰은 대리할 수 없습니다. 저희는 판단과 준비를 돕고, 결정과 투찰은 귀사가 합니다." },
  { t: "필요한 정보만 받습니다", d: "회사명, 면허, 지역, 규모, 연락처만으로 시작합니다. 공동인증서나 비밀번호는 받지 않습니다." },
];

const PERSONAS = [
  { tags: ["청소·시설관리", "직원 10명 내외"], t: "대표가 현장과 입찰을 같이 보는 회사", d: "아침 메일 한 통으로 오늘 볼 공고만 확인하고, 관심 공고만 골라 서류 준비를 맡기세요.", plan: "베이직" },
  { tags: ["전기·통신공사", "직원 30~50명"], t: "입찰 담당자가 따로 없는 회사", d: "가능성 점수와 주간 보고서로 회의 없이 참가 여부를 정하고, 매니저가 마감 전 서류를 한 번 더 봅니다.", plan: "프로" },
  { tags: ["IT·엔지니어링", "여러 지역·면허"], t: "지사·면허가 여러 개인 회사", d: "사업장별 조건을 따로 등록해 지역별 공고를 나눠 받고, 협상계약 제안서 준비까지 함께합니다.", plan: "파트너" },
];

const FAQ = [
  { q: "프로그램을 설치하거나 매일 접속해야 하나요?", a: "아닙니다. 조건만 한 번 등록하시면 영업일마다 이메일로 받아 보시면 됩니다. 필요할 때만 웹에서 공고 분석을 열어보시면 됩니다." },
  { q: "공고 데이터는 어디서 오나요?", a: "조달청 나라장터가 공공데이터포털로 공개하는 입찰공고·낙찰·사전규격 정보를 매일 수집해 분석합니다." },
  { q: "입찰 가능성 점수는 어떻게 계산하나요?", a: "입찰 특화 알고리즘이 6개 항목을 가중 채점합니다. 면허 요건 30점, 참가 지역 20점, 사업 규모 15점은 필수 조건으로 먼저 판정하고, 하나라도 맞지 않으면 39점 이하로 제한해 제외합니다. 통과한 공고는 유사 공고 평균 참여업체 수로 본 경쟁 강도 15점, 기초금액 대비 실적 10점, 남은 준비 기간 10점을 더해 100점 만점으로 산출하고, 85점 이상 S, 72점 이상 A, 58점 이상 B, 그 아래는 C 등급을 붙입니다." },
  { q: "입찰 대리 투찰도 해주나요?", a: "투찰은 관련 법령상 귀사가 직접 하셔야 합니다. 입찰메이트LAB은 공고 발굴, 조건 검토, 서류 준비 가이드를 대신해 드립니다." },
];

export default async function Home() {
  const bids = await getBids();
  // 업종이 다른 예시 고객사들: [0] 전기·통신공사, [1] IT 용역, [2] 의료 물품, [3] 시설관리 용역, [4] 건축공사
  const client = SEED_CLIENTS[0];
  const digest = buildDigest(client, bids);
  const cases = [
    { label: "전기·통신공사", c: SEED_CLIENTS[0] },
    { label: "IT·소프트웨어 용역", c: SEED_CLIENTS[1] },
    { label: "의료 물품 납품", c: SEED_CLIENTS[2] },
    { label: "시설관리 용역", c: SEED_CLIENTS[3] },
  ].map(({ label, c }) => {
    const d = buildDigest(c, bids);
    return { label, digest: d, top: d.recommended[0] };
  });
  // 분석 예시 공고는 IT 용역 고객사 기준
  const itClient = SEED_CLIENTS[1];
  const featured = cases[1].top?.bid ?? digest.recommended[0]?.bid ?? bids[0];
  const featuredEval = evaluate(featured, itClient);
  const docs = documentChecklist(featured);
  const docCount = docs.reduce((s, g) => s + g.items.length, 0);

  // 1차 선별 단계별 남는 공고 수 (예시 고객사 기준)
  const buildClient = SEED_CLIENTS[4];
  const evals = bids.map((b) => evaluate(b, buildClient));
  const okAt = (n: number) => evals.filter((e) => e.factors.slice(0, n).every((f) => f.ok)).length;
  const eligible = rank(bids, buildClient).filter((r) => r.eligible);
  const clientEligible = rank(bids, client).filter((r) => r.eligible);
  const funnel = [
    ["오늘 수집한 전 업종 공고", bids.length],
    ["보유 면허로 참가 가능", okAt(1)],
    ["영업 지역 참가 가능", okAt(2)],
    ["규모까지 맞는 최종 추천", eligible.length],
  ] as const;
  const cut = bids.length ? Math.round((1 - eligible.length / bids.length) * 100) : 0;

  const agencies = [...new Set(bids.map((b) => b.demandAgency))].slice(0, 24);
  // 업무 구분·업종별 공고 수 (외자는 물품에 포함)
  const bizOf = (b: (typeof bids)[number]): keyof typeof CATEGORY_GROUPS => {
    const t: BizType = b.bizType ?? "용역";
    return t === "외자" ? "물품" : t;
  };
  const byBiz = (Object.keys(CATEGORY_GROUPS) as (keyof typeof CATEGORY_GROUPS)[]).map((biz) => {
    const list = bids.filter((b) => bizOf(b) === biz);
    const cats = (CATEGORY_GROUPS[biz] as readonly string[])
      .map((c) => ({ c, n: list.filter((b) => b.category === c).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    return { biz, n: list.length, cats };
  });

  const FEATURES = [
    {
      label: "매일 아침 맞춤 메일",
      title: "나라장터에 접속하지 않아도, 오늘 볼 공고가 먼저 도착합니다",
      points: [<><b>영업일 오전 7시</b>, 귀사 조건에 맞는 신규 공고만 골라 보냅니다</>, <>공고마다 <b>가능성 등급·규모·마감일</b>을 한 줄로 요약합니다</>, <><b>3일 내 마감</b> 공고는 따로 모아 경고합니다</>],
      use: ["수도권 전기·통신공사 업체", "출근길에 메일만 확인하고, 관심 공고 두 건만 표시해 매니저에게 서류 준비를 넘깁니다."],
      visual: (
        <div className="rounded-2xl bg-white p-4 shadow-lift sm:p-5">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>받은편지함 · 오전 7:00</span>
            <span className="rounded-full bg-mint-50 px-2 py-0.5 font-bold text-mint-600">새 메일</span>
          </div>
          <p className="mt-2 text-sm font-bold">[입찰메이트LAB] {client.company} 맞춤 공고 {digest.recommended.length}건</p>
          <ul className="mt-3 divide-y divide-ink-100">
            {digest.recommended.slice(0, 4).map((r) => (
              <li key={r.bid.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.bid.title}</span>
                  <span className="text-xs text-ink-400">{won(r.bid.baseAmount)} · 마감 {dday(r.daysLeft)}</span>
                </span>
                <GradeBadge grade={r.grade} />
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      label: "면허·지역·규모 1차 선별",
      title: "참가할 수 없는 공고는 처음부터 보여드리지 않습니다",
      points: [<>보유 <b>면허</b>가 맞지 않는 공고를 먼저 제외합니다</>, <>공고문의 <b>지역제한</b>을 읽어 참가 가능 지역만 남깁니다</>, <>수행 가능한 <b>용역 규모</b>를 벗어난 공고를 거릅니다</>],
      use: ["실내건축 공사 업체", "하루 2천 건 넘는 전국 공고를 훑던 시간을 줄이고, 남은 몇 건만 꼼꼼히 검토합니다."],
      visual: (
        <div className="rounded-2xl bg-white p-5 shadow-lift">
          <p className="text-xs font-semibold text-ink-400">예시 고객사 조건으로 오늘 공고를 거른 결과</p>
          <ul className="mt-4 space-y-2.5">
            {funnel.map(([k, v], i) => (
              <li key={k}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className={i === 3 ? "font-bold text-mint-700" : "text-ink-500"}>{k}</span>
                  <span className="font-bold tabular-nums">{v}건</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-paper">
                  <div className={`h-full rounded-full ${i === 3 ? "bg-mint" : "bg-ink-200"}`} style={{ width: `${bids.length ? Math.max(4, (v / bids.length) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      label: "공고 분석 · 가능성 점수",
      title: "들어갈지 말지, 알고리즘이 항목별로 채점해 드립니다",
      points: [<><b>면허 30·지역 20·규모 15점</b>, 3개 필수 조건을 먼저 판정합니다</>, <>유사 공고 평균 참여업체 수로 <b>경쟁 강도 15점</b>을 계산합니다</>, <><b>실적 10점·준비 기간 10점</b>까지 더해 100점 만점과 등급을 매깁니다</>],
      use: ["입찰 담당자가 없는 소프트웨어 업체", "점수와 근거를 보고 대표가 바로 참가 여부를 정합니다. 따로 회의할 필요가 없습니다."],
      visual: (
        <div className="rounded-2xl bg-white p-5 shadow-lift">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-ink-400">{featured.demandAgency}</p>
              <p className="mt-1 font-bold">{featured.title}</p>
              <p className="mt-1 text-sm text-ink-500">기초금액 {won(featured.baseAmount)} · {featured.contractMethod}</p>
            </div>
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#12B886 ${featuredEval.score * 3.6}deg, #E5E9F0 0)` }}>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-lg font-extrabold text-mint-600">{featuredEval.score}</div>
            </div>
          </div>
          <ul className="mt-5 space-y-3">
            {featuredEval.factors.map((f) => (
              <li key={f.label}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="font-semibold">{f.label} <span className="font-normal tabular-nums text-ink-300">{f.score}/{f.max}</span></span>
                  <span className="truncate text-ink-400">{f.note}</span>
                </div>
                <ScoreBar value={f.score} max={f.max} />
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      label: "제출서류 체크리스트",
      title: "계약방법에 맞는 제출서류를 빠짐없이 정리합니다",
      points: [<>적격심사·협상계약 등 <b>계약방법별</b> 서류를 나눠 드립니다</>, <>서류마다 <b>발급처와 유효기간</b> 주의사항을 붙입니다</>, <>프로 요금제부터 매니저가 <b>마감 전 누락 여부</b>를 확인합니다</>],
      use: ["처음 공공 입찰에 참가하는 업체", "체크리스트대로 서류를 모으고, 빠진 항목만 매니저에게 물어봅니다."],
      visual: (
        <div className="rounded-2xl bg-white p-5 shadow-lift">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">제출서류 체크리스트</p>
            <span className="chip">{featured.contractMethod} 기준</span>
          </div>
          <ul className="mt-4 space-y-2">
            {docs.flatMap((g) => g.items).slice(0, 6).map((d, i) => (
              <li key={d.name} className="flex items-center gap-3 rounded-xl border border-ink-100 px-3 py-2.5 text-sm">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ${i < 3 ? "bg-mint text-white" : "border border-ink-200"}`}>{i < 3 && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                <span className={`min-w-0 flex-1 truncate ${i < 3 ? "text-ink-400 line-through" : "font-medium"}`}>{d.name}</span>
                {d.note && <span className="hidden truncate text-xs text-ink-300 sm:block">{d.note}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-xs text-ink-400">총 {docCount}개 항목 중 3개 준비</p>
        </div>
      ),
    },
  ];

  const TABS = [
    {
      label: "공고 검색",
      title: "용역·공사·물품 전 업종 공고를 업종별로 나눠 검색합니다",
      desc: "업무 구분·업종·지역·마감 임박으로 거르고, 내 조건을 넣으면 공고마다 참가 가능 여부와 점수가 바로 붙습니다.",
      href: "/bids",
      cta: "공고 검색 열기",
      preview: <div className="space-y-2">{clientEligible.slice(0, 3).map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} />)}</div>,
    },
    {
      label: "공고 분석",
      title: "공고 하나를 한 장으로 정리합니다",
      desc: "기초금액, 참가 지역, 필요 면허, 낙찰하한율, 공동도급, 일정, 투찰 금액 가이드까지 공고문을 열지 않고 확인합니다.",
      href: bidHref(featured.id),
      cta: "분석 예시 보기",
      preview: (
        <div className="rounded-2xl bg-white p-5 shadow-lift">
          <p className="font-bold">{featured.title}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["기초금액", won(featured.baseAmount)],
              ["계약 기간", `${featured.periodMonths}개월`],
              ["참가 지역", featured.region === "전국" ? "제한 없음" : `${featured.region} 제한`],
              ["필요 면허", featured.licenses.join(", ") || "제한 없음"],
              ["낙찰하한율", featured.lowerLimitRate ? `${featured.lowerLimitRate}%` : "해당 없음"],
              ["공동도급", featured.jointContract ? "허용" : "불가(단독)"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-paper p-3">
                <dt className="text-[11px] text-ink-400">{k}</dt>
                <dd className="mt-0.5 truncate text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
    {
      label: "주간 보고서",
      title: "매주 월요일, 이번 주 집중할 공고를 정리해 드립니다",
      desc: "지난주 공고 흐름, 이번 주 꼭 볼 공고 TOP 5, 발주기관 동향, 매니저 코멘트를 한 장 보고서로 받습니다.",
      href: "/report/sample",
      cta: "보고서 샘플 보기",
      preview: (
        <div className="overflow-hidden rounded-2xl bg-white shadow-lift">
          <div className="bg-ink p-5 text-white">
            <p className="text-xs text-mint-300">주간 분석보고서 · 이번 주</p>
            <p className="mt-1 text-lg font-bold">{client.company}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[["참가 가능", `${clientEligible.length}건`], ["총 규모", won(clientEligible.reduce((s, r) => s + r.bid.baseAmount, 0))], ["A등급 이상", `${clientEligible.filter((r) => r.grade === "S" || r.grade === "A").length}건`]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/5 p-2.5"><p className="text-[11px] text-ink-300">{k}</p><p className="mt-0.5 font-bold">{v}</p></div>
              ))}
            </div>
          </div>
          <div className="p-5">
            <DeskArt className="mx-auto w-full max-w-[260px]" />
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="bg-grid-light mask-fade pointer-events-none absolute inset-x-0 top-0 h-[640px]" />
        <div className="pointer-events-none absolute left-1/2 top-[-200px] h-[560px] w-[960px] -translate-x-1/2 rounded-full bg-gradient-to-r from-mint-100 via-white to-sky-100 opacity-90 blur-3xl" />
        <ConstructionArt className="pointer-events-none absolute left-[2%] top-20 hidden w-56 -rotate-6 animate-float-slow opacity-90 xl:block 2xl:left-[8%]" />
        <SupplyArt className="pointer-events-none absolute right-[2%] top-32 hidden w-52 rotate-6 animate-float opacity-90 xl:block 2xl:right-[8%]" />
        <div className="container-x relative pt-14 text-center sm:pt-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-mint-100 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-mint-700 shadow-card">
            입찰 특화 분석 알고리즘 기반 공공입찰 대행
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-[40px] font-extrabold leading-[1.15] tracking-[-0.045em] sm:text-6xl lg:text-[72px]">
            공고마다 정밀하게 채점하고,
            <br />
            <span className="bg-gradient-to-r from-mint-600 to-sky bg-clip-text text-transparent">결정은 대표님이.</span>
          </h1>
          <p className="lead mx-auto mt-6 max-w-2xl">
            입찰 특화 알고리즘이 나라장터 공고마다 면허·지역·규모를 판정하고 경쟁 강도·실적·준비 기간까지 6개 항목으로 채점해, 점수와 근거를 매일 아침 보내 드립니다.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/apply" className="btn-mint px-7 text-base">2주 무료로 시작하기</Link>
            <Link href="/bids" className="btn-ghost px-7 text-base">오늘의 공고 둘러보기</Link>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink-400">
            {["카드 등록 없음", "약정 없음", "조건 등록 3분"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-mint" />{t}</li>
            ))}
          </ul>

          <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
            <div className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 rounded-[48px] bg-gradient-to-b from-mint/20 to-sky/10 blur-3xl" />
            <div className="relative"><ProductMockup cases={cases} /></div>
          </div>
        </div>
      </section>

      {/* 발주기관 마키 */}
      <section className="pt-16">
        <p className="container-x text-center text-sm font-semibold text-ink-400">오늘 수집한 공고의 발주기관</p>
        <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-3">
            {[...agencies, ...agencies].map((a, i) => (
              <AgencyMark key={i} name={a} />
            ))}
          </div>
        </div>
        <div className="container-x mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-ink-400">
          {AGENCY_KINDS.map((k) => (
            <span key={k.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: k.fill }} />{k.label}</span>
          ))}
          <span className="basis-full text-center text-ink-300 sm:basis-auto">공식 CI는 사용 승인을 받은 기관만 표시하고, 나머지는 입찰메이트LAB이 만든 유형 표시입니다. 고객사나 제휴 기관을 뜻하지 않습니다.</span>
        </div>
      </section>

      {/* 숫자 */}
      <section className="container-x pt-20">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[
            ["전 업종 수집", "오늘 확인한 공고", bids.length.toLocaleString(), "건"],
            ["알고리즘 판정", "공고당 채점 항목", "6", "개"],
            ["1차 선별", "검토할 공고", `${cut}%`, "감소"],
            ["메일 발송", "영업일 아침", "07:00", ""],
          ].map(([tag, k, v, u]) => (
            <div key={tag} className="rounded-3xl bg-paper p-5 sm:p-7">
              <p className="text-xs font-bold text-mint-600">{tag}</p>
              <p className="mt-1 text-sm text-ink-500">{k}</p>
              <p className="mt-4 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
                {v}<span className="ml-1 text-base font-bold text-ink-400">{u}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-right text-xs text-ink-300">예시 고객사 조건과 오늘 수집한 공고 기준</p>
      </section>

      {/* 분석 엔진 */}
      <AnalysisEngine bid={featured} ev={featuredEval} total={bids.length} />

      {/* 핵심 기능 — 번갈아 배치 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">핵심 서비스</p>
          <h2 className="h-section mt-3">찾고, 거르고, 정리하는 일은<br />저희가 합니다.</h2>
        </div>
        <div className="mt-16 space-y-20 sm:space-y-28">
          {FEATURES.map((f, i) => (
            <div key={f.label} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={`rounded-[32px] bg-gradient-to-br from-mint-50 via-paper to-sky-100/60 p-4 sm:p-8 ${i % 2 ? "lg:order-2" : ""}`}>{f.visual}</div>
              <div>
                <p className="inline-flex rounded-full bg-mint-50 px-3 py-1 text-xs font-bold text-mint-700">{f.label}</p>
                <h3 className="mt-4 text-2xl font-extrabold leading-snug tracking-[-0.03em] sm:text-[32px]">{f.title}</h3>
                <ul className="mt-6 space-y-3">
                  {f.points.map((p, n) => (
                    <li key={n} className="flex gap-3 text-ink-500 [&_b]:font-semibold [&_b]:text-ink">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 rounded-2xl border border-ink-100 p-4">
                  <p className="text-xs font-bold text-ink-400">이렇게 활용해요 · {f.use[0]}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{f.use[1]}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 업종 */}
      <section className="container-x pt-28">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">전 업종</p>
            <h2 className="h-section mt-3">용역·공사·물품,<br className="sm:hidden" /> 모든 업종을 봅니다.</h2>
          </div>
          <p className="max-w-sm text-ink-500">나라장터의 모든 공고를 받아 업종별로 나누고, 귀사가 가진 면허로 참가할 수 있는 공고만 골라 드립니다.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {byBiz.map(({ biz, n, cats }) => (
            <div key={biz} className={`card overflow-hidden bg-gradient-to-b ${BIZ_INFO[biz].tone} to-white to-40% p-5 sm:p-6`}>
              {(() => { const Art = BIZ_ART[biz]; return <Art className="mx-auto -mt-2 mb-3 h-36 w-auto" />; })()}
              <div className="flex items-baseline justify-between">
                <Link href={`/bids?biz=${encodeURIComponent(biz)}`} className="text-2xl font-extrabold hover:text-mint-600">{biz}</Link>
                <span className="text-sm font-bold text-ink-500">공고 <span className="tabular-nums text-ink">{n.toLocaleString()}</span>건</span>
              </div>
              <p className="mt-1.5 text-sm text-ink-500">{BIZ_INFO[biz].d}</p>
              <ul className="mt-5 flex flex-wrap gap-1.5">
                {cats.map(({ c, n: cn }) => (
                  <li key={c}>
                    <Link href={`/bids?cat=${encodeURIComponent(c)}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-700 transition hover:border-mint hover:text-mint-600">
                      {c}<span className="text-xs font-bold tabular-nums text-ink-300">{cn.toLocaleString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 기능 탭 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">주요 화면</p>
          <h2 className="h-section mt-3">필요할 때만 열어 보세요.</h2>
        </div>
        <div className="mt-10">
          <FeatureTabs tabs={TABS} />
        </div>
      </section>

      {/* 비교 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">왜 입찰메이트LAB인가요</p>
          <h2 className="h-section mt-3">입찰정보 사이트는 많은데,<br />왜 여전히 힘들까요?</h2>
        </div>
        {/* 데스크톱: 항목별 한 줄 비교 표, 입찰메이트LAB 열을 강조 */}
        <div className="relative mt-14 hidden lg:block">
          <div className="pointer-events-none absolute -bottom-6 -top-6 right-0 w-[44%] rounded-[32px] bg-ink shadow-glow ring-2 ring-mint">
            <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-mint/25 blur-3xl" />
          </div>
          <div className="relative grid grid-cols-[150px_1fr_44%]">
            <div />
            <div className="px-6 pb-5">
              <p className="text-sm font-semibold text-ink-400">일반 입찰정보 포털</p>
              <p className="mt-1 text-xs text-ink-300">사람이 직접 찾고 판단</p>
            </div>
            <div className="px-8 pb-5">
              <p className="text-lg font-extrabold text-mint-300">입찰메이트LAB</p>
              <p className="mt-1 text-xs text-ink-300">입찰 특화 알고리즘이 판정·채점</p>
            </div>
            {COMPARE.map(([k, a, b]) => (
              <div key={k} className="contents">
                <div className="flex items-center border-t border-ink-100 py-5 pr-4 text-sm font-bold text-ink-700">{k}</div>
                <div className="flex items-center gap-3 border-t border-ink-100 px-6 py-5 text-[15px] text-ink-400">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-400"><X className="h-3.5 w-3.5" /></span>
                  {a}
                </div>
                <div className="flex items-center gap-3 border-t border-white/10 px-8 py-5 text-lg font-bold text-white">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mint text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>
                  {b}
                </div>
              </div>
            ))}
            <div className="flex items-center border-t-2 border-ink-200 py-6 pr-4 text-sm font-bold text-ink-700">오늘 검토할 공고</div>
            <div className="border-t-2 border-ink-200 px-6 py-6">
              <p className="text-4xl font-extrabold tabular-nums text-ink-300">{bids.length.toLocaleString()}<span className="ml-1 text-base font-bold">건</span></p>
              <p className="mt-1 text-xs text-ink-400">수집된 공고 전체를 직접 확인</p>
            </div>
            <div className="border-t border-white/15 px-8 py-6">
              <p className="text-5xl font-extrabold tabular-nums text-mint">{eligible.length.toLocaleString()}<span className="ml-1 text-lg font-bold text-mint-300">건</span><span className="ml-3 rounded-lg bg-mint px-2 py-1 align-middle text-sm font-extrabold text-white">{cut}% 감소</span></p>
              <p className="mt-1 text-xs text-ink-300">면허·지역·규모 판정을 통과한 공고만</p>
            </div>
          </div>
        </div>

        {/* 모바일·태블릿: 항목별 카드 */}
        <div className="mt-10 space-y-3 lg:hidden">
          {COMPARE.map(([k, a, b]) => (
            <div key={k} className="overflow-hidden rounded-2xl border border-ink-100">
              <p className="px-4 pt-3 text-xs font-bold text-ink-500">{k}</p>
              <p className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-400">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-100"><X className="h-3 w-3" /></span>
                <span><span className="mr-1.5 text-[11px] font-semibold">일반 포털</span>{a}</span>
              </p>
              <p className="flex items-center gap-2.5 bg-ink px-4 py-3.5 font-bold text-white">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                <span><span className="mr-1.5 text-[11px] font-semibold text-mint-300">입찰메이트LAB</span>{b}</span>
              </p>
            </div>
          ))}
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-ink-100">
            <div className="p-4">
              <p className="text-[11px] font-semibold text-ink-400">일반 포털 · 오늘 검토할 공고</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink-300">{bids.length.toLocaleString()}<span className="text-sm">건</span></p>
            </div>
            <div className="bg-ink p-4">
              <p className="text-[11px] font-semibold text-mint-300">입찰메이트LAB</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-mint">{eligible.length.toLocaleString()}<span className="text-sm text-mint-300">건</span></p>
              <p className="text-xs font-bold text-white">{cut}% 감소</p>
            </div>
          </div>
        </div>
        <p className="mt-10 text-right text-xs text-ink-300">오늘 검토할 공고 수는 예시 고객사 조건과 오늘 수집한 공고 기준</p>
      </section>

      {/* 신뢰 */}
      <section className="px-2 pt-28 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 py-20 text-white sm:rounded-[36px] sm:py-24">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[680px] -translate-x-1/2 rounded-full bg-mint/20 blur-[120px]" />
          <div className="container-x relative">
            <div className="text-center">
              <h2 className="h-section">공공 데이터 그대로,<br />판단 근거는 투명하게.</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {["공공데이터포털 공식 API", "영업일 3회 갱신", "17개 시·도 판정", "가중치·근거 공개"].map((t) => (
                  <span key={t} className="glass rounded-full px-4 py-2 text-sm font-semibold text-mint-200">{t}</span>
                ))}
              </div>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST.map(({ t, d }) => (
                <div key={t} className="bg-ink-900 p-7">
                  <p className="text-lg font-bold">{t}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-300">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 체험 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">30초 체험</p>
          <h2 className="h-section mt-3">우리 회사 조건이면,<br className="sm:hidden" /> 지금 몇 건이나 될까요?</h2>
          <p className="lead mx-auto mt-4 max-w-xl">면허와 지역, 규모를 골라 보세요. 매일 하는 1차 선별을 실제 공고로 그대로 체험할 수 있습니다.</p>
        </div>
        <div className="mx-auto mt-10 max-w-5xl">
          <MatchDemo />
        </div>
      </section>

      {/* 이런 업체에 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">추천 대상</p>
          <h2 className="h-section mt-3">이런 업체에 잘 맞아요.</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <div key={p.t} className="card flex flex-col p-7">
              <div className="flex flex-wrap gap-1.5">
                {p.tags.map((t) => <span key={t} className="rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-ink-500">{t}</span>)}
              </div>
              <p className="mt-5 text-lg font-bold">{p.t}</p>
              <p className="mt-2 flex-1 leading-relaxed text-ink-500">{p.d}</p>
              <p className="mt-6 border-t border-ink-100 pt-4 text-sm text-ink-400">추천 요금제 <b className="text-ink">{p.plan}</b></p>
            </div>
          ))}
        </div>
      </section>

      {/* 요금제 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">요금제</p>
          <h2 className="h-section mt-3">입찰 담당자 한 명 인건비의 일부로.</h2>
          <p className="mt-4 text-ink-500">모든 요금제 2주 무료 · 약정 없음 · VAT 별도 · 낙찰 성공보수 없음</p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className={`relative flex flex-col overflow-hidden rounded-3xl border p-8 ${p.highlight ? "border-mint bg-white shadow-glow" : "border-ink-100 bg-white shadow-card"}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">{p.name}</p>
                {p.highlight && <span className="rounded-full bg-mint px-3 py-1 text-xs font-extrabold text-white">BEST</span>}
              </div>
              <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
              <p className="mt-6 text-5xl font-extrabold tracking-tight tabular-nums">
                {(p.price / 10000).toFixed(1).replace(/\.0$/, "")}<span className="text-lg font-bold">만원</span>
                <span className="ml-1 text-sm font-medium text-ink-300">/ 월</span>
              </p>
              <ul className="mt-6 flex-1 space-y-3 border-t border-ink-100 pt-6 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />{f}</li>
                ))}
              </ul>
              <Link href={`/apply?plan=${p.id}`} className={`mt-8 ${p.highlight ? "btn-mint" : "btn-ghost"}`}>2주 무료로 시작</Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center"><Link href="/pricing" className="font-semibold text-mint-600">요금제 기능 자세히 비교</Link></p>
      </section>

      {/* FAQ */}
      <section className="container-x grid gap-10 pt-28 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="eyebrow">자주 묻는 질문</p>
          <h2 className="h-section mt-3">궁금한 점이<br />있으신가요?</h2>
          <p className="mt-4 text-ink-500">평일 09:00–18:00 · hello@ipchalmatelab.kr</p>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group rounded-2xl bg-paper px-6 py-5 open:bg-white open:shadow-card open:ring-1 open:ring-ink-100" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-ink-400 transition group-open:rotate-45 group-open:bg-mint group-open:text-white"><Plus className="h-4 w-4" /></span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-2 pt-28 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 text-white sm:rounded-[36px]">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-mint/25 blur-[120px]" />
          <div className="container-x relative grid items-center gap-6 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl sm:leading-[1.15]">입찰 업무,<br />오늘부터 맡겨 보세요.</h2>
              <p className="mt-5 max-w-lg text-ink-300">조건을 남겨 주시면 지금 참가 가능한 공고 목록을 바로 보여드리고, 1영업일 안에 담당 매니저가 연락드립니다.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/apply" className="btn-mint px-7 text-base">무료 진단 신청</Link>
                <Link href="/pricing" className="btn-glass px-7 text-base">요금제 보기</Link>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-300">
                {["상담만 받아도 괜찮아요", "카드 등록 없음", "2주 무료"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-mint-400" />{t}</li>
                ))}
              </ul>
            </div>
            <HeroCity className="mx-auto hidden w-full max-w-md lg:block" />
          </div>
        </div>
      </section>
    </>
  );
}
