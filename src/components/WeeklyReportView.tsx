import type { Bid, ClientProfile } from "@/lib/types";
import { rank } from "@/lib/analysis";
import { dday, shortDate, won } from "@/lib/format";
import { ScoreMeter } from "./Badges";

/** 주 1회 주요 공고 분석보고서 */
export function WeeklyReportView({ client, bids, weekLabel, note }: { client: ClientProfile; bids: Bid[]; weekLabel: string; note?: string }) {
  const ranked = rank(bids, client);
  const ok = ranked.filter((r) => r.eligible);
  const top = ok.slice(0, 5);
  const byCat = new Map<string, number>();
  for (const r of ok) byCat.set(r.bid.category, (byCat.get(r.bid.category) ?? 0) + 1);
  const totalAmount = ok.reduce((s, r) => s + r.bid.baseAmount, 0);
  const maxCat = Math.max(1, ...byCat.values());
  const agencies = new Map<string, number>();
  for (const r of ok) agencies.set(r.bid.demandAgency, (agencies.get(r.bid.demandAgency) ?? 0) + r.bid.baseAmount);

  return (
    <article className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <header className="bg-ink p-6 text-white sm:p-8">
        <p className="text-sm text-mint">입찰메이트LAB 주간 분석보고서 · {weekLabel}</p>
        <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">{client.company}</h2>
        <p className="mt-1 text-sm text-ink-300">면허 {client.licenses.join(", ")} · 지역 {client.regions.join(", ")} · 규모 {won(client.minAmount)}~{won(client.maxAmount)}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            ["참가 가능 공고", `${ok.length}건`],
            ["총 사업 규모", won(totalAmount)],
            ["A등급 이상", `${ok.filter((r) => r.grade === "S" || r.grade === "A").length}건`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-ink-300">{k}</p>
              <p className="mt-1 text-lg font-bold sm:text-xl">{v}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="space-y-8 p-6 sm:p-8">
        {note && (
          <section className="rounded-none border-l-4 border-mint bg-mint-50 p-4">
            <p className="text-xs font-bold text-mint-600">담당 매니저 코멘트</p>
            <p className="mt-1 leading-relaxed">{note}</p>
          </section>
        )}

        <section>
          <h3 className="font-bold">이번 주 꼭 볼 공고 TOP {top.length}</h3>
          <div className="mt-3 overflow-x-auto">
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
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="font-bold">업종별 참가 가능 공고</h3>
            <ul className="mt-3 space-y-2.5">
              {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                <li key={c} className="grid grid-cols-[80px_1fr_32px] items-center gap-3 text-sm">
                  <span>{c}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-mint" style={{ width: `${(n / maxCat) * 100}%` }} /></span>
                  <span className="text-right font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-bold">주요 발주기관 (규모순)</h3>
            <ul className="mt-3 divide-y divide-ink-100 text-sm">
              {[...agencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, amt]) => (
                <li key={a} className="flex justify-between py-2"><span className="truncate">{a}</span><span className="font-semibold tabular-nums">{won(amt)}</span></li>
              ))}
            </ul>
          </section>
        </div>

        <section>
          <h3 className="font-bold">다음 주 준비 사항</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            {top.filter((r) => r.bid.briefingAt).map((r) => (
              <li key={r.bid.id} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />「{r.bid.title}」 현장설명회 일정 확인</li>
            ))}
            {top.some((r) => r.bid.smallBizOnly) && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />중소기업 확인서 유효기간 점검</li>}
            {top.some((r) => r.bid.contractMethod === "적격심사") && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />신용평가등급 확인서·용역 실적증명서 최신본 준비</li>}
            {top.some((r) => r.bid.contractMethod === "협상에 의한 계약") && <li className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />협상계약 공고 제안서 목차 초안 작성 (최소 5영업일 소요)</li>}
          </ul>
        </section>
      </div>
    </article>
  );
}
