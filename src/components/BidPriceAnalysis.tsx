"use client";

import { useEffect, useMemo, useState } from "react";
import { A_LABEL, aValueOf, assessStats, bidAmount, type AssessStats, type AValueParts } from "@/lib/awards/assess";
import type { AwardAnalysis } from "@/lib/awards/analysis";
import { won, wonFull } from "@/lib/format";
import type { NoticeInfo } from "@/lib/noticeInfo";
import type { Bid } from "@/lib/types";

const pct = (n: number, d = 3) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 공고 상세의 사정율 분석·투찰금액: 같은 수요기관의 과거 예정가격 ÷ 기초금액(사정율) 흐름과 분포,
 * 낙찰이 많이 몰린 구간 3개, 사정율·하한율·A값으로 투찰금액 계산
 */
export function BidPriceAnalysis({ bid, info, analysis }: { bid: Bid; info?: NoticeInfo; analysis: AwardAnalysis | null | undefined }) {
  const st = useMemo(() => assessStats(analysis?.assess, info?.baseRange, bid.postedAt.slice(0, 10)), [analysis, info?.baseRange, bid.postedAt]);
  const hasBase = !!info?.base;
  const baseDefault = info?.base ?? bid.baseAmount;
  const aParts = info?.aParts;
  const aDefault = aValueOf(aParts);
  const range = st?.range ?? (info?.baseRange ? [100 + info.baseRange[0], 100 + info.baseRange[1]] as [number, number] : [98, 102] as [number, number]);
  const ratioDefault = st ? r3((st.windows[0] ? (st.windows[0].lo + st.windows[0].hi) / 2 : st.q[2])) : 100;

  const [base, setBase] = useState(baseDefault);
  const [ratio, setRatio] = useState(ratioDefault);
  const [lwlt, setLwlt] = useState(bid.lowerLimitRate ?? 0);
  const [aVal, setAVal] = useState(aDefault);
  useEffect(() => { setBase(baseDefault); setLwlt(bid.lowerLimitRate ?? 0); setAVal(aDefault); }, [baseDefault, bid.lowerLimitRate, aDefault]);
  useEffect(() => { setRatio(ratioDefault); }, [ratioDefault]);

  const calc = lwlt > 0 && base > 0 ? bidAmount(base, ratio, lwlt, aVal) : undefined;
  const amountAt = (r: number) => (lwlt > 0 && base > 0 ? bidAmount(base, r, lwlt, aVal).amount : 0);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">사정율 분석 · 투찰금액</h2>
        {st && <span className="chip">{bid.demandAgency} {analysis?.assess?.scope === "agency" ? "전체 업무" : bid.bizType ?? "용역"} {st.n}건</span>}
      </div>
      <p className="mt-1 text-sm text-ink-500">
        사정율은 예정가격 ÷ 기초금액입니다.<br />같은 수요기관의 최근 4년 낙찰에서 사정율이 어디에 많이 모였는지 보고, 그 값으로 투찰금액을 계산합니다.
      </p>

      {st ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat k="사정율 가운데 값" v={pct(st.q[2])} sub={`${pct(st.q[1], 2)} ~ ${pct(st.q[3], 2)}`} />
            <Stat k="최근 10건 평균" v={pct(st.recent)} sub={`${st.to} 까지`} />
            <Stat k="낙찰자 사정율" v={st.winner ? pct(st.winner.q[1]) : "자료 없음"} sub={st.winner ? `${st.winner.n}건 가운데 값` : "하한율이 없는 낙찰"} />
            <Stat k="개찰 1위 사정율" v={st.first ? pct(st.first.q[1]) : "모으는 중"} sub={st.first ? `${st.first.n}건 가운데 값` : "개찰 순위 수집 중"} />
          </dl>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <figure className="min-w-0">
              <figcaption className="text-sm font-semibold">사정율 흐름 <span className="font-normal text-ink-400">낙찰일 순</span></figcaption>
              <TrendChart st={st} samples={analysis!.assess!.samples} />
            </figure>
            <figure className="min-w-0">
              <figcaption className="text-sm font-semibold">구간별 분포 <span className="font-normal text-ink-400">0.2%p 구간 · 진한 막대가 낙찰이 많이 몰린 구간</span></figcaption>
              <DistChart st={st} />
            </figure>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold">낙찰이 많이 몰린 사정율 구간</h3>
            <ol className="mt-2 divide-y divide-ink-100 rounded-xl border border-ink-100">
              {st.windows.map((w, i) => {
                const mid = r3((w.lo + w.hi) / 2);
                return (
                  <li key={w.lo} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <button type="button" onClick={() => setRatio(mid)} className="min-w-0 text-left">
                      <span className="font-bold tabular-nums">{i + 1}. {pct(w.lo, 2)} ~ {pct(w.hi, 2)}</span>
                      <span className="ml-2 text-xs text-ink-500">표본 {w.n}건 · 최근 가중 {Math.round(w.share * 100)}% (고르게 나뉘면 {Math.round(st.baseline * 100)}%)</span>
                    </button>
                    {amountAt(mid) > 0 && <span className="shrink-0 font-semibold tabular-nums">{wonFull(amountAt(mid))}</span>}
                  </li>
                );
              })}
            </ol>
            <p className="mt-1 text-xs text-ink-400">구간을 누르면 아래 계산기에 그 가운데 값이 들어갑니다.<br />최근 낙찰일수록 무겁게(2년마다 절반) 셉니다.</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">예정가격은 복수예비가격 추첨으로 정해져 해마다 크게 기울지 않습니다.<br />지난 낙찰 3만여 건을 되짚어 보면 1순위 구간에 실제 사정율이 든 비율은 10% 안팎으로, 100%를 가운데에 둔 같은 폭 구간(11%)과 비슷했습니다.<br />구간은 참고로 보시고, 금액은 하한율과 A값을 정확히 넣는 데 쓰세요.</p>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm text-ink-500">
          {analysis === undefined ? "낙찰 자료를 불러오는 중입니다." : "이 수요기관의 최근 4년 낙찰 중 예정가격·기초금액이 공개된 건이 적어 사정율 분포를 만들지 못했습니다. 계산기는 직접 넣은 사정율로 계산합니다."}
        </p>
      )}

      {/* 계산기 */}
      <div className="mt-5 rounded-2xl bg-ink p-4 text-white sm:p-5">
        <p className="text-sm font-semibold">투찰금액 계산</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={hasBase ? "기초금액 (공개됨)" : "기초금액 (미공개, 추정가격으로 채움)"} suffix="원">
            <input inputMode="numeric" value={base ? base.toLocaleString("ko-KR") : ""} onChange={(e) => setBase(Number(e.target.value.replace(/\D/g, "")) || 0)} className="calc-input" />
          </Field>
          <Field label="낙찰하한율" suffix="%">
            <input inputMode="decimal" value={lwlt || ""} onChange={(e) => setLwlt(Number(e.target.value) || 0)} className="calc-input" placeholder="공고문 확인" />
          </Field>
          <Field label={`사정율 (예비가격 범위 ${pct(range[0], 0)} ~ ${pct(range[1], 0)})`} suffix="%">
            <input inputMode="decimal" value={ratio} step={0.001} type="number" onChange={(e) => setRatio(Number(e.target.value) || 0)} className="calc-input" />
          </Field>
          <Field label={aDefault ? "A값 (공고 항목 합계)" : "A값 (공사만, 없으면 0)"} suffix="원">
            <input inputMode="numeric" value={aVal ? aVal.toLocaleString("ko-KR") : ""} onChange={(e) => setAVal(Number(e.target.value.replace(/\D/g, "")) || 0)} className="calc-input" placeholder="0" />
          </Field>
        </div>
        <input type="range" min={range[0]} max={range[1]} step={0.01} value={ratio} onChange={(e) => setRatio(Number(e.target.value))} className="mt-4 w-full accent-mint" aria-label="사정율" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs text-ink-300">예상 예정가격 (기초금액 × 사정율)</p>
            <p className="text-lg font-bold tabular-nums">{calc ? wonFull(calc.plan) : "-"}</p>
          </div>
          <div>
            <p className="text-xs text-ink-300">투찰금액 {aVal > 0 ? "((예정가격 − A값) × 하한율 + A값)" : "(예정가격 × 하한율)"}</p>
            <p className="text-2xl font-extrabold tabular-nums text-mint-300">{calc ? wonFull(calc.amount) : "하한율을 넣어 주세요"}</p>
          </div>
        </div>
        {aParts && (
          <details className="mt-3 text-xs text-ink-300">
            <summary className="cursor-pointer">A값 항목 보기 ({won(aDefault)})</summary>
            <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
              {(Object.keys(aParts) as (keyof AValueParts)[]).map((k) => (
                <li key={k} className="flex justify-between gap-2"><span>{A_LABEL[k]}</span><span className="tabular-nums">{wonFull(aParts[k] ?? 0)}</span></li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        예정가격은 개찰 때 복수예비가격 15개 중 4개를 추첨해 정해지므로 미리 알 수 없습니다.<br />과거 분포는 참고 자료이며, 하한율에 못 미치면 탈락하므로 금액은 원 단위로 올렸습니다.<br />최종 금액은 공고문과 나라장터 기초금액 공개 내용을 확인하세요.
      </p>
    </section>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper px-3 py-2">
      <dt className="text-xs text-ink-500">{k}</dt>
      <dd className="mt-0.5 font-bold tabular-nums [overflow-wrap:anywhere]">{v}</dd>
      {sub && <dd className="text-xs text-ink-400">{sub}</dd>}
    </div>
  );
}

function Field({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-ink-300">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        {children}
        <span className="shrink-0 text-xs text-ink-300">{suffix}</span>
      </span>
    </label>
  );
}

const W = 360, H = 170, PL = 44, PR = 8, PT = 8, PB = 22;

export function TrendChart({ st, samples }: { st: AssessStats; samples: [string, number, number, number][] }) {
  const xs = samples.filter((s) => s[1] >= st.range[0] - 0.005 && s[1] <= st.range[1] + 0.005).slice().reverse();
  const [lo, hi] = st.range;
  const x = (i: number) => PL + (xs.length <= 1 ? 0 : (i / (xs.length - 1)) * (W - PL - PR));
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);
  const ticks = [lo, (lo + 100) / 2, 100, (hi + 100) / 2, hi];
  // 최근 10건 이동 평균
  const ma = xs.map((_, i) => { const s = xs.slice(Math.max(0, i - 9), i + 1); return s.reduce((a, b) => a + b[1], 0) / s.length; });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label="사정율 흐름">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={t === 100 ? "#98A1B4" : "#E5E9F0"} strokeDasharray={t === 100 ? "3 3" : undefined} />
          <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#6C778D">{t.toFixed(1)}</text>
        </g>
      ))}
      <text x={PL} y={H - 6} fontSize="10" fill="#6C778D">{xs[0]?.[0].slice(0, 7)}</text>
      <text x={W - PR} y={H - 6} textAnchor="end" fontSize="10" fill="#6C778D">{xs[xs.length - 1]?.[0].slice(0, 7)}</text>
      {xs.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s[1])} r={3} fill="#3DD6A3" stroke="#fff" strokeWidth={1}>
          <title>{`${s[0]} · 사정율 ${s[1].toFixed(3)}%${s[2] ? ` · 낙찰자 ${s[2].toFixed(3)}%` : ""}`}</title>
        </circle>
      ))}
      <polyline points={ma.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#077A59" strokeWidth={2} />
      <text x={W - PR} y={PT + 10} textAnchor="end" fontSize="10" fill="#077A59">선: 최근 10건 평균</text>
    </svg>
  );
}

export function DistChart({ st }: { st: AssessStats }) {
  const max = Math.max(1, ...st.bins);
  const n = st.bins.length;
  const bw = (W - PL - PR) / n;
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const hot = (lo: number, hi: number) => st.windows.some((w) => lo < w.hi - 1e-9 && hi > w.lo + 1e-9);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label="사정율 구간별 분포">
      <line x1={PL} x2={W - PR} y1={H - PB} y2={H - PB} stroke="#CBD2DE" />
      <text x={PL - 6} y={PT + 8} textAnchor="end" fontSize="10" fill="#6C778D">{max}건</text>
      {st.bins.map((c, i) => {
        const lo = st.range[0] + i * st.binWidth, hi = lo + st.binWidth;
        const top = y(c);
        const h = Math.max(0, H - PB - top);
        return (
          <g key={i}>
            <rect x={PL + i * bw + 1} y={top} width={Math.max(1, bw - 2)} height={h} rx={Math.min(4, h / 2)} fill={hot(lo, hi) ? "#077A59" : "#86EBC8"}>
              <title>{`${lo.toFixed(1)} ~ ${hi.toFixed(1)}% · ${c}건`}</title>
            </rect>
          </g>
        );
      })}
      {[st.range[0], 100, st.range[1]].map((t) => (
        <text key={t} x={PL + ((t - st.range[0]) / (st.range[1] - st.range[0])) * (W - PL - PR)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6C778D">{t.toFixed(0)}%</text>
      ))}
    </svg>
  );
}
