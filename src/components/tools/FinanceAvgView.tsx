"use client";

import { useMemo, useState } from "react";
import { FINANCE_AVG, checkFinance, type FinanceAvg } from "@/lib/financeAvg";

const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/[^\d.]/g, "")));
const pct = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, "")}%`;
const GROUPS: FinanceAvg["group"][] = ["종합건설", "전문건설", "설비·전기·통신·소방"];

/** 업종별 경영상태 평균비율 표 + 우리 회사 비율 견주기 */
export function FinanceAvgView() {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(FINANCE_AVG[0].name);
  const [debt, setDebt] = useState("");
  const [current, setCurrent] = useState("");
  const [big, setBig] = useState(true);
  const avg = FINANCE_AVG.find((a) => a.name === pick) ?? FINANCE_AVG[0];
  const c = checkFinance(avg, big, num(debt), num(current));
  const list = useMemo(() => {
    const t = q.replace(/\s+/g, "");
    return FINANCE_AVG.filter((a) => !t || [a.name, ...(a.aliases ?? [])].some((x) => x.replace(/[\s·.]/g, "").includes(t.replace(/[·.]/g, ""))));
  }, [q]);

  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <label className="label" htmlFor="fin-q">업종 찾기</label>
        <input id="fin-q" className="input" placeholder="예: 철콘, 전기, 상하수도, 토목건축" value={q} onChange={(e) => setQ(e.target.value)} />
        {GROUPS.map((g) => {
          const rows = list.filter((a) => a.group === g);
          if (!rows.length) return null;
          return (
            <section key={g} className="mt-6">
              <h2 className="font-bold">{g}</h2>
              <div className="card mt-2 overflow-hidden">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-paper text-xs text-ink-500">
                    <tr><th className="px-3 py-2 text-left font-semibold">업종</th><th className="w-24 px-3 py-2 text-right font-semibold">부채비율</th><th className="w-24 px-3 py-2 text-right font-semibold">유동비율</th></tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((a) => (
                      <tr key={a.name} onClick={() => setPick(a.name)} className={`cursor-pointer ${a.name === pick ? "bg-mint-50" : "hover:bg-paper"}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold">{a.name}</p>
                          {a.aliases?.length ? <p className="text-[11px] text-ink-400">{a.aliases.join(", ")}</p> : null}
                          {!a.verified && <p className="text-[11px] text-coral">협회 원문 대조 전 값</p>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.debt)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{pct(a.current)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows[0] && <p className="mt-1.5 text-xs text-ink-400">{rows[0].basisYear}년 말 결산 기준 · {rows[0].from} 입찰공고분부터 적용</p>}
            </section>
          );
        })}
        {avg.extra && (
          <section className="mt-6">
            <h2 className="font-bold">{avg.name} 그 밖의 평균비율</h2>
            <dl className="card mt-2 grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-4">
              {avg.extra.map((x) => (
                <div key={x.label} className="min-w-0"><dt className="text-xs text-ink-400">{x.label}</dt><dd className="font-semibold tabular-nums">{x.value}{x.unit === "%" ? "%" : x.unit}</dd></div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <aside className="min-w-0">
        <section className="card p-4 sm:p-5 lg:sticky lg:top-20">
          <h2 className="font-bold">우리 회사와 견주기</h2>
          <p className="mt-1 text-sm text-ink-500">왼쪽 표에서 업종을 고르세요. 지금 <b className="text-ink">{avg.name}</b></p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="min-w-0"><span className="label">부채비율 (%)</span><input className="input tabular-nums" inputMode="decimal" value={debt} onChange={(e) => setDebt(e.target.value)} /></label>
            <label className="min-w-0"><span className="label">유동비율 (%)</span><input className="input tabular-nums" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          </div>
          <div className="mt-3 flex gap-1 text-sm">
            <button type="button" onClick={() => setBig(true)} className={`flex-1 rounded-full border px-3 py-1.5 font-semibold ${big ? "border-ink bg-ink text-white" : "border-ink-100"}`}>추정가격 10억 이상</button>
            <button type="button" onClick={() => setBig(false)} className={`flex-1 rounded-full border px-3 py-1.5 font-semibold ${!big ? "border-ink bg-ink text-white" : "border-ink-100"}`}>10억 미만</button>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="rounded-xl bg-paper px-3 py-2.5">
              <p className="font-semibold">부채비율 만점: {pct(c.debtLimit)} 미만</p>
              <p className="text-xs text-ink-500">업종 평균 {pct(avg.debt)}의 {big ? "50%" : "100%"}</p>
              {c.debtVsAvg !== undefined && (
                <p className={`mt-1 text-xs font-semibold ${c.debtFull ? "text-mint-700" : "text-coral"}`}>
                  평균 대비 {c.debtVsAvg}% · {c.debtFull ? "만점 조건 충족" : `만점까지 ${pct(num(debt)! - c.debtLimit)}p 낮춰야 합니다`}
                </p>
              )}
            </li>
            <li className="rounded-xl bg-paper px-3 py-2.5">
              <p className="font-semibold">유동비율 만점: {pct(c.currentLimit)} 이상</p>
              <p className="text-xs text-ink-500">업종 평균 {pct(avg.current)}의 {big ? "150%" : "100%"}</p>
              {c.currentVsAvg !== undefined && (
                <p className={`mt-1 text-xs font-semibold ${c.currentFull ? "text-mint-700" : "text-coral"}`}>
                  평균 대비 {c.currentVsAvg}% · {c.currentFull ? "만점 조건 충족" : `만점까지 ${pct(c.currentLimit - num(current)!)}p 높여야 합니다`}
                </p>
              )}
            </li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink-400">
            조달청 시설공사 적격심사 세부기준의 재무비율 만점 조건입니다. 행정안전부(지자체)·공기업 기준과 신용평가 등급으로 평가받는 경우는 구간과 배점이 다르니 공고의 적격심사 기준을 확인하세요.
            부채비율 = 부채 ÷ 자기자본, 유동비율 = 유동자산 ÷ 유동부채 (최근 결산 기준).
          </p>
        </section>
      </aside>
    </div>
  );
}
