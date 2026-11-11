import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DdayBadge, GradeBadge, ScoreBar } from "@/components/Badges";
import { Checklist } from "@/components/Checklist";
import { bidPriceGuide, documentChecklist, evaluate, keyPoints } from "@/lib/analysis";
import { dateTime, won, wonFull } from "@/lib/format";
import { getBid } from "@/lib/store";
import type { License, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bid = await getBid((await params).id);
  return { title: bid ? `${bid.title} 공고 분석` : "공고 분석" };
}

export default async function BidDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const bid = await getBid(id);
  if (!bid) notFound();

  const lic = (sp.lic ?? "").split(",").filter(Boolean) as License[];
  const rg = (sp.rg ?? "").split(",").filter(Boolean) as Region[];
  const profile = lic.length
    ? { licenses: lic, regions: rg, minAmount: Number(sp.min ?? 0), maxAmount: Number(sp.max ?? 1e10), pastPerformance: Number(sp.max ?? 0) }
    : null;
  const ev = profile ? evaluate(bid, profile) : null;
  const guide = bidPriceGuide(bid);
  const points = keyPoints(bid);
  const docs = documentChecklist(bid);

  const timeline = [
    { label: "공고 게시", at: bid.postedAt },
    ...(bid.briefingAt ? [{ label: "현장설명회", at: bid.briefingAt }] : []),
    { label: "입찰 마감", at: bid.closeAt, strong: true },
    { label: "개찰", at: bid.openAt },
  ];

  return (
    <div className="container-x py-10 sm:py-14">
      <Link href="/bids" className="text-sm text-ink-500 hover:text-ink">← 공고 목록</Link>

      <header className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <DdayBadge days={ev?.daysLeft ?? Math.ceil((new Date(bid.closeAt).getTime() - Date.now()) / 86400000)} />
            <span className="chip">{bid.category}</span>
            <span className="chip">{bid.contractMethod}</span>
            <span className="chip">공고번호 {bid.bidNtceNo}-{bid.bidNtceOrd}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{bid.title}</h1>
          <p className="mt-2 text-ink-500">{bid.agency}{bid.demandAgency !== bid.agency && ` · 수요기관 ${bid.demandAgency}`}</p>
        </div>
        <div className="flex gap-2">
          <a href={bid.detailUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">나라장터 원문</a>
          <Link href="/apply" className="btn-mint btn-sm">이 공고 준비 도움받기</Link>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* 요약 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold">핵심 요약</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ["기초금액", won(bid.baseAmount)],
                ["용역 기간", `${bid.periodMonths}개월`],
                ["참가 지역", bid.region === "전국" ? "제한 없음" : `${(bid.regions ?? [bid.region]).join("·")} 제한`],
                ["필요 면허", bid.licenseRaw || bid.licenses.join(", ") || "제한 없음"],
                ["낙찰하한율", bid.lowerLimitRate ? `${bid.lowerLimitRate}%` : "해당 없음"],
                ["공동도급", bid.jointContract ? "허용" : "불가(단독)"],
                ["중소기업 제한", bid.smallBizOnly ? "예" : "아니오"],
                ["유사공고 평균 참여", bid.stats ? `${bid.stats.avgBidders}개사` : "-"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-paper p-3">
                  <dt className="text-xs text-ink-500">{k}</dt>
                  <dd className="mt-1 font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            {points.length > 0 && (
              <ul className="mt-5 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 일정 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold">일정</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-4">
              {timeline.map((t) => (
                <li key={t.label} className={`rounded-xl border p-3 ${t.strong ? "border-coral bg-coral-100/50" : "border-ink-100"}`}>
                  <p className={`text-xs font-semibold ${t.strong ? "text-coral" : "text-ink-500"}`}>{t.label}</p>
                  <p className="mt-1 text-sm font-bold">{dateTime(t.at)}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* 체크리스트 */}
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">제출서류 체크리스트</h2>
              <span className="chip">{bid.contractMethod} 기준</span>
            </div>
            <p className="mt-1 mb-5 text-sm text-ink-500">체크한 항목은 이 브라우저에 저장됩니다. 최종 서류는 반드시 공고문 원문으로 확인하세요.</p>
            <Checklist bidId={bid.id} groups={docs} />
          </section>
        </div>

        <aside className="space-y-6">
          {/* 가능성 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold">입찰 가능성</h2>
            {ev ? (
              <>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-5xl font-extrabold tabular-nums text-mint">{ev.score}<span className="text-lg text-ink-300">/100</span></p>
                  <GradeBadge grade={ev.grade} />
                </div>
                <ul className="mt-5 space-y-4">
                  {ev.factors.map((f) => (
                    <li key={f.label}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-semibold">{f.label}</span>
                        <span className="tabular-nums text-ink-300">{f.score}/{f.max}</span>
                      </div>
                      <ScoreBar value={f.score} max={f.max} />
                      <p className="mt-1 text-xs text-ink-500">{f.note}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="mt-4 rounded-xl bg-paper p-4 text-sm text-ink-500">
                귀사 조건을 입력하면 이 공고의 참가 가능 여부와 점수를 계산해 드립니다.
                <Link href="/bids" className="mt-3 block font-semibold text-mint-600">공고 검색에서 조건 입력 →</Link>
              </div>
            )}
          </section>

          {/* 투찰 가이드 */}
          <section className="card p-6">
            <h2 className="text-lg font-bold">투찰 금액 가이드</h2>
            <p className="mt-1 text-sm text-ink-500">기초금액 × 예정가격 범위(±2%) × 낙찰하한율 {guide.rate.toFixed(3)}%</p>
            <div className="mt-4 rounded-xl bg-ink p-4 text-white">
              <p className="text-xs text-ink-300">권장 중심 금액</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{wonFull(guide.center)}</p>
              <p className="mt-2 text-xs text-ink-300">예상 범위 {won(guide.low)} ~ {won(guide.high)}</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-300">
              참고용 추정치입니다. 실제 예정가격은 복수예비가격 추첨으로 결정되며, 낙찰정보 연동 시 발주기관별 사정률 분포를 반영합니다.
            </p>
          </section>

          <section className="rounded-2xl bg-mint p-6 text-white">
            <p className="font-bold">이 공고, 함께 준비할까요?</p>
            <p className="mt-2 text-sm opacity-90">프로 요금제부터 담당 매니저가 서류 누락 여부를 마감 전 한 번 더 확인해 드립니다.</p>
            <Link href="/pricing" className="btn mt-4 w-full bg-white text-ink hover:bg-paper">요금제 보기</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
