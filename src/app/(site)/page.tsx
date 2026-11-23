import Link from "next/link";
import { Price, TrialN } from "@/components/Cfg";
import { Check, Plus, X } from "lucide-react";
import { HeroCity } from "@/components/art/HeroCity";
import { ConstructionArt, ITArt, SupplyArt } from "@/components/art/Sectors";
import { DeskArt } from "@/components/art/Desk";
import { BidRow } from "@/components/BidRow";
import { GradeBadge, ScoreBar } from "@/components/Badges";
import { FeatureTabs } from "@/components/home/FeatureTabs";
import { ProductMockup } from "@/components/home/ProductMockup";
import { HeroStats } from "@/components/home/HeroStats";
import { AnalysisEngine } from "@/components/home/AnalysisEngine";
import { AgencyMark } from "@/components/home/AgencyMark";
import { agencyLogoKey } from "@/lib/agencyLogos";
import { MatchDemo } from "@/components/MatchDemo";
import { bidPriceGuide, documentChecklist, evaluate, rank } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { dday, won } from "@/lib/format";
import { PricingCards } from "@/components/PricingCards";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getAptBids, getAwardCount, getBids, getContracts, getNoticeChanges, getOrderPlans, getPreSpecs, getRecentAwards } from "@/lib/store";
import { APT_CATEGORIES } from "@/lib/apt";
import { CATEGORY_GROUPS, type BizType } from "@/lib/types";
import { aptBidHref, bidHref } from "@/lib/links";

export const revalidate = 600;

const BIZ_INFO: Record<keyof typeof CATEGORY_GROUPS, { d: string; tone: string }> = {
  용역: { d: "청소·시설관리, IT, 설계·감리, 연구, 행사, 폐기물 처리 등", tone: "from-mint-50" },
  공사: { d: "건축·토목, 전기·통신, 소방·기계설비, 조경·산림 공사", tone: "from-sky-100" },
  물품: { d: "의료·의약품, 급식 식자재, 전산장비, 관급자재 등 구매", tone: "from-amber-100" },
};

const BIZ_ART = { 용역: ITArt, 공사: ConstructionArt, 물품: SupplyArt } as const;

const COMPARE = [
  ["공고 탐색", "직접 키워드 검색, 수백 건 확인", "조건에 맞는 공고만 매일 배달"],
  ["공고 범위", "나라장터와 아파트 공고를 사이트마다 따로 확인", "나라장터 전 업종과 아파트 관리 입찰을 한 곳에서"],
  ["업종 범위", "전 업종 공고를 한 목록에 나열", "전 업종 수집 후 귀사 면허에 맞는 공고만"],
  ["참가 가능 여부", "공고문을 열어 직접 판단", "면허·지역·규모 3개 필수 조건 알고리즘 판정"],
  ["준비 서류", "공고문·규정을 직접 해석", "계약방법별 체크리스트 제공"],
  ["입찰 판단", "투찰가 분석 위주", "6개 항목 가중 채점과 S·A·B·C 등급"],
  ["정정·취소", "공고를 다시 열어 바뀐 곳을 직접 비교", "바뀐 항목만 골라 따로 알림"],
  ["낙찰 분석", "과거 결과를 건마다 직접 검색", "10년치 낙찰 기록으로 사정율·발주처·경쟁사 분석"],
];

const TRUST = [
  { t: "공공데이터 원본 그대로", d: "조달청 나라장터와 국토교통부 공동주택관리정보시스템(K-apt)이 공공데이터포털로 공개하는 공고·낙찰 데이터를 가공 없이 받아 씁니다." },
  { t: "영업일 하루 세 번 갱신", d: "아침·점심·저녁에 새 공고를 다시 받고, 정정·취소 공고는 이전 차수와 비교해 바뀐 항목을 따로 알려 드립니다." },
  { t: "17개 시·도 지역제한 판정", d: "공고문의 참가 가능 지역을 읽어 귀사 소재지로 참가할 수 있는지 먼저 가립니다." },
  { t: "가중치와 점수 근거 공개", d: "면허 30·지역 20·규모 15·경쟁 15·실적 10·기간 10점. 가중치와 항목별 점수, 그 근거를 모두 보여 드립니다." },
  { t: "투찰은 귀사가 직접", d: "법령상 투찰은 대리할 수 없습니다. 저희는 판단과 준비를 돕고, 결정과 투찰은 귀사가 합니다." },
  { t: "필요한 정보만 받습니다", d: "회사명, 면허, 지역, 규모, 연락처만으로 시작합니다. 공동인증서나 비밀번호는 받지 않습니다." },
];

const PERSONAS = [
  { tags: ["아파트 청소·경비", "직원 10명 내외"], t: "대표가 현장과 입찰을 같이 보는 회사", d: "나라장터 공고는 아침 메일로 받고, 아파트 공고는 같은 단지의 직전 낙찰금액과 예상 낙찰금액을 보고 투찰가를 정하세요.", use: "아침 맞춤 공고 메일·아파트 예측" },
  { tags: ["전기·통신공사", "직원 30~50명"], t: "입찰 담당자가 따로 없는 회사", d: "가능성 점수와 주간 보고서로 회의 없이 참가 여부를 정하고, 제출서류 체크리스트로 마감 전 서류를 한 번 더 봅니다.", use: "입찰 가능성 점수·주간 보고서" },
  { tags: ["IT·엔지니어링", "여러 지역·면허"], t: "지사·면허가 여러 개인 회사", d: "사업장별 조건을 따로 등록해 지역별 공고를 나눠 받고, 협상계약 제안서 준비까지 함께합니다.", use: "사업장별 조건·평가점수 예측" },
];

const FAQ = [
  { q: "프로그램을 설치하거나 매일 접속해야 하나요?", a: "아닙니다. 조건만 한 번 등록하시면 영업일마다 이메일로 받아 보시면 됩니다. 필요할 때만 웹에서 공고 분석을 열어보시면 됩니다." },
  { q: "공고 데이터는 어디서 오나요?", a: "조달청 나라장터가 공공데이터포털로 공개하는 입찰공고·낙찰·사전규격·발주계획·계약 정보와, 국토교통부 공동주택관리정보시스템(K-apt)의 아파트 입찰공고·입찰결과·수의계약 정보를 매일 수집해 분석합니다." },
  { q: "아파트 관리 입찰도 볼 수 있나요?", a: "네. 아파트 청소·경비·소독·승강기 유지·위탁관리·공사 공고를 업종별로 모아 보여 드리고, 같은 단지의 직전 낙찰·수의계약 금액과 아파트 입찰가격 예측을 함께 제공합니다." },
  { q: "입찰 가능성 점수는 어떻게 계산하나요?", a: "입찰 특화 알고리즘이 6개 항목을 가중 채점합니다. 면허 요건 30점, 참가 지역 20점, 사업 규모 15점은 필수 조건으로 먼저 판정하고, 하나라도 맞지 않으면 39점 이하로 제한해 제외합니다. 통과한 공고는 유사 공고 평균 참여업체 수로 본 경쟁 강도 15점, 기초금액 대비 실적 10점, 남은 준비 기간 10점을 더해 100점 만점으로 산출하고, 85점 이상 S, 72점 이상 A, 58점 이상 B, 그 아래는 C 등급을 붙입니다." },
  { q: "무료 체험은 무엇을 해 볼 수 있나요?", a: <>입찰공고 <TrialN />건을 골라 평가점수 예측(나라장터·아파트), 배점표 판독, 낙찰 결과로 본 예측을 요금 없이 써 보실 수 있습니다. 이미 분석한 공고는 다시 열어도 차감되지 않으며, 카드 등록이 없어 자동으로 결제되지 않습니다.</> },
  { q: "입찰 대리 투찰도 해주나요?", a: "투찰은 관련 법령상 귀사가 직접 하셔야 합니다. 입찰메이트LAB은 공고 발굴, 조건 검토, 서류 준비 가이드를 대신해 드립니다." },
];

export default async function Home() {
  const bids = await getBids();
  const builtAt = Date.now();
  // 현황 줄은 나라장터와 아파트(K-apt) 공고·낙찰을 합친 누적 숫자다 (낙찰 저장소에 쌓인 것)
  const apt = await getAptBids();
  const awardCount = getAwardCount();
  // 입찰 분석 메뉴 카드에 붙일 건수 (빌드 때 받은 자료, 없으면 숫자 없이 보여 준다)
  const [plans, preSpecs, contracts, changes, recent] = await Promise.all([getOrderPlans(), getPreSpecs(), getContracts(), getNoticeChanges(), getRecentAwards()]);
  // 아파트 공고: 마감 전 공고만, 업종별 건수와 직전 낙찰금액이 붙은 예시
  const aptOpen = apt.items.filter((b) => new Date(b.closeAt).getTime() > builtAt);
  const aptCats = APT_CATEGORIES.map((c) => ({ c, n: aptOpen.filter((b) => b.category === c).length })).filter((x) => x.n > 0);
  const aptWithPrior = aptOpen.filter((b) => b.prior && b.prior.amount > 0);
  const aptSamples = [...aptWithPrior.filter((b) => b.category !== "공사"), ...aptOpen.filter((b) => !b.prior)].slice(0, 3);
  // 아파트 공고 중 나라장터 공고와 번호가 겹치는 것은 한 번만 센다
  const aptNotices = Math.max(0, (awardCount?.aptNotices ?? 0) - (awardCount?.aptDup ?? 0));
  // 아파트 낙찰(입찰결과 누적, 없으면 빌드 때 받은 최근 3개 연도)과 수의계약을 모두 더한다
  const aptAwards = (awardCount?.aptAwards ?? apt.awards ?? 0) + (apt.privates ?? 0);
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
  const guide = bidPriceGuide(featured);

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

  // 공식 CI가 확인된 기관만, 같은 CI(예: 정부상징)는 한 번만. 확인되지 않은 기관은 띠에 넣지 않는다
  const agencies = (() => {
    const seen = new Set<string>();
    const list = [...new Set(bids.map((b) => b.demandAgency))].filter((n) => {
      const k = agencyLogoKey(n);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 30);
    // 기관이 적으면 띠 한 바퀴가 화면보다 짧아 빈 곳이 보이므로 같은 목록을 이어 붙여 24칸 이상으로 만든다
    return list.length ? Array.from({ length: Math.ceil(24 / list.length) }, () => list).flat() : [];
  })();
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
      use: ["수도권 전기·통신공사 업체", "출근길에 메일만 확인하고, 관심 공고 두 건의 서류 체크리스트로 준비를 시작합니다."],
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
                  <span className="block font-medium">{r.bid.title}</span>
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
                  <span className="shrink-0 font-semibold">{f.label} <span className="font-normal tabular-nums text-ink-300">{f.score}/{f.max}</span></span>
                  <span className="min-w-0 text-right text-ink-400">{f.note}</span>
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
      points: [<>적격심사·협상계약 등 <b>계약방법별</b> 서류를 나눠 드립니다</>, <>서류마다 <b>발급처와 유효기간</b> 주의사항을 붙입니다</>, <>서류마다 <b>체크 표시</b>로 마감 전 누락 여부를 확인합니다</>],
      use: ["처음 공공 입찰에 참가하는 업체", "체크리스트대로 서류를 모으고, 빠진 항목만 다시 확인합니다."],
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
                <span className={`min-w-0 flex-1 ${i < 3 ? "text-ink-400 line-through" : "font-medium"}`}>{d.name}</span>
                {d.note && <span className="hidden max-w-[45%] text-right text-xs text-ink-300 sm:block">{d.note}</span>}
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
              <div key={k} className="min-w-0 rounded-xl bg-paper p-3">
                <dt className="text-[11px] text-ink-400">{k}</dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
    {
      label: "평가점수 예측",
      title: "적격심사·협상 공고의 예상 점수와 투찰률을 미리 계산합니다",
      desc: "공고 첨부의 배점표와 공고서 기준을 읽고 귀사 실적·경영상태·신뢰도 가감점을 넣어 항목별 예상 점수를 냅니다. 같은 사업의 과거 낙찰률과 참가 예상 기업까지 함께 봅니다.",
      href: "/premium",
      cta: "나라장터 예측 열기",
      preview: (
        <div className="rounded-2xl bg-white p-5 shadow-lift">
          <p className="text-xs text-ink-400">{featured.demandAgency}</p>
          <p className="mt-1 font-bold">{featured.title}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["기초금액", won(featured.baseAmount)],
              ["낙찰하한율", featured.lowerLimitRate ? `${featured.lowerLimitRate}%` : "해당 없음"],
              ["예상 투찰 범위", `${won(guide.low)} ~ ${won(guide.high)}`],
            ].map(([k, v], n) => (
              <div key={k} className={`min-w-0 rounded-xl bg-paper p-3 ${n === 2 ? "col-span-2" : ""}`}>
                <dt className="text-[11px] text-ink-400">{k}</dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums [overflow-wrap:anywhere]">{v}</dd>
              </div>
            ))}
          </dl>
          <ol className="mt-4 space-y-1.5 text-sm text-ink-500">
            {["공고 첨부 배점표·공고서 기준 판독", "실적·경영상태·신뢰도 가감점 입력", "항목별 예상 점수와 투찰률 산출"].map((t, n) => (
              <li key={t} className="flex gap-2.5"><span className="font-bold tabular-nums text-mint-600">0{n + 1}</span>{t}</li>
            ))}
          </ol>
        </div>
      ),
    },
    {
      label: "아파트 공고",
      title: "아파트 청소·경비·위탁관리 입찰도 함께 봅니다",
      desc: "공동주택관리정보시스템(K-apt)의 아파트 입찰공고를 업종별로 모으고, 같은 단지의 직전 낙찰·수의계약 금액과 예상 낙찰금액을 붙여 드립니다.",
      href: "/apt-bids",
      cta: "아파트 공고 열기",
      preview: (
        <div className="space-y-2">
          {aptSamples.length ? aptSamples.map((b) => (
            <Link key={b.no} href={aptBidHref(b.no)} className="block rounded-2xl bg-white p-4 shadow-card transition hover:shadow-lift">
              <p className="text-xs text-ink-400">{b.apt} · {b.region} · {b.category}</p>
              <p className="mt-1 font-semibold leading-snug">{b.title}</p>
              <p className="mt-1.5 text-xs text-ink-500">
                마감 {b.closeAt.slice(0, 10)}
                {b.prior && b.prior.amount > 0 && <> · 직전 {b.prior.via ?? "낙찰"} <b className="text-ink">{won(b.prior.amount)}</b></>}
              </p>
            </Link>
          )) : (
            <div className="rounded-2xl bg-white p-5 text-sm text-ink-500 shadow-card">아파트 공고는 매일 새로 받아 업종별로 보여 드립니다.</div>
          )}
        </div>
      ),
    },
  ];

  const ANALYSIS: { tag: string; t: string; d: string; href: string; n?: number; unit?: string }[] = [
    { tag: "낙찰", t: "최근 낙찰 결과", d: "최근 한 달 최종낙찰 업체와 개찰 순위, 사정율을 봅니다.", href: "/awards", n: recent?.rows.length, unit: "최근 한 달" },
    { tag: "발주처", t: "발주처 분석", d: "수요기관별 낙찰률·사정율 분포와 자주 낙찰받는 업체를 봅니다.", href: "/analysis/agency" },
    { tag: "경쟁사", t: "경쟁사 투찰 성향", d: "경쟁사가 주로 쓰는 사정율 구간과 주요 발주처를 확인합니다.", href: "/analysis/rival" },
    { tag: "우리 회사", t: "우리 회사 진단", d: "사업자번호 하나로 10년치 낙찰을 발주처·지역·금액별로 나누고 사정율 습관을 진단합니다.", href: "/analysis/mine" },
    { tag: "사전 준비", t: "발주계획", d: "기관이 미리 올린 넉 달 치 발주 예정 사업을 업종별로 모았습니다.", href: "/plans", n: plans.length, unit: "발주 예정" },
    { tag: "사전 준비", t: "사전규격 미리보기", d: "본공고 전에 공개된 규격으로 준비 기간을 먼저 확보합니다.", href: "/prespecs", n: preSpecs.length, unit: "최근 2주" },
    { tag: "계약", t: "계약현황", d: "최근 2주 계약업체·계약금액·계약기간을 발주처별로 봅니다.", href: "/contracts", n: contracts.length, unit: "최근 2주" },
    { tag: "알림", t: "정정·취소 공고", d: "바뀐 마감일·개찰일·금액을 이전 공고와 비교해 보여 드립니다.", href: "/changes", n: changes.length, unit: "최근 2주" },
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
            입찰 특화 알고리즘이 나라장터 전 업종 공고마다 면허·지역·규모를 판정하고 경쟁 강도·실적·준비 기간까지 6개 항목으로 채점해 매일 아침 보내 드립니다. 아파트 관리 입찰은 같은 단지의 직전 낙찰금액과 함께 보여 드립니다.
          </p>
          <HeroStats builtAt={builtAt} notices={awardCount?.notices ?? null} aptNotices={aptNotices} awards={awardCount?.rows ?? null} aptAwards={aptAwards} />
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/apply" className="btn-mint px-7 text-base">무료 체험 시작하기</Link>
            <Link href="/bids" className="btn-ghost px-7 text-base">공고 검색 둘러보기</Link>
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink-400">
            {[<>입찰공고 <TrialN />건 무료 분석</>, "카드 등록 없음", "약정 없음", "조건 등록 3분"].map((t, i) => (
              <li key={i} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-mint" />{t}</li>
            ))}
          </ul>

          <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
            <div className="pointer-events-none absolute -inset-x-10 -bottom-10 top-10 rounded-[48px] bg-gradient-to-b from-mint/20 to-sky/10 blur-3xl" />
            <div className="relative"><ProductMockup cases={cases} /></div>
          </div>
        </div>
      </section>

      {/* 발주기관 마키 (공식 CI가 확인된 기관만) */}
      {agencies.length > 0 && (
      <section className="pt-16">
        <p className="container-x text-center text-sm font-semibold text-ink-400">오늘 수집한 공고의 발주기관</p>
        <div className="relative mt-5 overflow-hidden">
          {/* 양 끝 흐림은 mask-image 대신 흰 그라데이션을 덮는다. 움직이는 층에 mask를 걸면 매 프레임 다시 그려 끊긴다 */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[10%] bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[10%] bg-gradient-to-l from-white to-transparent" />
          {/* 같은 목록을 두 번 이어 붙이고 정확히 절반(-50%)만큼 옮겨 이음매 없이 돈다.
              간격은 gap 대신 항목마다 오른쪽 여백으로 줘야 절반 지점이 딱 맞는다(gap이면 한 바퀴마다 6px 튐) */}
          {/* 속도는 칸 수에 맞춰 정한다: 한 칸(약 260px)에 5초, 초당 약 52px로 천천히 흐른다 */}
          <div className="flex w-max animate-marquee [backface-visibility:hidden] [will-change:transform] motion-reduce:animate-none" style={{ animationDuration: `${agencies.length * 5}s` }}>
            {[...agencies, ...agencies].map((a, i) => (
              <div key={i} className="shrink-0 pr-3" aria-hidden={i >= agencies.length || undefined}>
                <AgencyMark name={a} />
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* 숫자 */}
      <section className="container-x pt-20">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {[
            ["전 업종 수집", "오늘 확인한 공고", bids.length.toLocaleString(), "건"],
            ["알고리즘 판정", "공고당 채점 항목", "6", "개"],
            ["1차 선별", "검토할 공고", `${cut}%`, "감소"],
            ["메일 발송", "영업일 아침", "07:00", ""],
          ].map(([tag, k, v, u]) => (
            <div key={tag} className="min-w-0 rounded-3xl bg-paper p-4 sm:p-7">
              <p className="text-xs font-bold text-mint-600">{tag}</p>
              <p className="mt-1 text-sm text-ink-500">{k}</p>
              <p className="mt-4 whitespace-nowrap text-[clamp(1.5rem,7.2vw,2.25rem)] font-extrabold tracking-tight tabular-nums sm:text-5xl">
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
              <div className={`min-w-0 rounded-[32px] bg-gradient-to-br from-mint-50 via-paper to-sky-100/60 p-4 sm:p-8 ${i % 2 ? "lg:order-2" : ""}`}>{f.visual}</div>
              <div className="min-w-0">
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

      {/* 아파트 관리 입찰 */}
      <section className="container-x pt-10">
        <div className="card grid gap-8 overflow-hidden bg-gradient-to-br from-sky-100/70 via-white to-white p-5 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="min-w-0">
            <p className="eyebrow">아파트 관리 입찰</p>
            <h3 className="mt-3 text-2xl font-extrabold leading-snug tracking-[-0.03em] sm:text-[32px]">아파트 청소·경비·위탁관리 공고도<br className="hidden sm:block" /> 같은 화면에서 봅니다.</h3>
            <p className="mt-4 leading-relaxed text-ink-500">공동주택관리정보시스템(K-apt)에 올라온 아파트 입찰공고를 업종별로 나누고, 같은 단지의 직전 낙찰·수의계약 금액을 찾아 붙입니다. 아파트 예측에서는 직전 계약금액과 지난 낙찰 흐름으로 이번 공고의 예상 낙찰금액 범위를 계산합니다.</p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <Link href="/apt-bids" className="btn-primary">아파트 공고 보기</Link>
              <Link href="/premium/apt" className="btn-ghost">아파트 입찰가격 예측</Link>
            </div>
          </div>
          <div className="min-w-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-card">
                <p className="text-xs text-ink-400">진행 중인 아파트 공고</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums">{aptOpen.length.toLocaleString()}<span className="ml-1 text-sm font-bold text-ink-400">건</span></p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-card">
                <p className="text-xs text-ink-400">직전 낙찰금액 확인</p>
                <p className="mt-1 text-3xl font-extrabold tabular-nums text-mint-600">{aptWithPrior.length.toLocaleString()}<span className="ml-1 text-sm font-bold text-ink-400">건</span></p>
              </div>
            </div>
            {aptCats.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {aptCats.map(({ c, n }) => (
                  <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-700">
                    {c}<span className="text-xs font-bold tabular-nums text-ink-300">{n.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

      {/* 입찰 분석 메뉴 */}
      <section className="container-x pt-28">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">입찰 분석</p>
            <h2 className="h-section mt-3">공고 밖의 흐름까지<br className="sm:hidden" /> 숫자로 봅니다.</h2>
          </div>
          <p className="max-w-md text-ink-500">2016년부터 쌓은 낙찰 기록과 발주계획·사전규격·계약 정보로 발주처와 경쟁사의 움직임을 미리 읽습니다.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ANALYSIS.map((a) => (
            <Link key={a.href} href={a.href} className="card group flex min-w-0 flex-col p-5 transition hover:border-mint hover:shadow-lift">
              <p className="text-xs font-bold text-mint-600">{a.tag}</p>
              <p className="mt-1.5 text-lg font-bold group-hover:text-mint-600">{a.t}</p>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500">{a.d}</p>
              {a.n !== undefined && a.n > 0 && <p className="mt-4 text-sm text-ink-400">{a.unit} <b className="tabular-nums text-ink">{a.n.toLocaleString()}</b>건</p>}
            </Link>
          ))}
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
              <p className="mt-6 border-t border-ink-100 pt-4 text-sm text-ink-400">자주 쓰는 기능 <b className="text-ink">{p.use}</b></p>
            </div>
          ))}
        </div>
      </section>

      {/* 요금제 */}
      <section className="container-x pt-28">
        <div className="text-center">
          <p className="eyebrow">요금제</p>
          <h2 className="h-section mt-3">입찰 담당자 한 명 인건비의 일부로.</h2>
          <p className="mt-4 text-ink-500">월간 이용권 월 <Price k="lite" />원부터 · VAT 포함 · 낙찰 성공보수 없음 · 무료 체험 입찰공고 <TrialN />건</p>
        </div>
        <div className="mt-12">
          <PricingCards />
        </div>
        <p className="mt-6 text-center"><Link href="/pricing" className="font-semibold text-mint-600">요금·환불 기준 자세히 보기</Link></p>
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
              <p className="mt-5 max-w-lg text-ink-300">조건을 남겨 주시면 지금 참가 가능한 공고 목록을 바로 보여드리고, 그중 입찰공고 <TrialN />건은 평가점수 예측으로 무료 분석해 보실 수 있습니다.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/apply" className="btn-mint px-7 text-base">무료 체험 시작하기</Link>
                <Link href="/pricing" className="btn-glass px-7 text-base">요금제 보기</Link>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-300">
                {["약정 없음", "카드 등록 없음", <>입찰공고 <TrialN />건 무료</>].map((t, i) => (
                  <li key={i} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-mint-400" />{t}</li>
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
