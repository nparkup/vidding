import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileSearch,
  FileText,
  Filter,
  Inbox,
  LineChart,
  Mail,
  Sparkles,
  UserRoundX,
  X,
} from "lucide-react";
import { HeroCity } from "@/components/art/HeroCity";
import { CleaningArt, FacilityArt, PestArt, SecurityArt } from "@/components/art/Industry";
import { GradeBadge, ScoreBar } from "@/components/Badges";
import { MatchDemo } from "@/components/MatchDemo";
import { evaluate } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { dday, won } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";
import type { ServiceCategory } from "@/lib/types";

export const revalidate = 600;

const INDUSTRIES: { cat: ServiceCategory; t: string; d: string; Art: typeof CleaningArt }[] = [
  { cat: "청소", t: "청소·미화", d: "청사·학교·병원 환경미화, 건물위생관리", Art: CleaningArt },
  { cat: "시설관리", t: "시설·설비 관리", d: "기계설비·소방·전기 유지관리, 저수조", Art: FacilityArt },
  { cat: "경비", t: "경비·주차", d: "시설경비, 주차관리, 안내·보안 용역", Art: SecurityArt },
  { cat: "방역·소독", t: "방역·소독", d: "소독, 해충 방제, 감염병 예방 방역", Art: PestArt },
];

const PAINS = [
  { Icon: Inbox, t: "너무 많은 공고", d: "하루에도 수백 건의 용역 공고가 올라옵니다. 그중 우리 회사가 참가할 수 있는 건 몇 건 되지 않습니다." },
  { Icon: FileSearch, t: "읽기 어려운 공고문", d: "지역제한, 면허, 중소기업 제한, 적격심사 기준까지 공고문과 첨부파일을 하나하나 열어봐야 합니다." },
  { Icon: UserRoundX, t: "담당자가 없는 현실", d: "현장 관리로 바쁜 중소업체는 입찰만 전담할 사람이 없어 좋은 공고를 놓치기 일쑤입니다." },
];

const COMPARE = [
  ["공고 탐색", "직접 키워드 검색, 수백 건 확인", "조건에 맞는 공고만 매일 배달"],
  ["업종 범위", "공사·물품·용역 전 업종", "청소·시설관리·경비·방역 전문"],
  ["참가 가능 여부", "공고문을 열어 직접 판단", "면허·지역·규모 자동 판정"],
  ["준비 서류", "공고문·규정을 직접 해석", "계약방법별 체크리스트 제공"],
  ["입찰 판단", "투찰가 분석 위주", "가능성 점수 + 준비 기간 + 경쟁 강도"],
  ["담당 인력", "고객사 직원이 직접", "입찰파트너 전담 매니저"],
];

const FAQ = [
  { q: "프로그램을 설치하거나 매일 접속해야 하나요?", a: "아닙니다. 조건만 한 번 등록하시면 영업일마다 이메일로 받아 보시면 됩니다. 필요할 때만 웹에서 공고 분석을 열어보시면 됩니다." },
  { q: "공고 데이터는 어디서 오나요?", a: "조달청 나라장터가 공공데이터포털로 공개하는 입찰공고·낙찰·사전규격 정보를 매일 수집해 분석합니다." },
  { q: "입찰 가능성 점수는 어떻게 계산하나요?", a: "면허·지역·규모 적합 여부를 먼저 판정한 뒤, 과거 유사 공고의 참여업체 수, 귀사 실적 대비 규모, 남은 준비 기간을 반영해 100점 만점으로 산출합니다." },
  { q: "입찰 대리 투찰도 해주나요?", a: "투찰은 관련 법령상 귀사가 직접 하셔야 합니다. 입찰파트너는 공고 발굴, 조건 검토, 서류 준비 가이드를 대신해 드립니다." },
];

export default async function Home() {
  const bids = await getBids();
  const sampleClient = SEED_CLIENTS[0];
  const digest = buildDigest(sampleClient, bids);
  const featured = digest.recommended[0]?.bid ?? bids[0];
  const featuredEval = evaluate(featured, sampleClient);
  const top = digest.recommended[0];
  const catCount = (c: ServiceCategory) => bids.filter((b) => b.category === c || (c === "시설관리" && b.category === "통합관리")).length;

  return (
    <>
      {/* HERO */}
      <section className="px-2 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 text-white sm:rounded-[36px]">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-mint/20 blur-[120px]" />
          <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-sky/20 blur-[120px]" />

          <div className="container-x relative grid items-center gap-6 pb-10 pt-14 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-4 lg:pb-16">
            <div className="animate-fade-up">
              <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-100">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
                </span>
                청소 · 시설관리 · 경비 · 방역 업체 전용 입찰 대행
              </p>
              <h1 className="mt-6 text-[40px] font-extrabold leading-[1.12] tracking-[-0.04em] sm:text-6xl lg:text-[68px]">
                입찰 공고,
                <br />
                이제 찾지 말고
                <br />
                <span className="text-gradient">받아보세요.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-300">
                입찰파트너가 귀사의 입찰 담당자가 되어 드립니다. 면허·지역·규모에 맞는 나라장터 공고를 매일 골라
                <b className="font-semibold text-white"> 참가조건, 제출서류, 입찰 가능성</b>까지 정리해 아침마다 전달합니다.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/apply" className="btn-mint px-6 text-base">
                  무료 맞춤 진단 받기 <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/bids" className="btn-glass px-6 text-base">오늘의 공고 둘러보기</Link>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-300">
                {["첫 2주 무료", "카드 등록 없음", "조건 등록 3분"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-mint-400" />{t}</li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-[600px]">
              <HeroCity className="w-full" />
              {/* 떠 있는 카드들 */}
              <div className="glass absolute left-0 top-[6%] w-[230px] animate-float rounded-2xl p-3.5 shadow-lift sm:w-[260px]">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint text-white"><Mail className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-ink-300">오전 7:00 · 입찰파트너</p>
                    <p className="truncate text-sm font-semibold">오늘 맞춤 공고 {digest.recommended.length}건 도착</p>
                  </div>
                </div>
              </div>
              {top && (
                <div className="absolute bottom-[4%] right-0 hidden w-[240px] animate-float-slow sm:block rounded-2xl bg-white p-4 text-ink shadow-lift sm:w-[270px]">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-ink-400">입찰 가능성</p>
                    <GradeBadge grade={top.grade} />
                  </div>
                  <p className="mt-1 truncate text-sm font-bold">{top.bid.title}</p>
                  <div className="mt-3 flex items-end gap-3">
                    <p className="text-4xl font-extrabold leading-none tracking-tight text-mint-600">{top.score}</p>
                    <div className="flex-1 pb-1"><ScoreBar value={top.score} max={100} /></div>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-400">{won(top.bid.baseAmount)} · 마감 {dday(top.daysLeft)}</p>
                </div>
              )}
              {digest.closingSoon.length > 0 && (
                <div className="absolute right-[30%] top-[4%] hidden rotate-3 rounded-full bg-coral px-3 py-1.5 text-xs font-bold text-white shadow-lift sm:block">
                  3일 내 마감 {digest.closingSoon.length}건
                </div>
              )}
            </div>
          </div>

          {/* 숫자 */}
          <div className="relative border-t border-white/10">
            <div className="container-x grid grid-cols-2 divide-white/10 md:grid-cols-4 md:divide-x">
              {[
                ["5단계", "면허·지역·규모·경쟁·기간 선별"],
                ["07:00", "영업일 아침 정시 발송"],
                ["17개", "시·도 지역제한 자동 판정"],
                ["4종", "나라장터 공공데이터 연동"],
              ].map(([k, v]) => (
                <div key={k} className="px-2 py-6 text-center md:py-8">
                  <p className="text-2xl font-extrabold tracking-tight sm:text-3xl">{k}</p>
                  <p className="mt-1 text-xs text-ink-300 sm:text-sm">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="container-x pt-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">전문 업종</p>
            <h2 className="h-section mt-3">네 가지 업종만,<br className="sm:hidden" /> 깊게 봅니다.</h2>
          </div>
          <p className="max-w-sm text-ink-500">공사·물품까지 다 보여주는 포털과 달리, 청소·시설관리 업체가 실제로 참가하는 용역 공고만 다룹니다.</p>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {INDUSTRIES.map(({ cat, t, d, Art }) => (
            <Link key={cat} href={`/bids?cat=${encodeURIComponent(cat)}`} className="group card overflow-hidden p-0 transition hover:-translate-y-1 hover:shadow-lift">
              <div className="bg-gradient-to-b from-paper to-white px-2 pt-2 sm:px-4 sm:pt-4">
                <Art className="w-full transition duration-500 group-hover:scale-[1.04]" />
              </div>
              <div className="p-4 pt-1 sm:p-5 sm:pt-2">
                <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-bold sm:text-lg">{t}</p>
                  <span className="rounded-full bg-mint-50 px-2.5 py-1 text-xs font-bold text-mint-600">공고 {catCount(cat)}건</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-500 sm:text-sm">{d}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* PROBLEM + COMPARE */}
      <section className="container-x py-24">
        <div className="text-center">
          <p className="eyebrow">왜 입찰파트너인가요</p>
          <h2 className="h-section mt-3">입찰정보 사이트는 많은데,<br />왜 여전히 힘들까요?</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PAINS.map(({ Icon, t, d }) => (
            <div key={t} className="rounded-3xl bg-paper p-7">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-coral shadow-card"><Icon className="h-6 w-6" /></span>
              <p className="mt-5 text-lg font-bold">{t}</p>
              <p className="mt-2 leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-ink-100 p-7">
            <p className="text-sm font-semibold text-ink-400">일반 입찰정보 포털</p>
            <ul className="mt-5 space-y-4">
              {COMPARE.map(([k, a]) => (
                <li key={k} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-400"><X className="h-3 w-3" /></span>
                  <div><p className="text-xs font-semibold text-ink-400">{k}</p><p className="text-ink-500">{a}</p></div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-ink p-7 text-white">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-mint/25 blur-3xl" />
            <p className="relative flex items-center gap-2 text-sm font-semibold text-mint-400"><Sparkles className="h-4 w-4" />입찰파트너</p>
            <ul className="relative mt-5 space-y-4">
              {COMPARE.map(([k, , b]) => (
                <li key={k} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-mint text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
                  <div><p className="text-xs font-semibold text-ink-300">{k}</p><p className="font-semibold">{b}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section className="px-2 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-900 py-20 text-white sm:rounded-[36px] sm:py-24">
          <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[720px] -translate-x-1/2 rounded-full bg-mint/20 blur-[120px]" />
          <div className="container-x relative">
            <div className="text-center">
              <p className="glass inline-flex rounded-full px-3 py-1.5 text-[13px] font-semibold text-mint-300">30초 체험</p>
              <h2 className="h-section mt-4">우리 회사 조건이면,<br className="sm:hidden" /> 지금 몇 건이나 될까요?</h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-300">면허와 지역, 규모를 골라 보세요. 입찰파트너가 매일 하는 1차 선별을 실제 공고로 그대로 체험할 수 있습니다.</p>
            </div>
            <div className="mx-auto mt-12 max-w-5xl text-ink">
              <MatchDemo bids={bids} />
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES — 벤토 그리드 */}
      <section className="container-x py-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">포함된 서비스</p>
            <h2 className="h-section mt-3">찾고, 거르고, 정리하는 일은<br />저희가 합니다.</h2>
          </div>
          <Link href="/service" className="group inline-flex items-center gap-1 font-semibold text-mint-600">
            서비스 자세히 보기 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-6">
          {/* 1. 메일 */}
          <div className="card relative overflow-hidden p-7 md:col-span-4 md:row-span-2">
            <div className="flex items-center gap-2">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-white"><BellRing className="h-5 w-5" /></span>
              <span className="chip">매일</span>
            </div>
            <p className="mt-5 text-2xl font-bold tracking-tight">매일 아침 맞춤 공고 요약 이메일</p>
            <p className="mt-2 max-w-md leading-relaxed text-ink-500">영업일 오전 7시, 오늘 볼 공고만 골라 메일로 보내 드립니다. 나라장터에 접속할 필요가 없습니다.</p>
            <div className="mt-7 rounded-2xl border border-ink-100 bg-paper p-2 sm:p-3">
              <div className="rounded-xl bg-white p-4 shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-400">
                  <span>받은편지함 · 오전 7:00</span>
                  <span className="rounded-full bg-mint-50 px-2 py-0.5 font-bold text-mint-600">새 메일</span>
                </div>
                <p className="mt-2 text-sm font-bold">[입찰파트너] {sampleClient.company} 맞춤 공고 {digest.recommended.length}건</p>
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
            </div>
          </div>

          {/* 2. 선별 */}
          <div className="card p-7 md:col-span-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky"><Filter className="h-5 w-5" /></span>
            <p className="mt-5 text-lg font-bold">면허·지역·금액 1차 선별</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">보유 면허, 참가 가능 지역, 수행 가능 규모가 안 맞는 공고는 처음부터 걸러냅니다.</p>
            <div className="mt-5 flex items-center gap-2 text-sm">
              <span className="rounded-lg bg-paper px-2.5 py-1.5 font-bold tabular-nums text-ink-400 line-through">{bids.length}건</span>
              <ArrowRight className="h-4 w-4 text-ink-300" />
              <span className="rounded-lg bg-mint px-2.5 py-1.5 font-bold tabular-nums text-white">{digest.recommended.length}건</span>
            </div>
          </div>

          {/* 3. 참가조건 */}
          <div className="card p-7 md:col-span-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-[#B7741A]"><CalendarClock className="h-5 w-5" /></span>
            <p className="mt-5 text-lg font-bold">참가조건·마감일 정리</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">지역제한, 중소기업 제한, 공동도급, 현장설명회, 낙찰하한율까지 한 장으로 요약합니다.</p>
          </div>

          {/* 4. 체크리스트 */}
          <div className="card p-7 md:col-span-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint-50 text-mint-600"><ClipboardCheck className="h-5 w-5" /></span>
                <p className="mt-5 text-lg font-bold">제출서류 체크리스트</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">계약방법별로 필요한 서류와 발급처, 유효기간 주의사항을 정리해 드립니다.</p>
              </div>
              <ul className="hidden w-44 shrink-0 space-y-2 rounded-2xl bg-paper p-3 text-xs sm:block">
                {["입찰참가신청서", "사업자등록증", "면허(등록)증 사본", "실적증명서"].map((t, i) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className={`grid h-4 w-4 place-items-center rounded ${i < 3 ? "bg-mint text-white" : "border border-ink-200 bg-white"}`}>{i < 3 && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                    <span className={i < 3 ? "text-ink-400 line-through" : "font-semibold"}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 5. 주간 보고서 */}
          <Link href="/report/sample" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-mint to-mint-700 p-7 text-white md:col-span-3">
            <div className="pointer-events-none absolute -bottom-10 -right-6 flex h-32 items-end gap-2 opacity-30">
              {[40, 70, 52, 96, 80, 120].map((h, i) => <span key={i} className="w-6 rounded-t-lg bg-white" style={{ height: h }} />)}
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><LineChart className="h-5 w-5" /></span>
            <p className="mt-5 text-lg font-bold">주 1회 주요 공고 분석보고서</p>
            <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-white/85">이번 주 꼭 볼 공고, 발주 동향, 입찰 가능성 순위를 정리한 보고서를 매주 보내 드립니다.</p>
            <p className="relative mt-5 inline-flex items-center gap-1 text-sm font-semibold">샘플 보고서 보기 <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></p>
          </Link>
        </div>
      </section>

      {/* ANALYSIS PREVIEW */}
      <section className="overflow-hidden bg-paper py-24">
        <div className="container-x grid items-center gap-14 lg:grid-cols-2">
          <div>
            <p className="eyebrow">공고 분석 미리보기</p>
            <h2 className="h-section mt-3">들어갈지 말지,<br />숫자로 먼저 보여드립니다.</h2>
            <p className="lead mt-5">
              모든 추천 공고에는 입찰 가능성 점수가 붙습니다. 왜 이 점수인지 항목별로 설명하기 때문에, 회의 없이도 참가 여부를 빠르게 결정할 수 있습니다.
            </p>
            <ul className="mt-6 space-y-3">
              {["면허·지역·규모 적합 여부를 먼저 판정", "유사 공고 경쟁 강도와 실적 대비 규모 반영", "남은 준비 기간까지 고려한 100점 만점 점수"].map((t) => (
                <li key={t} className="flex items-center gap-3 text-ink-700">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-mint-100 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                  {t}
                </li>
              ))}
            </ul>
            <Link href={`/bids/${featured.id}`} className="btn-primary mt-9">이 공고 전체 분석 보기 <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-gradient-to-tr from-mint-100 via-white to-sky-100 opacity-80 blur-2xl" />
            <div className="card relative p-7 shadow-lift">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-400">{featured.demandAgency}</p>
                  <p className="mt-1 font-bold">{featured.title}</p>
                  <p className="mt-1 text-sm text-ink-500">기초금액 {won(featured.baseAmount)} · {featured.contractMethod}</p>
                </div>
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#12B886 ${featuredEval.score * 3.6}deg, #E5E9F0 0)` }}>
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-white">
                    <p className="text-2xl font-extrabold text-mint-600">{featuredEval.score}</p>
                  </div>
                </div>
              </div>
              <div className="mt-2"><GradeBadge grade={featuredEval.grade} /></div>
              <ul className="mt-6 space-y-4">
                {featuredEval.factors.map((f) => (
                  <li key={f.label}>
                    <div className="mb-1.5 flex justify-between gap-3 text-sm">
                      <span className="font-semibold">{f.label}</span>
                      <span className="truncate text-ink-500">{f.note}</span>
                    </div>
                    <ScoreBar value={f.score} max={f.max} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="container-x py-24">
        <div className="text-center">
          <p className="eyebrow">이용 방법</p>
          <h2 className="h-section mt-3">3분 등록, 다음 날 아침부터.</h2>
        </div>
        <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-ink-100 md:block" />
          {[
            { Icon: FileText, t: "조건 등록", d: "보유 면허, 영업 지역, 수행 가능한 용역 규모, 최근 실적을 알려 주세요." },
            { Icon: Filter, t: "매일 선별·분석", d: "나라장터 신규 공고를 수집해 조건에 맞는 공고만 고르고 참가조건·서류를 정리합니다." },
            { Icon: Mail, t: "받아보고 결정", d: "아침 메일로 확인하고, 관심 공고만 표시하면 서류 준비를 함께 도와드립니다." },
          ].map(({ Icon, t, d }, i) => (
            <li key={t} className="relative text-center">
              <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-mint-600 shadow-lift ring-1 ring-ink-100">
                <Icon className="h-7 w-7" />
                <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
              </span>
              <p className="mt-5 text-lg font-bold">{t}</p>
              <p className="mx-auto mt-2 max-w-xs leading-relaxed text-ink-500">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PRICING TEASER + FAQ */}
      <section className="container-x grid gap-12 pb-24 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow">투명한 요금</p>
          <h2 className="h-section mt-3">입찰 담당자 한 명<br />인건비의 일부로.</h2>
          <div className="mt-8 space-y-3">
            {PLANS.map((p) => (
              <Link key={p.id} href={`/pricing`} className={`flex items-center justify-between rounded-2xl border px-5 py-4 transition hover:border-ink-300 ${p.highlight ? "border-mint bg-mint-50" : "border-ink-100"}`}>
                <span>
                  <b>{p.name}</b>
                  {p.highlight && <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-white">추천</span>}
                  <span className="block text-sm text-ink-500">{p.tagline}</span>
                </span>
                <span className="shrink-0 font-extrabold tabular-nums">월 {(p.price / 10000).toFixed(1).replace(/\.0$/, "")}만원</span>
              </Link>
            ))}
          </div>
          <Link href="/pricing" className="btn-ghost mt-5">요금제 자세히 비교</Link>
        </div>
        <div>
          <p className="eyebrow">자주 묻는 질문</p>
          <div className="mt-6 space-y-3">
            {FAQ.map((f, i) => (
              <details key={f.q} className="group rounded-2xl bg-paper px-6 py-5 open:bg-white open:shadow-card open:ring-1 open:ring-ink-100" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-ink-400 transition group-open:rotate-45 group-open:bg-mint group-open:text-white">＋</span>
                </summary>
                <p className="mt-3 leading-relaxed text-ink-500">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-2 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-mint-600 via-mint-700 to-ink-900 text-white sm:rounded-[36px]">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="container-x relative grid items-center gap-8 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl sm:leading-[1.15]">내일 아침,<br />첫 맞춤 공고를 받아보세요.</h2>
              <p className="mt-5 max-w-lg text-white/80">조건을 알려주시면 담당 매니저가 지금 참가 가능한 공고 목록과 함께 무료 진단 결과를 보내 드립니다.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/apply" className="btn bg-white px-6 text-base text-ink hover:bg-mint-50">무료 진단 신청 <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/report/sample" className="btn-glass px-6 text-base">보고서 샘플 보기</Link>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="glass rounded-3xl p-5">
                {digest.recommended.slice(0, 3).map((r, i) => (
                  <div key={r.bid.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-lift ${i ? "mt-3" : ""}`} style={{ marginLeft: i * 18 }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-mint-50 text-mint-600"><Mail className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.bid.title}</span>
                      <span className="text-xs text-ink-400">{r.bid.demandAgency} · {dday(r.daysLeft)}</span>
                    </span>
                    <GradeBadge grade={r.grade} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
