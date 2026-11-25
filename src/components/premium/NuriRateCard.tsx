import { wonFull } from "@/lib/format";
import type { NuriResult, NuriRateStat } from "@/lib/nuri";

const pct = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, "")}%`;
const ymd = (iso: string) => iso.slice(0, 10);

/**
 * 민간 예측의 '지난 개찰 결과': 같은 업무·낙찰방법 민간 공고의 개찰 1순위 투찰률 분포와 같은 기관의 지난 개찰.
 * 누리장터는 최종 낙찰 API가 비어 있어 개찰 1순위를 보여 준다. 투찰률 기준(기준금액·예정가격)은 공고마다 다를 수 있다.
 */
export function NuriRateCard({ stat, award, biz, from, baseAmount, amountLabel, past }: {
  stat?: NuriRateStat; award?: string; biz?: string; from?: string; baseAmount: number; amountLabel: string; past: NuriResult[];
}) {
  const amt = (r: number) => (baseAmount > 0 ? Math.floor((baseAmount * r) / 100) : 0);
  return (
    <section className="card min-w-0 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">지난 개찰 결과</h3>
        <span className="chip">누리장터 민간낙찰정보{from ? ` · ${from}부터` : ""}</span>
      </div>
      <p className="mt-1 text-sm text-ink-500">누리장터 {biz ?? ""} · {award?.replace("에의한낙찰자결정", "") ?? "낙찰방법"} 공고의 개찰 1순위</p>
      {stat ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-paper p-4 sm:col-span-2">
            <p className="text-xs text-ink-500">1순위 투찰금액 (가운데 값)</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums [overflow-wrap:anywhere]">{amt(stat.p50) ? wonFull(amt(stat.p50)) : pct(stat.p50)}</p>
            <p className="mt-1 text-xs text-ink-500">{amt(stat.p50) ? `${amountLabel} 기준 · 투찰률 ${pct(stat.p50)} · ` : ""}절반이 {pct(stat.p25)} ~ {pct(stat.p75)} 사이</p>
          </div>
          <div className="rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">평균 참가 업체</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">{stat.bidders}곳</p>
            <p className="mt-1 text-xs text-ink-500">개찰 {stat.n.toLocaleString("ko-KR")}건</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink-500">같은 업무·낙찰방법의 지난 개찰 결과가 5건이 안 돼 투찰률을 보여 주지 않습니다.</p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-500">누리장터는 최종 낙찰 자료를 공개하지 않아 개찰 1순위를 씁니다. 투찰률은 누리장터가 공개한 값이며 공고마다 기준(기준금액·예정가격)이 다를 수 있습니다.</p>
      {past.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="text-sm font-bold">같은 기관의 지난 개찰 {past.length}건</p>
          <ul className="mt-3 space-y-3">
            {past.slice(0, 5).map((r) => (
              <li key={`${r.no}-${r.ord}-${r.openedAt}`} className="min-w-0 rounded-xl bg-paper p-3 text-sm">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                  <span>{ymd(r.openedAt)} 개찰</span>
                  <span className={`chip ${r.state === "유찰" ? "border-coral/30 bg-coral-100/60 text-coral" : ""}`}>{r.state || "개찰"}</span>
                  <span>{r.bidders}개사 참가</span>
                </div>
                <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{r.title}</p>
                {r.ranks.length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {r.ranks.slice(0, 3).map((x) => (
                      <li key={x.rank} className="grid min-w-0 grid-cols-[2.5rem_1fr_auto] gap-2">
                        <span className="text-ink-500">{x.rank}위</span>
                        <span className="min-w-0 truncate">{x.name}</span>
                        <span className="text-right tabular-nums">{x.amount ? wonFull(x.amount) : "-"}{x.rate ? <span className="ml-1 text-xs text-ink-500">({pct(x.rate)})</span> : null}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
