"use client";

import { won } from "@/lib/format";
import { METHOD_NAME, type AwardAnalysis, type Forecast, type LikelyBidder, type PastAward, type Related, type SimilarStat, type WinChance } from "@/lib/awards/analysis";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

/** 빌드 때 만든 공고별 낙찰 결과 분석. 없으면 null */
export async function loadAwardAnalysis(id: string): Promise<AwardAnalysis | null> {
  const r = await fetch(`${STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : ""}/award-analysis/${encodeURIComponent(id)}.json`);
  if (!r.ok) return null;
  return (await r.json()) as AwardAnalysis | null;
}

const pct = (n: number, d = 3) => `${Math.round(n * 10 ** d) / 10 ** d}%`;
const eok = (n: number) => (n >= 1e8 ? `${(Math.round(n / 1e6) / 100).toLocaleString()}억 원` : won(n));
const short = (d: string) => d.slice(0, 7).replace("-", ".");

const LEVEL_TONE: Record<string, string> = {
  낮음: "bg-mint-50 text-mint-700",
  보통: "bg-ink-100 text-ink",
  높음: "bg-amber-100 text-ink",
  "매우 높음": "bg-coral-100 text-ink",
};

/** 결과 패널 옆: 낙찰 결과로 본 경쟁 강도·낙찰 가능성·가격 기준 */
export function ForecastCard({ fc, chance, isNego, bidRate, baseAmount, analysis }: { fc: Forecast; chance?: WinChance; isNego: boolean; bidRate: number; baseAmount: number; analysis?: AwardAnalysis | null }) {
  if (!fc.competition && !fc.winRate) return null;
  const prePrice = fc.pre && baseAmount ? Math.round((baseAmount * fc.pre.value) / 100) : 0;
  // 최근 낙찰 결과: 같은 사업 이력이 있으면 그것, 없으면 비슷한 공고의 최근 낙찰
  const recent: { key: string; date: string; winner: string; wr: number; amount: number; rate: number; bidders: number; title?: string }[] = analysis?.history.length
    ? analysis.history.slice(0, 3).map((h) => ({ key: h.no, date: h.date, winner: h.winner, wr: h.wr, amount: h.amount, rate: h.rate, bidders: h.bidders }))
    : (analysis?.related?.ex ?? analysis?.similar?.stat.ex ?? []).slice(0, 3).map(([no, title, , date, amount, rate, bidders, winner, wr]) => ({ key: no, date, winner, wr: wr ?? 0, amount, rate, bidders, title }));
  return (
    <section className="card mt-4 p-6">
      <h3 className="font-bold">낙찰 결과로 본 예측</h3>
      <dl className="mt-3 space-y-3 text-sm">
        {fc.competition && (
          <div>
            <dt className="flex items-center justify-between gap-2">
              <span className="text-ink-500">경쟁 강도</span>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[fc.competition.level]}`}>{fc.competition.level}</span>
            </dt>
            <dd className="mt-0.5 text-xs text-ink-500">{fc.competition.text}</dd>
            {fc.likely && fc.likely.length > 0 && (
              <dd className="mt-2">
                <p className="text-xs font-semibold text-ink-500">참가 예상 기업</p>
                <ul className="mt-1 divide-y divide-ink-100 rounded-xl border border-ink-100">
                  {fc.likely.slice(0, 6).map((b) => (
                    <li key={b.name} className="flex min-w-0 items-baseline justify-between gap-2 px-3 py-1.5">
                      <span className="min-w-0 truncate font-semibold">{b.name}</span>
                      <span className="shrink-0 text-xs text-ink-500">{likelyText(b)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-ink-300">과거 같은 사업에서 낙찰받았거나 개찰 1~5위에 든 업체 순서입니다. 모자라면 공고명이 비슷한 다른 낙찰에서 자주 낙찰·상위에 든 업체로 채웁니다. 개찰 순위는 1~5위까지만 모읍니다.</p>
              </dd>
            )}
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <dt className="text-ink-500">{analysis?.history.length ? "같은 사업 최근 낙찰" : "비슷한 공고 최근 낙찰"}</dt>
            <dd className="mt-1">
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                {recent.map((r) => (
                  <li key={r.key} className="min-w-0 px-3 py-1.5">
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{r.winner}</span>
                      <span className="shrink-0 font-bold tabular-nums">{r.amount > 100 ? won(r.amount) : "금액 없음"}</span>
                    </div>
                    <p className="text-xs text-ink-500">
                      {[r.date, r.wr ? `개찰 ${r.wr}위` : "순위 확인 중", r.rate ? `낙찰률 ${pct(r.rate)}` : "", `${r.bidders}곳`].filter(Boolean).join(" · ")}
                    </p>
                    {r.title && <p className="truncate text-xs text-ink-300">{r.title}</p>}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {chance && (
          <div>
            <dt className="flex items-center justify-between gap-2">
              <span className="text-ink-500">낙찰 가능성</span>
              <span className="text-right font-bold tabular-nums">
                {chance.low === chance.high ? `${chance.low}%` : `${chance.low}% ~ ${chance.high}%`}
                {chance.ifPassed && chance.ifPassed.high > 0 && <span className="block text-xs font-normal text-ink-500">통과 시 {chance.ifPassed.low === chance.ifPassed.high ? `${chance.ifPassed.low}%` : `${chance.ifPassed.low}~${chance.ifPassed.high}%`}</span>}
              </span>
            </dt>
            <dd className="mt-0.5 space-y-0.5 text-xs text-ink-500">{chance.basis.map((b) => <p key={b}>{b}</p>)}</dd>
          </div>
        )}
        {fc.winRate && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">과거 낙찰률</dt>
            <dd className="text-right"><b className="tabular-nums">{pct(fc.winRate.value)}</b> <span className="block text-xs text-ink-300">{fc.winRate.basis}{!isNego && fc.suggestRate ? " (당시 하한율 기준)" : ""}</span></dd>
          </div>
        )}
        {isNego && fc.rival && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">예상 최저 경쟁 투찰률</dt>
            <dd className="text-right"><b className="tabular-nums">{pct(fc.rival.value)}</b> <span className="block text-xs text-ink-300">가격점수에 반영</span></dd>
          </div>
        )}
        {!isNego && fc.suggestRate && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">과거 낙찰자 투찰률</dt>
            <dd className="text-right"><b className="tabular-nums">{pct(fc.suggestRate.value)}</b> <span className="block text-xs text-ink-300">{pct(fc.suggestRate.low)} ~ {pct(fc.suggestRate.high)} · 투찰률 기본값</span></dd>
          </div>
        )}
        {prePrice > 0 && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">예상 예정가격</dt>
            <dd className="text-right">
              <b className="tabular-nums">{won(prePrice)}</b>
              <span className="block text-xs text-ink-300">기초금액의 {pct(fc.pre!.value)} · 투찰 {won(Math.round((prePrice * bidRate) / 100))}</span>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** 평가 기준 아래: 전년도 같은 사업, 과거 같은 사업 추이, 비슷한 공고의 낙찰 결과 */
export function AwardAnalysisSection({ analysis, loading, fc, bidRate, floor, isNego }: { analysis: AwardAnalysis | null; loading: boolean; fc: Forecast; bidRate: number; floor?: number; isNego: boolean }) {
  return (
    <section className="card min-w-0 p-6">
      <h3 className="text-lg font-bold">낙찰 결과 분석</h3>
      <p className="mt-1 text-sm text-ink-500">
        나라장터 낙찰 10년치에서 같은 수요기관의 같은 사업과 비슷한 공고의 낙찰 결과를 찾았습니다. 권역·노선·학년 같은 대상이나 사업 종류(유지관리·구축·감리 등)가 다르거나 금액이 3배 넘게 차이 나는 공고는 같은 사업에서 뺐습니다. 아래 값은 위 예상 점수의 가격점수 기본값과 경쟁 강도·낙찰 가능성에 반영됩니다.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-ink-300">낙찰 결과를 불러오는 중…</p>
      ) : !analysis ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm text-ink-500">이 공고는 아직 낙찰 결과 분석이 없습니다. 사이트가 다시 만들어질 때(영업일 하루 세 번) 채워집니다.</p>
      ) : (
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <PriorCard prior={analysis.prior} years={analysis.cycleYears ?? 1} />
          <HistoryCard history={analysis.history} fc={fc} />
          {analysis.related && (
            <div className="min-w-0 lg:col-span-2">
              <RelatedCard related={analysis.related} />
            </div>
          )}
          <div className="min-w-0 lg:col-span-2">
            <SimilarCard similar={analysis.similar} bidRate={bidRate} floor={floor} isNego={isNego} related={!!analysis.related} />
          </div>
        </div>
      )}
    </section>
  );
}

function Box({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-ink-100 p-4">
      <p className="font-bold">{title}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-3 py-2">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-300">{note}</p>}
    </div>
  );
}

function likelyText(b: LikelyBidder) {
  if (b.from === "same") return [b.wins ? `낙찰 ${b.wins}회` : "", b.top ? `상위 5위 ${b.top}회` : ""].filter(Boolean).join(" · ") + " (같은 사업)";
  return [b.simWins ? `낙찰 ${b.simWins}회` : "", b.simTop ? `상위 5위 ${b.simTop}회` : ""].filter(Boolean).join(" · ") + " (비슷한 공고)";
}

function RankList({ top, winner, plnprc }: { top: PastAward["top"]; winner?: string; plnprc?: number }) {
  if (!top.length) return <p className="text-xs text-ink-300">개찰 순위는 아직 받는 중입니다.</p>;
  return (
    <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
      {top.map(([name, rate, amount], i) => (
        <li key={`${i}-${name}`} className="flex min-w-0 items-center justify-between gap-3 px-3 py-1.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-8 shrink-0 text-xs text-ink-300 tabular-nums">{i + 1}위</span>
            <span className={`min-w-0 truncate ${name === winner ? "font-bold" : ""}`}>{name}</span>
            {name === winner && <span className="shrink-0 rounded bg-mint-50 px-1.5 text-xs font-semibold text-mint-700">낙찰</span>}
          </span>
          <span className="shrink-0 text-right tabular-nums text-ink-500">
            {rate ? pct(rate) : "-"}
            {(amount || (plnprc && rate)) ? <span className="block text-xs text-ink-300">{won(amount || Math.round(((plnprc ?? 0) * rate) / 100))}{amount ? "" : " 추정"}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PriorCard({ prior, years }: { prior?: PastAward; years: number }) {
  const title = years > 1 ? `직전 계약 낙찰 결과 (${years}년 계약)` : "전년도 낙찰 결과";
  if (!prior) {
    return (
      <Box title={title} sub={years > 1 ? `지금 공고 약 ${years}년 전, 같은 수요기관의 같은 사업` : "지금 공고 8~20개월 전, 같은 수요기관의 같은 사업"}>
        <p className="text-sm text-ink-500">이 기간에 같은 수요기관이 낸 비슷한 이름의 공고를 찾지 못했습니다. 올해 처음 발주했거나 이름이 크게 바뀐 사업일 수 있습니다.</p>
      </Box>
    );
  }
  const pre = prior.plnprc && prior.base ? (prior.plnprc / prior.base) * 100 : 0;
  return (
    <Box title={title} sub={`${prior.date} 낙찰 · 공고번호 ${prior.no} · 공고명 유사도 ${Math.round(prior.similarity * 100)}%`}>
      <p className="text-sm font-semibold leading-snug">{prior.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Fact label="낙찰률" value={prior.rate ? pct(prior.rate) : "-"} note={prior.derived ? "낙찰금액 ÷ 예정가격으로 계산" : prior.lwlt ? `하한율 ${pct(prior.lwlt)}` : METHOD_NAME[prior.method]} />
        <Fact label="참가업체" value={prior.bidders ? `${prior.bidders.toLocaleString()}곳` : "-"} />
        <Fact label="낙찰금액" value={eok(prior.amount)} note={prior.base ? `기초금액 ${eok(prior.base)}` : undefined} />
        <Fact label="낙찰업체" value={<span className="block truncate">{prior.winner}</span>} note={prior.wr ? `개찰 ${prior.wr}위` : undefined} />
        {pre > 0 && <Fact label="예정가격 ÷ 기초금액" value={pct(pre)} note={`예정가격 ${eok(prior.plnprc)}`} />}
      </div>
      <p className="mb-2 mt-4 text-xs font-semibold text-ink-500">개찰 순위 1~5위</p>
      <RankList top={prior.top} winner={prior.winner} plnprc={prior.plnprc} />
    </Box>
  );
}

function HistoryCard({ history, fc }: { history: PastAward[]; fc: Forecast }) {
  if (history.length < 2) {
    return (
      <Box title="과거 같은 사업 낙찰 추이" sub="같은 수요기관이 해마다 낸 같은 사업">
        <p className="text-sm text-ink-500">{history.length ? "같은 사업 낙찰이 1건뿐이라 추이 대신 전년도 결과와 비슷한 공고 통계를 씁니다." : "같은 수요기관의 같은 사업 낙찰을 찾지 못해 비슷한 공고 통계를 씁니다."}</p>
      </Box>
    );
  }
  const rows = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const rates = rows.map((r) => r.rate).filter((r) => r > 0);
  const lo = Math.min(...rates, ...rows.map((r) => r.lwlt).filter((x) => x > 0)) - 0.5;
  const hi = Math.max(...rates) + 0.5;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / Math.max(0.1, hi - lo)) * 100))}%`;
  return (
    <Box title="과거 같은 사업 낙찰 추이" sub={`같은 수요기관의 같은 사업 ${history.length}건 (${short(rows[0].date)} ~ ${short(rows[rows.length - 1].date)})`}>
      <div className="flex flex-wrap gap-2 text-xs">
        {fc.trend && <span className="chip">{fc.trend.text} ({pct(fc.trend.first, 2)} → {pct(fc.trend.last, 2)})</span>}
        {fc.incumbent && <span className="chip">{fc.incumbent.name} {fc.incumbent.total}건 중 {fc.incumbent.count}건 낙찰</span>}
      </div>
      <ul className="mt-3 space-y-2.5">
        {[...rows].reverse().map((r) => (
          <li key={r.no} className="min-w-0 text-sm">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="min-w-0 truncate"><span className="mr-1.5 text-xs text-ink-300 tabular-nums">{short(r.date)}</span>{r.winner}</span>
              <span className="shrink-0 text-xs tabular-nums text-ink-500"><b className="text-ink">{r.rate ? pct(r.rate) : "-"}</b> · {r.bidders}곳</span>
            </div>
            {r.rate > 0 && (
              <div className="relative mt-1 h-1.5 rounded-full bg-ink-100" aria-hidden>
                {r.lwlt > 0 && <span className="absolute top-[-2px] h-2.5 w-px bg-coral" style={{ left: x(r.lwlt) }} />}
                <span className="absolute top-[-1px] h-2 w-2 -translate-x-1/2 rounded-full bg-ink" style={{ left: x(r.rate) }} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-300">점은 낙찰률, 빨간 선은 그 공고의 낙찰하한율입니다.</p>
    </Box>
  );
}

function SimilarCard({ similar, bidRate, floor, isNego, related }: { similar?: AwardAnalysis["similar"]; bidRate: number; floor?: number; isNego: boolean; related?: boolean }) {
  if (!similar) {
    return (
      <Box title="비슷한 공고 낙찰 결과" sub="최근 3년, 같은 업무·계약방법·금액대·분류">
        <p className="text-sm text-ink-500">조건이 같은 낙찰이 10건 미만이라 통계를 내지 않았습니다.</p>
      </Box>
    );
  }
  const s: SimilarStat = similar.stat;
  return (
    <Box title="비슷한 공고 낙찰 결과" sub={`최근 3년 ${s.n.toLocaleString()}건 · ${similar.label}`}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Fact label="낙찰률 중앙값" value={s.rate ? pct(s.rate.q[2]) : "-"} note={s.rate ? `가운데 절반 ${pct(s.rate.q[1], 2)} ~ ${pct(s.rate.q[3], 2)}` : undefined} />
        <Fact label="참가업체 수" value={`${Math.round(s.bidders.q[1]).toLocaleString()}곳`} note={`보통 ${Math.round(s.bidders.q[0])} ~ ${Math.round(s.bidders.q[2])}곳`} />
        <Fact label="하한율 대비" value={s.gap ? `+${s.gap.q[1].toFixed(3)}%p` : "-"} note={s.gap ? "낙찰자가 하한율보다 높게 쓴 폭" : "하한율 자료 없음"} />
        <Fact label="낙찰자가 개찰 1위" value={s.ranks?.winnerFirst ? `${Math.round(s.ranks.winnerFirst * 100)}%` : "-"} note={s.ranks ? `순위 자료 ${s.ranks.n.toLocaleString()}건` : "순위 받는 중"} />
      </div>
      {s.rate && <RateDist q={s.rate.q} bidRate={bidRate} floor={floor} isNego={isNego} />}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {s.ranks && s.ranks.mean.some((v) => v > 0) && (
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-ink-500">개찰 순위별 평균 투찰률</p>
            <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
              {s.ranks.mean.map((v, i) => v > 0 && (
                <li key={i} className="flex justify-between px-3 py-1.5"><span className="text-ink-500">{i + 1}위</span><span className="tabular-nums">{pct(v)}</span></li>
              ))}
            </ol>
          </div>
        )}
        {!related && s.winners.length > 0 && (
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-ink-500">자주 낙찰받은 업체</p>
            <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
              {s.winners.map(([name, c]) => (
                <li key={name} className="flex min-w-0 justify-between gap-3 px-3 py-1.5"><span className="min-w-0 truncate">{name}</span><span className="shrink-0 tabular-nums text-ink-500">{c}건</span></li>
              ))}
            </ol>
          </div>
        )}
        {!related && s.ranked && s.ranked.length > 0 && (
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-ink-500">개찰 1~5위에 자주 든 업체</p>
            <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
              {s.ranked.map(([name, c]) => (
                <li key={name} className="flex min-w-0 justify-between gap-3 px-3 py-1.5"><span className="min-w-0 truncate">{name}</span><span className="shrink-0 tabular-nums text-ink-500">{c}회</span></li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {!related && s.ex && s.ex.length > 0 && <ExList ex={s.ex} />}
    </Box>
  );
}

function ExList({ ex, title = "최근 낙찰 예" }: { ex: NonNullable<SimilarStat["ex"]>; title?: string }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold text-ink-500">{title}</p>
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
        {ex.slice(0, 5).map(([no, title, agency, date, amount, rate, bidders, winner, wr, top]) => (
          <li key={no} className="min-w-0 px-3 py-2">
            <p className="line-clamp-2 font-semibold leading-snug">{title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{[date, agency, amount > 100 ? `낙찰가 ${won(amount)}` : "", rate ? `낙찰률 ${pct(rate)}` : "", `${bidders}곳`, `${winner}${wr ? ` (개찰 ${wr}위)` : ""}`].filter(Boolean).join(" · ")}</p>
            {top && top.length > 0 && <p className="mt-0.5 text-xs text-ink-300">1~{top.length}위: {top.map(([n, r], i) => `${i + 1}위 ${n} ${r ? pct(r) : ""}`).join(" · ")}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NameCounts({ title, rows, unit }: { title: string; rows: [string, number][]; unit: string }) {
  if (!rows.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold text-ink-500">{title}</p>
      <ol className="divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
        {rows.slice(0, 6).map(([name, c]) => (
          <li key={name} className="flex min-w-0 justify-between gap-3 px-3 py-1.5"><span className="min-w-0 truncate">{name}</span><span className="shrink-0 tabular-nums text-ink-500">{c}{unit}</span></li>
        ))}
      </ol>
    </div>
  );
}

/** 공고명 핵심어가 같은 다른 낙찰 (기관 무관, 최근 3년) */
function RelatedCard({ related: r }: { related: Related }) {
  return (
    <Box title="공고명이 비슷한 낙찰 결과" sub={`최근 3년, 다른 기관 포함 ${r.n.toLocaleString()}건 · 핵심어 ${r.terms.join(", ")}`}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Fact label="낙찰률 중앙값" value={r.rate ? pct(r.rate.q[1]) : "-"} note={r.rate ? `가운데 절반 ${pct(r.rate.q[0], 2)} ~ ${pct(r.rate.q[2], 2)}` : "낙찰률 자료 부족"} />
        <Fact label="참가업체 수" value={r.bidders ? `${Math.round(r.bidders.q[1])}곳` : "-"} note={r.bidders ? `보통 ${Math.round(r.bidders.q[0])} ~ ${Math.round(r.bidders.q[2])}곳` : undefined} />
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        <NameCounts title="자주 낙찰받은 업체" rows={r.winners} unit="건" />
        <NameCounts title="개찰 1~5위에 자주 든 업체" rows={r.ranked} unit="회" />
      </div>
      <ExList ex={r.ex} title="공고명이 가장 비슷한 낙찰" />
    </Box>
  );
}

/** 낙찰률 분포 막대: 10~90% 구간, 가운데 절반, 중앙값과 지금 투찰률 */
function RateDist({ q, bidRate, floor, isNego }: { q: [number, number, number, number, number]; bidRate: number; floor?: number; isNego: boolean }) {
  const lo = Math.min(q[0], floor ?? q[0], bidRate) - 0.3;
  const hi = Math.max(q[4], bidRate) + 0.3;
  const x = (v: number) => Math.max(0, Math.min(100, ((v - lo) / Math.max(0.1, hi - lo)) * 100));
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-ink-500">낙찰률 분포</p>
      <div className="relative mt-6 h-3 rounded-full bg-ink-100">
        <span className="absolute inset-y-0 rounded-full bg-ink-300/50" style={{ left: `${x(q[0])}%`, width: `${x(q[4]) - x(q[0])}%` }} />
        <span className="absolute inset-y-0 rounded-full bg-mint/60" style={{ left: `${x(q[1])}%`, width: `${x(q[3]) - x(q[1])}%` }} />
        <span className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${x(q[2])}%` }} />
        {floor ? <span className="absolute -top-1 h-5 w-0.5 bg-coral" style={{ left: `${x(floor)}%` }} /> : null}
        <span className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 text-[11px] font-semibold text-white" style={{ left: `${x(bidRate)}%` }}>내 투찰 {bidRate}%</span>
        <span className="absolute top-[-3px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-2 border-white bg-ink" style={{ left: `${x(bidRate)}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-ink-500">
        <span>{pct(q[0], 2)}</span>
        <span>중앙값 {pct(q[2], 2)}</span>
        <span>{pct(q[4], 2)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-300">
        회색은 낙찰률 10~90% 구간, 초록은 가운데 절반, 검은 선은 중앙값{floor ? ", 빨간 선은 이 공고의 낙찰하한율" : ""}입니다.
        {isNego ? " 협상계약은 기술점수가 순위를 정해 낙찰률이 넓게 퍼집니다." : ""}
      </p>
    </div>
  );
}
