import { Brand } from "@/components/BrandText";
import type { Metadata } from "next";
import Link from "next/link";
import { TrialN } from "@/components/Cfg";
import { EngineName } from "@/components/EngineName";
import { ENGINE_LIST, type EngineId } from "@/lib/engines";
import { getAptBids, getBids, getNuriBids } from "@/lib/store";

export const metadata: Metadata = { title: "서비스 소개" };
export const revalidate = 600;

/** 엔진마다 대표 메뉴 (상단 메뉴와 같은 이름·주소) */
const MENUS: Record<EngineId, { t: string; href: string }[]> = {
  finder: [
    { t: "나라장터 공고", href: "/bids" },
    { t: "공동주택 입찰공고", href: "/apt-bids" },
    { t: "누리장터 공고", href: "/nuri-bids" },
    { t: "정정·취소 공고", href: "/changes" },
    { t: "발주계획", href: "/plans" },
  ],
  atlas: [
    { t: "최근 낙찰 결과", href: "/awards" },
    { t: "발주처 분석", href: "/analysis/agency" },
    { t: "업종별 분석", href: "/analysis/industry" },
    { t: "경쟁사 투찰 성향", href: "/analysis/rival" },
    { t: "우리 회사 진단", href: "/analysis/mine" },
  ],
  insight: [
    { t: "나라장터 입찰 예측", href: "/premium" },
    { t: "공동주택 입찰 예측", href: "/premium/apt" },
    { t: "누리장터 입찰 예측", href: "/premium/nuri" },
  ],
};

/** 엔진 카드 한 줄 설명 (서비스 페이지용으로 짧게) */
const SHORT: Record<EngineId, string> = {
  finder: "세 곳의 전 업종 공고를 영업일 하루 세 번 받아, 귀사 면허·지역·규모로 참가할 수 있는 공고만 골라 드립니다.",
  atlas: "10년간의 낙찰 기록으로 발주처·업종·경쟁사의 사정율과 낙찰 흐름을 숫자로 봅니다.",
  insight: "공고 첨부를 모두 읽어 배점표를 판독하고, 예상 평가점수와 예상 예정가격, 직전 낙찰을 한 화면에 냅니다.",
};

const PRINCIPLES = [
  { t: "공공데이터 원본 그대로", d: "공공데이터포털로 공개되는 공고·낙찰 데이터를 받아 씁니다." },
  { t: "공고 표가 기준", d: "공고서 기준을 먼저 따르고, 추정한 값은 추정이라고 표시합니다." },
  { t: "결정은 귀사가 직접", d: "판단에 필요한 숫자를 드리고, 참가와 투찰은 귀사가 정합니다." },
  { t: "필요한 정보만", d: "사업자번호와 업종·지역 조건만으로 시작합니다." },
];

export default async function ServicePage() {
  const builtAt = Date.now();
  const [bids, apt, nuri] = await Promise.all([getBids(), getAptBids(), getNuriBids()]);
  const open = (closeAt: string) => new Date(closeAt).getTime() > builtAt;
  const sources = [
    { name: "나라장터", d: "용역·공사·물품 공고, 낙찰 기록 2016년부터", n: bids.filter((b) => open(b.closeAt)).length, href: "/bids" },
    { name: "K-apt 공동주택", d: "아파트 관리·공사 입찰, 낙찰 기록 2013년부터", n: apt.items.filter((b) => open(b.closeAt)).length, href: "/apt-bids" },
    { name: "누리장터", d: "민간 기업·조합·법인 입찰과 첨부 배점표", n: nuri.items.filter((b) => open(b.closeAt)).length, href: "/nuri-bids" },
  ];

  return (
    <>
      <section className="px-2 sm:px-3">
        <div className="relative overflow-hidden rounded-[28px] bg-ink-950 text-white sm:rounded-[36px]">
          <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-mint/20 blur-3xl" />
          <div className="container-x relative py-14 sm:py-20">
            <h1 className="max-w-4xl text-4xl font-extrabold leading-[1.15] tracking-[-0.04em] sm:text-[52px]">
              공고를 찾고, 흐름을 읽고,<br /><span className="text-mint-400">점수를 계산해서 예측합니다.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-300">
              <Brand tail="매트릭스" dark />는 입찰공고와 10년간의 낙찰 기록을 분석하는 입찰 분석 정보 서비스입니다. 참가 여부와 투찰 금액을 정하는 데 필요한 숫자와 근거를 공고마다 정리해 드립니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-mint">무료 체험</Link>
              <Link href="/pricing" className="btn border border-white/20 bg-white/5 text-white hover:border-white/40">요금제 보기</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-x pt-16">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {ENGINE_LIST.map((e) => (
            <div key={e.id} className="card flex min-w-0 flex-col p-6">
              <p className="text-3xl font-extrabold tracking-[-0.03em] sm:text-[34px]"><EngineName id={e.id} /></p>
              <p className="mt-1 text-sm font-bold text-ink-700">{e.area}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">{SHORT[e.id]}</p>
              <ul className="mt-5 flex-1 divide-y divide-ink-100 border-t border-ink-100 text-sm">
                {MENUS[e.id].map((m) => (
                  <li key={m.href}><Link href={m.href} className="block py-2.5 font-semibold hover:text-mint-600">{m.t}</Link></li>
                ))}
              </ul>
              <Link href={e.href} className="mt-5 text-sm font-bold text-mint-600 underline-offset-4 hover:underline">{e.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pt-16">
        <div className="rounded-[28px] bg-paper p-6 sm:p-10">
          <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">하루 세 번! 새로운 공고를 업데이트 합니다.</h2>
          <p className="mt-2 text-ink-500">06:40 · 11:40 · 16:40에 공고를 받고, 맞춤 공고는 영업일 아침 메일로 보내 드립니다.</p>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {sources.map((s) => (
              <Link key={s.name} href={s.href} className="group min-w-0 rounded-2xl bg-white p-5 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-extrabold group-hover:text-mint-600">{s.name}</p>
                  {s.n > 0 && <span className="shrink-0 text-xs text-ink-400">마감 전 <b className="tabular-nums text-ink">{s.n.toLocaleString("ko-KR")}</b>건</span>}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.d}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-x pt-16">
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map(({ t, d }) => (
            <div key={t} className="min-w-0 border-t-2 border-ink py-5">
              <p className="font-bold">{t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-2 py-16 sm:px-3">
        <div className="rounded-[28px] bg-ink-950 text-white sm:rounded-[36px]">
          <div className="container-x flex flex-col justify-between gap-6 py-12 lg:flex-row lg:items-center">
            <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-4xl">입찰공고 <TrialN />건은 무료로 먼저 분석해 보세요.</h2>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-mint">무료 체험</Link>
              <Link href="/pricing" className="btn border border-white/20 bg-white/5 text-white hover:border-white/40">요금제 보기</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
