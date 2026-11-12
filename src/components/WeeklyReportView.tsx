import type { Bid, ClientProfile } from "@/lib/types";
import { bidPriceGuide, keyPoints, rank, type MatchResult } from "@/lib/analysis";
import { dateTime, dday, shortDate, won, wonFull } from "@/lib/format";
import { ScoreMeter } from "./Badges";

/** 입찰 가능성 점수 구성 (src/lib/analysis.ts evaluate 와 동일한 배점) */
const WEIGHTS: [string, number, string][] = [
  ["면허 요건", 30, "투찰가능업종과 보유 면허 일치 여부 (업종 제한 없는 공고는 22점)"],
  ["참가 지역", 20, "참가가능지역에 소재지 포함 여부"],
  ["사업 규모", 15, "수행 가능 금액 범위 내 여부 (초과분은 공동도급 허용 시 8점)"],
  ["경쟁 강도", 15, "유사 공고 평균 참여업체 수 (통계 미연동 공고는 25개사 기준)"],
  ["실적·신용", 10, "직전 3년 유사실적의 기초금액 대비 비율, 신용등급"],
  ["준비 기간", 10, "입찰 마감까지 남은 일수"],
];

const GRADE_RULE = "S 85점 이상 · A 72점 이상 · B 58점 이상 · C 58점 미만";

/** ISO 주차 (보고서 번호용) */
function isoWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7) };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const pctText = (n: number, d: number) => pct(n, d).toFixed(1);

/** 1차 선별 단계별 통과 건수 */
function funnel(ranked: MatchResult[]) {
  const pass = (r: MatchResult, label: string) => r.factors.find((f) => f.label === label)?.ok ?? false;
  const open = ranked.filter((r) => r.daysLeft > 0);
  const lic = open.filter((r) => pass(r, "면허 요건"));
  const reg = lic.filter((r) => pass(r, "참가 지역"));
  const amt = reg.filter((r) => pass(r, "사업 규모"));
  return [
    { label: "수집 공고", note: "분석 기간 중 나라장터 게시", n: ranked.length },
    { label: "마감 전", note: "입찰 마감이 지나지 않은 공고", n: open.length },
    { label: "면허 충족", note: "투찰가능업종과 보유 면허 일치", n: lic.length },
    { label: "지역 충족", note: "참가가능지역에 소재지 포함", n: reg.length },
    { label: "규모 충족", note: "수행 가능 금액 범위 (공동도급 포함)", n: amt.length },
  ];
}

function Section({ no, title, desc, children }: { no: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 border-b border-ink-100 pb-2">
        <span className="text-xs font-bold tabular-nums text-mint-600">{no}</span>
        <h3 className="font-bold">{title}</h3>
        {desc && <p className="ml-auto hidden text-xs text-ink-300 sm:block">{desc}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 주 1회 주요 공고 분석보고서 */
export function WeeklyReportView({ client, bids, weekLabel, note, now = new Date() }: { client: ClientProfile; bids: Bid[]; weekLabel: string; note?: string; now?: Date }) {
  const ranked = rank(bids, client, now);
  const ok = ranked.filter((r) => r.eligible);
  const top = ok.slice(0, 5);
  const lead = top[0];

  const byCat = new Map<string, number>();
  const byMethod = new Map<string, number>();
  const agencies = new Map<string, { amount: number; n: number }>();
  for (const r of ok) {
    byCat.set(r.bid.category, (byCat.get(r.bid.category) ?? 0) + 1);
    byMethod.set(r.bid.contractMethod, (byMethod.get(r.bid.contractMethod) ?? 0) + 1);
    const a = agencies.get(r.bid.demandAgency) ?? { amount: 0, n: 0 };
    agencies.set(r.bid.demandAgency, { amount: a.amount + r.bid.baseAmount, n: a.n + 1 });
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const methods = [...byMethod.entries()].sort((a, b) => b[1] - a[1]);
  const topAgencies = [...agencies.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  const maxCat = Math.max(1, ...byCat.values());
  const totalAmount = ok.reduce((s, r) => s + r.bid.baseAmount, 0);
  const highGrade = ok.filter((r) => r.grade === "S" || r.grade === "A");
  const closingSoon = ok.filter((r) => r.daysLeft <= 7);
  const steps = funnel(ranked);
  const schedule = [...highGrade].sort((a, b) => a.bid.closeAt.localeCompare(b.bid.closeAt)).slice(0, 8);

  const { year, week } = isoWeek(now);
  const reportNo = `WR-${year}-W${String(week).padStart(2, "0")}-${client.id.replace(/\D/g, "").padStart(3, "0")}`;

  // 핵심 요약: 이번 주 데이터에서 계산한 문장만 쓴다
  const summary: string[] = [];
  summary.push(`수집 공고 ${ranked.length.toLocaleString("ko-KR")}건 중 면허·지역·규모 1차 선별을 통과한 공고는 ${ok.length}건(${pctText(ok.length, ranked.length)}%), 사업 규모 합계 ${won(totalAmount)}입니다.`);
  if (cats[0]) summary.push(`참가 가능 공고는 ${cats[0][0]} ${cats[0][1]}건${cats[1] ? `, ${cats[1][0]} ${cats[1][1]}건` : ""} 순으로 많고, 규모 기준 최대 발주기관은 ${topAgencies[0][0]}입니다.`);
  if (lead) summary.push(`1순위는 「${lead.bid.title}」(${lead.grade}등급 ${lead.score}점, ${won(lead.bid.baseAmount)}, ${lead.bid.contractMethod})입니다.`);
  if (closingSoon.length) summary.push(`7일 안에 마감되는 참가 가능 공고가 ${closingSoon.length}건이므로 서류 준비 순서를 마감일 기준으로 잡아야 합니다.`);
  const joint = top.filter((r) => r.bid.jointContract).length;
  if (joint) summary.push(`TOP ${top.length} 중 ${joint}건은 공동도급이 허용되어 협력사와 공동수급 시 실적 요건을 보완할 수 있습니다.`);

  return (
    <article className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <header className="bg-ink p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-300">
          <p className="font-semibold text-mint">입찰메이트LAB 주간 분석보고서 · {weekLabel}</p>
          <p className="tabular-nums">보고서 번호 {reportNo}</p>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">{client.company}</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-ink-300 sm:grid-cols-2">
          <div className="flex gap-2"><dt className="shrink-0 text-ink-400">보유 면허</dt><dd className="text-ink-100">{client.licenses.join(", ")}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-ink-400">영업 지역</dt><dd className="text-ink-100">{client.regions.join(", ")}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-ink-400">수행 규모</dt><dd className="text-ink-100">{won(client.minAmount)} ~ {won(client.maxAmount)}</dd></div>
          <div className="flex gap-2"><dt className="shrink-0 text-ink-400">실적·신용</dt><dd className="text-ink-100">직전 3년 {won(client.pastPerformance)} · 신용 {client.creditGrade}</dd></div>
        </dl>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["참가 가능 공고", `${ok.length}건`],
            ["총 사업 규모", won(totalAmount)],
            ["A등급 이상", `${highGrade.length}건`],
            ["7일 내 마감", `${closingSoon.length}건`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-ink-300">{k}</p>
              <p className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{v}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-10 p-6 sm:p-8">
        <section className="rounded-none border-l-4 border-mint bg-mint-50 p-4">
          <p className="text-xs font-bold text-mint-600">핵심 요약</p>
          <ol className="mt-2 space-y-1.5 text-sm leading-relaxed">
            {summary.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="w-4 shrink-0 font-bold tabular-nums text-mint-700">{i + 1}.</span><span>{s}</span></li>
            ))}
          </ol>
          {note && (
            <div className="mt-3 border-t border-mint-100 pt-3">
              <p className="text-xs font-bold text-mint-600">분석 코멘트</p>
              <p className="mt-1 text-sm leading-relaxed">{note}</p>
            </div>
          )}
        </section>

        <Section no="01" title="1차 선별 결과" desc="단계마다 앞 단계 통과 공고만 판정">
          <ul className="space-y-2">
            {[...steps, { label: "참가 가능", note: "모든 조건 충족, 점수 산정 대상", n: ok.length }].map((s, i, all) => (
              <li key={s.label} className="grid grid-cols-[88px_1fr_96px] items-center gap-3 text-sm sm:grid-cols-[96px_1fr_200px_110px]">
                <span className={i === all.length - 1 ? "font-bold text-mint-700" : "font-semibold"}>{s.label}</span>
                <span className="h-3 overflow-hidden bg-ink-50">
                  <span className={`block h-full ${i === all.length - 1 ? "bg-mint" : "bg-ink-200"}`} style={{ width: `${Math.max(0.6, pct(s.n, steps[0].n))}%` }} />
                </span>
                <span className="hidden text-xs text-ink-400 sm:block">{s.note}</span>
                <span className="text-right tabular-nums"><b>{s.n.toLocaleString("ko-KR")}</b><span className="ml-1 text-xs text-ink-300">{pctText(s.n, steps[0].n)}%</span></span>
              </li>
            ))}
          </ul>
        </Section>

        <Section no="02" title={`이번 주 꼭 볼 공고 TOP ${top.length}`} desc="입찰 가능성 점수순">
          <div className="overflow-x-auto">
            <table className="table-x min-w-[600px]">
              <thead><tr><th>#</th><th>공고명</th><th>규모</th><th>마감</th><th>입찰 가능성</th></tr></thead>
              <tbody>
                {top.map((r, i) => (
                  <tr key={r.bid.id}>
                    <td className="font-bold">{i + 1}</td>
                    <td>
                      <p className="font-semibold">{r.bid.title}</p>
                      <p className="text-xs text-ink-500">{r.bid.demandAgency} · {r.bid.contractMethod}</p>
                    </td>
                    <td className="tabular-nums">{won(r.bid.baseAmount)}</td>
                    <td className="whitespace-nowrap">{shortDate(r.bid.closeAt)} <span className="text-xs text-ink-300">{dday(r.daysLeft)}</span></td>
                    <td><ScoreMeter grade={r.grade} score={r.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {lead && <LeadAnalysis r={lead} />}

        <Section no="04" title="참가 가능 공고 분포">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h4 className="text-sm font-semibold text-ink-500">업종별</h4>
              <ul className="mt-3 space-y-2.5">
                {cats.slice(0, 8).map(([c, n]) => (
                  <li key={c} className="grid grid-cols-[84px_1fr_28px] items-center gap-3 text-sm">
                    <span className="truncate">{c}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-mint" style={{ width: `${(n / maxCat) * 100}%` }} /></span>
                    <span className="text-right font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink-500">계약방법별</h4>
              <ul className="mt-3 divide-y divide-ink-100 text-sm">
                {methods.map(([m, n]) => (
                  <li key={m} className="flex justify-between py-2"><span>{m}</span><span className="tabular-nums"><b>{n}</b><span className="ml-1 text-xs text-ink-300">{pctText(n, ok.length)}%</span></span></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-ink-500">주요 발주기관 (규모순)</h4>
              <ul className="mt-3 divide-y divide-ink-100 text-sm">
                {topAgencies.map(([a, v]) => (
                  <li key={a} className="flex justify-between gap-3 py-2"><span className="truncate">{a}</span><span className="shrink-0 tabular-nums"><b>{won(v.amount)}</b><span className="ml-1 text-xs text-ink-300">{v.n}건</span></span></li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {schedule.length > 0 && (
          <Section no="05" title="A등급 이상 공고 마감 일정" desc="마감일순">
            <div className="overflow-x-auto">
              <table className="table-x min-w-[600px]">
                <thead><tr><th>입찰 마감</th><th>공고명</th><th>현장설명회</th><th>개찰</th><th>등급</th></tr></thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.bid.id}>
                      <td className="whitespace-nowrap tabular-nums">{dateTime(r.bid.closeAt)} <span className="text-xs text-ink-300">{dday(r.daysLeft)}</span></td>
                      <td className="font-semibold">{r.bid.title}</td>
                      <td className="whitespace-nowrap tabular-nums text-ink-500">{r.bid.briefingAt ? dateTime(r.bid.briefingAt) : "없음"}</td>
                      <td className="whitespace-nowrap tabular-nums text-ink-500">{dateTime(r.bid.openAt)}</td>
                      <td className="font-bold">{r.grade} <span className="font-normal tabular-nums text-ink-400">{r.score}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section no={schedule.length > 0 ? "06" : "05"} title="다음 주 준비 사항">
          <ul className="space-y-2 text-sm leading-relaxed">
            {top.filter((r) => r.bid.briefingAt).map((r) => (
              <li key={r.bid.id} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />「{r.bid.title}」 현장설명회 {dateTime(r.bid.briefingAt!)} 참석 여부 결정</li>
            ))}
            {top.some((r) => r.bid.smallBizOnly) && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />중소기업 확인서 유효기간 점검</li>}
            {top.some((r) => r.bid.contractMethod === "적격심사") && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />신용평가등급 확인서·{(lead?.bid.bizType ?? "용역") === "공사" ? "시공" : "수행"} 실적증명서 최신본 준비</li>}
            {top.some((r) => r.bid.contractMethod === "협상에 의한 계약") && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />협상계약 공고 제안서 목차 초안 작성 (최소 5영업일 소요)</li>}
            <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />나라장터 경쟁입찰참가자격 등록사항(업종·소재지) 변경분 반영 확인</li>
          </ul>
        </Section>

        <section className="border-t border-ink-100 pt-6 text-xs leading-relaxed text-ink-500">
          <h3 className="text-sm font-bold text-ink">분석 기준 및 유의사항</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="text-ink-300"><tr><th className="py-1.5 pr-4 font-semibold">평가 항목</th><th className="py-1.5 pr-4 font-semibold">배점</th><th className="py-1.5 font-semibold">판정 기준</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {WEIGHTS.map(([k, w, d]) => (
                  <tr key={k}><td className="py-1.5 pr-4 font-semibold text-ink-700">{k}</td><td className="py-1.5 pr-4 tabular-nums">{w}점</td><td className="py-1.5">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 space-y-1">
            <li>등급 구간: {GRADE_RULE}. 면허·지역·규모 중 하나라도 충족하지 못하면 참가불가로 분류하고 점수를 산정하지 않습니다.</li>
            <li>데이터 출처: 조달청 나라장터 입찰공고 (공공데이터포털 Open API). 작성 기준 {dateTime(now.toISOString())}.</li>
            <li>투찰 참고 범위는 기초금액, 예정가격 범위(±2%), 낙찰하한율로 계산한 참고치이며 낙찰을 보장하지 않습니다. 최종 참가 여부와 제출서류는 공고문 원문을 기준으로 확인하시기 바랍니다.</li>
          </ul>
          <p className="mt-4 flex justify-between border-t border-ink-100 pt-3 text-ink-300"><span>입찰메이트LAB</span><span className="tabular-nums">{reportNo}</span></p>
        </section>
      </div>
    </article>
  );
}

/** 1순위 공고 정밀 분석 */
function LeadAnalysis({ r }: { r: MatchResult }) {
  const b = r.bid;
  const guide = bidPriceGuide(b);
  const priceBased = b.contractMethod === "적격심사" || b.contractMethod === "최저가";
  const points = keyPoints(b);
  const timeline: [string, string | undefined][] = [
    ["공고 게시", b.postedAt],
    ["현장설명회", b.briefingAt],
    ["입찰 마감", b.closeAt],
    ["개찰", b.openAt],
  ];
  return (
    <Section no="03" title="1순위 공고 정밀 분석" desc="항목별 득점과 판정 근거">
      <div className="border border-ink-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-400 tabular-nums">공고번호 {b.bidNtceNo}-{b.bidNtceOrd} · {b.bizType ?? "용역"} · {b.category}</p>
            <p className="mt-1 font-bold leading-snug">{b.title}</p>
            <p className="mt-1 text-sm text-ink-500">{b.agency}{b.demandAgency !== b.agency ? ` / 수요기관 ${b.demandAgency}` : ""}</p>
          </div>
          <ScoreMeter grade={r.grade} score={r.score} />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="table-x min-w-[560px]">
            <thead><tr><th>평가 항목</th><th className="w-[160px]">득점</th><th>판정 근거</th></tr></thead>
            <tbody>
              {r.factors.map((f) => {
                const assumed = f.label === "경쟁 강도" && !b.stats;
                return (
                  <tr key={f.label}>
                    <td className="whitespace-nowrap font-semibold">{f.label}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100"><span className={`block h-full rounded-full ${f.ok ? "bg-mint" : "bg-amber"}`} style={{ width: `${(f.score / f.max) * 100}%` }} /></span>
                        <span className="tabular-nums"><b>{f.score}</b><span className="text-xs text-ink-300"> / {f.max}</span></span>
                      </div>
                    </td>
                    <td className="text-ink-500">{assumed ? "유사 공고 낙찰 통계 미연동, 평균 25개사 기준으로 산정" : f.note}</td>
                  </tr>
                );
              })}
              <tr className="bg-ink-50/60">
                <td className="font-bold">합계</td>
                <td className="tabular-nums"><b>{r.score}</b><span className="text-xs text-ink-300"> / 100</span></td>
                <td className="text-ink-500">{r.grade}등급 ({GRADE_RULE})</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-ink-500">가격 검토</h4>
            <dl className="mt-2 divide-y divide-ink-100 text-sm">
              <div className="flex justify-between py-2"><dt className="text-ink-500">기초금액</dt><dd className="tabular-nums font-semibold">{wonFull(b.baseAmount)}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-ink-500">계약방법</dt><dd>{b.contractMethod}</dd></div>
              {priceBased ? (
                <>
                  <div className="flex justify-between py-2"><dt className="text-ink-500">낙찰하한율</dt><dd className="tabular-nums">{guide.rate.toFixed(3)}%{b.lowerLimitRate ? "" : " (기준값)"}</dd></div>
                  <div className="flex justify-between gap-3 py-2"><dt className="shrink-0 text-ink-500">투찰 참고 범위</dt><dd className="text-right tabular-nums font-semibold">{wonFull(guide.low)} ~ {wonFull(guide.high)}</dd></div>
                </>
              ) : (
                <div className="py-2 text-ink-500">기술·가격 종합평가로 결정되는 공고로, 가격보다 제안서 정성평가 비중이 큽니다.</div>
              )}
            </dl>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-ink-500">주요 일정</h4>
            <ol className="mt-2 divide-y divide-ink-100 text-sm">
              {timeline.map(([k, v]) => (
                <li key={k} className="flex justify-between py-2"><span className="text-ink-500">{k}</span><span className="tabular-nums">{v ? dateTime(v) : "없음"}</span></li>
              ))}
            </ol>
          </div>
        </div>

        {points.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-semibold text-ink-500">공고 체크포인트</h4>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
              {points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />{p}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
