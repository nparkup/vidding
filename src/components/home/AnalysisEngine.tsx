import type { Bid } from "@/lib/types";
import { bidPriceGuide, type MatchResult } from "@/lib/analysis";
import { won } from "@/lib/format";

/** 입찰 분석 엔진: 실제 채점 로직(가중치·등급 기준)과 대표 공고의 채점 과정을 그대로 보여준다 */

const WEIGHTS = [
  { k: "면허 요건", w: 30, hard: true, d: "투찰가능업종과 보유 면허 대조" },
  { k: "참가 지역", w: 20, hard: true, d: "공고 지역제한과 소재지 대조" },
  { k: "사업 규모", w: 15, hard: true, d: "기초금액과 수행 가능 범위, 공동도급 여부" },
  { k: "경쟁 강도", w: 15, hard: false, d: "유사 공고 평균 참여업체 수" },
  { k: "실적·신용", w: 10, hard: false, d: "기초금액 대비 유사실적 비율" },
  { k: "준비 기간", w: 10, hard: false, d: "마감까지 남은 일수" },
];

const GRADES = [
  { g: "제외", from: 0, to: 39, c: "bg-ink-700 text-ink-300" },
  { g: "C", from: 40, to: 57, c: "bg-ink-500 text-white" },
  { g: "B", from: 58, to: 71, c: "bg-sky text-white" },
  { g: "A", from: 72, to: 84, c: "bg-mint-600 text-white" },
  { g: "S", from: 85, to: 100, c: "bg-mint text-white" },
];

const PIPELINE = [
  ["수집", "나라장터 공고 원문을 공공데이터포털에서 영업일 3회 받습니다."],
  ["구조화", "면허·지역·기초금액·계약방법·마감일을 항목별 데이터로 나눕니다."],
  ["필수 조건 판정", "면허·지역·규모 3개 조건 중 하나라도 맞지 않으면 즉시 제외합니다."],
  ["가중 채점", "6개 항목을 가중치대로 더해 100점 만점 점수를 냅니다."],
  ["등급·가이드", "S·A·B·C 등급과 투찰 금액 범위를 붙여 전달합니다."],
];

export function AnalysisEngine({ bid, ev, total }: { bid: Bid; ev: MatchResult; total: number }) {
  const price = bidPriceGuide(bid);
  return (
    <section className="px-2 pt-24 sm:px-3">
      <div className="relative overflow-hidden rounded-[28px] bg-ink-950 py-20 text-white sm:rounded-[36px] sm:py-24">
        <div className="bg-grid mask-fade pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-mint/20 blur-[110px]" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-sky/20 blur-[110px]" />
        <div className="container-x relative">
          <div className="max-w-3xl">
            <p className="text-sm font-bold tracking-wide text-mint-400">입찰 특화 분석 엔진</p>
            <h2 className="h-section mt-3">공고 한 건마다 6개 항목,<br />100점 만점으로 정밀 채점합니다.</h2>
            <p className="mt-5 text-base leading-relaxed text-ink-300 sm:text-lg">
              면허·지역·규모 3개 필수 조건을 먼저 판정하고, 통과한 공고만 경쟁 강도·실적·준비 기간을 가중해 점수와 등급을 매깁니다.
              모든 점수는 항목별 근거와 함께 공개됩니다.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
            {/* 가중치 + 등급 기준 */}
            <div className="glass rounded-3xl p-6 sm:p-7">
              <div className="flex items-baseline justify-between">
                <p className="font-bold">채점 가중치</p>
                <p className="text-xs tabular-nums text-ink-300">합계 100점</p>
              </div>
              <ul className="mt-5 space-y-4">
                {WEIGHTS.map((x) => (
                  <li key={x.k}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 font-semibold">
                        {x.k}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${x.hard ? "bg-coral/20 text-coral-100" : "bg-white/10 text-ink-200"}`}>{x.hard ? "필수" : "가중"}</span>
                      </span>
                      <span className="font-bold tabular-nums text-mint-300">{x.w}점</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className={`h-full rounded-full ${x.hard ? "bg-mint" : "bg-sky"}`} style={{ width: `${(x.w / 30) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-ink-300">{x.d}</p>
                  </li>
                ))}
              </ul>

              <p className="mt-8 font-bold">등급 기준</p>
              <div className="mt-3 flex overflow-hidden rounded-xl text-center text-xs font-bold">
                {GRADES.map((g) => (
                  <div key={g.g} className={`py-2 ${g.c}`} style={{ width: `${g.to - g.from + 1}%` }}>
                    {g.g}
                  </div>
                ))}
              </div>
              <div className="relative mt-1.5 h-4 text-[10px] tabular-nums text-ink-300">
                {[0, 58, 72, 85, 100].map((n) => (
                  <span key={n} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${n}%` }}>{n}</span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-300">필수 조건을 하나라도 충족하지 못한 공고는 점수가 39점으로 제한되고 등급에서 제외됩니다.</p>
            </div>

            {/* 대표 공고 채점 과정 */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-ink-900">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                <p className="text-xs font-semibold text-ink-300">채점 과정 · 오늘 공고 {total.toLocaleString()}건 중 1건</p>
                <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-[11px] font-bold text-mint-300">채점 완료</span>
              </div>
              <div className="px-5 pt-5">
                <p className="text-xs text-ink-300">{bid.demandAgency} · {bid.contractMethod}</p>
                <p className="mt-1 line-clamp-2 font-bold">{bid.title}</p>
              </div>
              <ol className="mt-4 divide-y divide-white/5 font-mono text-[13px]">
                {ev.factors.map((f, i) => (
                  <li key={f.label} className="grid grid-cols-[28px_1fr_auto] items-start gap-x-3 px-5 py-2.5">
                    <span className="tabular-nums text-ink-400">0{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-sans font-semibold">{f.label}</span>
                      <span className="block truncate font-sans text-xs text-ink-300">{f.note}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className={f.ok ? "text-mint-300" : "text-coral"}>{String(f.score).padStart(2, " ")}</span>
                      <span className="text-ink-400">/{f.max}</span>
                      <span className={`ml-2 font-sans text-[11px] font-bold ${f.ok ? "text-mint-300" : "text-coral"}`}>{i < 3 ? (f.ok ? "통과" : "미달") : f.ok ? "양호" : "주의"}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex items-end justify-between gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-4">
                <div>
                  <p className="text-xs text-ink-300">가중 합계</p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums text-ink-200">{ev.factors.map((f) => f.score).join(" + ")}</p>
                </div>
                <p className="text-right">
                  <span className="text-4xl font-extrabold tabular-nums text-mint">{ev.score}</span>
                  <span className="text-sm text-ink-400">/100</span>
                  <span className="ml-3 rounded-lg bg-mint px-2 py-1 text-sm font-extrabold text-white">{ev.grade}{ev.grade === "제외" ? "" : "등급"}</span>
                </p>
              </div>
              <div className="border-t border-white/10 px-5 py-4">
                <p className="text-xs font-semibold text-ink-300">투찰 금액 가이드 계산식</p>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink-200">
                  기초금액 {won(bid.baseAmount)} × 예정가격 ±2% × 낙찰하한율 {price.rate.toFixed(3).replace(/\.?0+$/, "")}%
                </p>
                <p className="mt-1 text-sm font-bold text-mint-300">
                  {won(price.low)} ~ {won(price.high)}
                </p>
              </div>
            </div>
          </div>

          {/* 처리 단계 */}
          <ol className="mt-5 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map(([t, d], i) => (
              <li key={t} className="bg-ink-950 p-5">
                <p className="font-mono text-xs font-bold text-mint-400">STEP 0{i + 1}</p>
                <p className="mt-2 font-bold">{t}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-300">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
