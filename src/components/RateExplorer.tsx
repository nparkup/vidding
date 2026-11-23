"use client";

import { useState } from "react";
import type { StandardTier } from "@/lib/criteria";
import { RATE_ISSUER_NOTE, type RateBiz, type RateIssuer, type RateTable } from "@/lib/rateTable";

const BIZ: RateBiz[] = ["공사", "용역", "물품"];
const ISSUERS: RateIssuer[] = ["조달청", "행정안전부", "기관 자체", "기타"];
const pct = (n?: number) => (n === undefined ? "-" : `${n.toFixed(3).replace(/\.?0+$/, "")}%`);

/** 기준표 화면: 조달청 세부기준 표 + 실제 공고 하한율 집계 */
export function RateExplorer({ table, tiers }: { table: RateTable | null; tiers: StandardTier[] }) {
  const [biz, setBiz] = useState<RateBiz>("공사");
  const [issuer, setIssuer] = useState<RateIssuer>("행정안전부");
  const btn = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm font-semibold transition ${on ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`;
  const std = tiers.filter((t) => t.biz === biz);
  const rows = (table?.rows ?? []).filter((r) => r.biz === biz && r.issuer === issuer);
  const issuerCount = (i: RateIssuer) => (table?.rows ?? []).filter((r) => r.biz === biz && r.issuer === i).reduce((s, r) => s + r.count, 0);

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="업무 구분">
        {BIZ.map((b) => <button key={b} type="button" role="tab" aria-selected={biz === b} onClick={() => setBiz(b)} className={btn(biz === b)}>{b}</button>)}
      </div>

      <section className="card min-w-0 p-5 sm:p-6">
        <h2 className="text-lg font-bold">조달청 적격심사 세부기준 ({biz})</h2>
        <p className="mt-1 text-sm text-ink-500">추정가격 구간별 낙찰하한율·통과점수·실적 평가. 공고 평가점수 예측에 쓰는 기준표와 같은 값입니다.</p>
        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="table-x min-w-[760px]">
            <thead><tr><th>기준표 (구간)</th><th className="text-right">낙찰하한율</th><th className="text-right">통과점수</th><th>실적 평가</th><th>대조</th></tr></thead>
            <tbody>
              {std.map((t) => (
                <tr key={t.name}>
                  <td className="font-semibold">{t.name}</td>
                  <td className="text-right tabular-nums">{pct(t.lowerLimit)}</td>
                  <td className="text-right tabular-nums">{t.pass}점</td>
                  <td className="text-sm">{t.perf ? <><b>{t.perf.label} {t.perf.max}점</b><span className="block text-ink-500">{t.perf.multiple}</span></> : <span className="text-ink-300">실적 평가 없음</span>}</td>
                  <td className="text-xs text-ink-500">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-3 md:hidden">
          {std.map((t) => (
            <li key={t.name} className="rounded-xl border border-ink-100 p-4">
              <p className="font-semibold [overflow-wrap:anywhere]">{t.name}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-ink-500">낙찰하한율</dt><dd className="font-bold tabular-nums">{pct(t.lowerLimit)}</dd></div>
                <div><dt className="text-xs text-ink-500">통과점수</dt><dd className="font-bold tabular-nums">{t.pass}점</dd></div>
              </dl>
              <p className="mt-2 text-sm">{t.perf ? <><b>{t.perf.label} {t.perf.max}점</b><span className="block text-ink-500">{t.perf.multiple}</span></> : <span className="text-ink-300">실적 평가 없음</span>}</p>
              <p className="mt-2 text-xs text-ink-300">{t.status}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-ink-300">근거: {[...new Set(std.map((t) => t.source))].join(" · ")}. "일부 추정"은 원문 표가 흐리거나 기호가 깨져 통과점수·하한율로 역산한 값이 섞여 있다는 뜻입니다.</p>
      </section>

      <section className="card min-w-0 p-5 sm:p-6">
        <h2 className="text-lg font-bold">실제 공고가 쓴 낙찰하한율 ({biz})</h2>
        <p className="mt-1 text-sm text-ink-500">
          {table
            ? <>{table.source === "낙찰 저장소" ? `나라장터 공고 ${table.from ?? ""}주 ~ ${table.to ?? ""}주` : "지금 진행 중인 나라장터 공고"} {table.notices.toLocaleString()}건을 공고의 낙찰방법(적용 기준 이름)별로 묶어 가장 많이 쓰인 하한율을 셌습니다.</>
            : "집계 자료를 아직 만들지 못했습니다. 다음 공고 갱신 때 채워집니다."}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {ISSUERS.map((i) => <button key={i} type="button" onClick={() => setIssuer(i)} className={btn(issuer === i)}>{i} {issuerCount(i) ? <span className="font-normal opacity-70">{issuerCount(i).toLocaleString()}</span> : null}</button>)}
        </div>
        <p className="mt-2 text-xs text-ink-500">{RATE_ISSUER_NOTE[issuer]}</p>
        <ul className="mt-4 divide-y divide-ink-100">
          {rows.map((r) => (
            <li key={r.tier} className="grid min-w-0 grid-cols-1 gap-1 py-3 sm:grid-cols-[1fr_120px_150px] sm:items-center sm:gap-4">
              <p className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{r.tier}</p>
              <p className="text-lg font-extrabold tabular-nums sm:text-right">{pct(r.rate)}</p>
              <p className="text-xs text-ink-500 sm:text-right">공고 {r.count.toLocaleString()}건 중 {Math.round(r.share * 100)}%{r.others.length ? <span className="block text-ink-300">그 밖 {r.others.map((o) => `${pct(o.rate)} ${o.count}건`).join(", ")}</span> : null}</p>
            </li>
          ))}
          {table && rows.length === 0 && <li className="py-6 text-center text-sm text-ink-500">이 기준으로 집계된 공고가 없습니다.</li>}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-ink-300">
          행정안전부(지방자치단체)·기관 자체 기준의 통과점수와 실적 평가 방법은 공고서마다 적힌 값을 씁니다.<br />공고 상세의 "하한율·실적 기준"에서 그 공고의 공고서 문장과 함께 확인할 수 있습니다.
          같은 기준 이름인데 하한율이 다른 공고는 정정 전 기준이나 특례(중소기업자간 경쟁 등)가 섞인 경우입니다.
        </p>
      </section>
    </div>
  );
}
