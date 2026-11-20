/**
 * 사정율 분석과 투찰금액 계산.
 *
 * 사정율(발주처) = 예정가격 ÷ 기초금액 × 100. 복수예비가격 15개 중 4개를 추첨해 평균한 값이라 공고마다 다르다.
 * 낙찰자 사정율 = 낙찰금액 ÷ (기초금액 × 낙찰하한율) × 100. 낙찰자가 예정가격을 얼마로 보고 넣었는지를 뜻한다.
 *
 * 만드는 곳
 * - 빌드(analyzeBid)가 같은 수요기관의 최근 4년 낙찰에서 표본(assessSamples)을 뽑아 /award-analysis/{id}.json 의 assess 에 둔다
 * - 화면(BidPriceAnalysis)이 이 공고의 예비가격 범위로 assessStats 를 계산하고 투찰금액을 보여 준다
 * - 수집(collect.ts index)이 같은 함수로 최근 8주 낙찰을 되짚어 추천 구간 적중률을 로그에 남긴다
 * 이 파일은 Node 전용 모듈을 쓰지 않는다.
 */
import type { AgencyRow, MethodCode } from "./analysis";

/** 표본 한 건: [낙찰일 YYYY-MM-DD, 발주처 사정율(%), 낙찰자 사정율(%, 모르면 0), 개찰 1위 사정율(%, 모르면 0)] */
export type AssessSample = [date: string, ratio: number, winner: number, first: number];

export interface AssessData {
  /** 표본을 모은 범위: 같은 업무만이면 "same", 업무가 모자라 기관 전체를 썼으면 "agency" */
  scope: "same" | "agency";
  /** 최근 순 */
  samples: AssessSample[];
}

/** 표본을 모으는 기간(개월). 최근 48개월 */
export const ASSESS_MONTHS = 48;
/** 이보다 적으면 기관 전체 업무로 넓힌다 */
export const ASSESS_MIN = 20;
/** 화면에 넘기는 최대 표본 수 */
export const ASSESS_MAX = 120;
/** 추천 구간 폭(%p) */
export const WINDOW = 0.2;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** 가격 경쟁(적격심사·최저가 등)이라 사정율이 투찰금액을 정하는지. 협상은 가격점수만 보므로 뺀다 */
export const usesAssess = (method: MethodCode | string) => !/^N$|협상/.test(method);

/**
 * 같은 수요기관 낙찰(agencyRows)에서 사정율 표본을 뽑는다. 지금 공고(no)와 그 공고일(posted) 이후 낙찰은 뺀다.
 * 사정율이 90~110%를 벗어난 행(단가 공고, 기초금액 오기)은 버린다
 */
export function assessSamples(rows: AgencyRow[] | undefined, biz: string, no: string, posted: string, anyBiz = false): AssessData | undefined {
  if (!rows?.length) return undefined;
  const from = new Date(Date.parse(`${posted}T00:00:00Z`) - ASSESS_MONTHS * 30.44 * 86400e3).toISOString().slice(0, 10);
  const pick = (sameBiz: boolean) => {
    const seen = new Set<string>();
    const out: AssessSample[] = [];
    for (const r of rows) {
      const [rno, , date, rbiz, amount, , , method, , base, plnprc, lwlt, , , top] = r;
      if (rno === no || date >= posted || date < from || (sameBiz && rbiz !== biz) || seen.has(rno)) continue;
      if (!(base > 0 && plnprc > 0) || method === "N") continue;
      const ratio = (plnprc / base) * 100;
      if (!(ratio > 90 && ratio < 110)) continue;
      seen.add(rno);
      const bidRatio = (amt: number | undefined) => {
        if (!(lwlt > 0 && amt && amt > 0)) return 0;
        const v = (amt / (base * (lwlt / 100))) * 100;
        return v > 90 && v < 110 ? r3(v) : 0;
      };
      out.push([date, r3(ratio), bidRatio(amount), bidRatio(top?.[0]?.[2])]);
    }
    return out.sort((a, b) => b[0].localeCompare(a[0]));
  };
  let samples = anyBiz ? [] : pick(true);
  let scope: AssessData["scope"] = "same";
  if (anyBiz || samples.length < ASSESS_MIN) {
    const all = pick(false);
    if (all.length > samples.length) { samples = all; scope = "agency"; }
  }
  if (!samples.length) return undefined;
  return { scope, samples: samples.slice(0, ASSESS_MAX) };
}

export interface AssessWindow {
  lo: number;
  hi: number;
  /** 이 구간에 든 표본 비율 (최근 가중) 0~1 */
  share: number;
  /** 표본 수 */
  n: number;
}

export interface AssessStats {
  n: number;
  /** 예비가격 범위 (사정율 %, 예: [98, 102]) */
  range: [number, number];
  from: string;
  to: string;
  /** 사정율 [10%, 25%, 50%, 75%, 90%] */
  q: [number, number, number, number, number];
  mean: number;
  /** 최근 10건 평균 */
  recent: number;
  /** 0.2%p 구간별 표본 수 (range[0]부터) */
  bins: number[];
  binWidth: number;
  /** 추천 구간 (표본이 많이 든 순, 겹치지 않게 최대 3개) */
  windows: AssessWindow[];
  /** 구간 폭이 범위에서 차지하는 비율: 아무 데나 골랐을 때 들어갈 확률 */
  baseline: number;
  /** 낙찰자 사정율 [25%, 50%, 75%]와 표본 수 */
  winner?: { q: [number, number, number]; n: number };
  /** 개찰 1위 사정율 [25%, 50%, 75%]와 표본 수 */
  first?: { q: [number, number, number]; n: number };
}

function quant(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** 복수예비가격 범위(기초금액 대비 %, 예: [-2, 2]) → 사정율 범위. 모르면 표본에서 ±2 또는 ±3 */
export function ratioRange(baseRange: [number, number] | undefined, samples: AssessSample[]): [number, number] {
  if (baseRange && baseRange[1] > baseRange[0]) return [100 + baseRange[0], 100 + baseRange[1]];
  const out = samples.filter((s) => s[1] < 97.99 || s[1] > 102.01).length;
  return out > samples.length * 0.2 ? [97, 103] : [98, 102];
}

/**
 * 표본과 범위로 사정율 통계와 추천 구간을 만든다. asOf(YYYY-MM-DD)에 가까운 표본일수록 무겁게 본다 (2년마다 절반)
 */
export function assessStats(data: AssessData | undefined, baseRange: [number, number] | undefined, asOf?: string): AssessStats | undefined {
  if (!data?.samples.length) return undefined;
  const range = ratioRange(baseRange, data.samples);
  const xs = data.samples.filter((s) => s[1] >= range[0] - 0.005 && s[1] <= range[1] + 0.005);
  if (xs.length < 5) return undefined;
  const now = Date.parse(`${asOf ?? xs[0][0]}T00:00:00Z`);
  const w = xs.map((s) => Math.pow(0.5, Math.max(0, now - Date.parse(`${s[0]}T00:00:00Z`)) / (730 * 86400e3)));
  const total = w.reduce((a, b) => a + b, 0);
  const sorted = xs.map((s) => s[1]).sort((a, b) => a - b);
  const binWidth = WINDOW;
  const nb = Math.max(1, Math.round((range[1] - range[0]) / binWidth));
  const bins = new Array<number>(nb).fill(0);
  for (const s of xs) bins[Math.min(nb - 1, Math.max(0, Math.floor((s[1] - range[0]) / binWidth)))]++;

  // 0.01%p 간격으로 구간을 옮겨 가며 가중 표본이 가장 많이 든 곳부터 겹치지 않게 3개
  const cand: AssessWindow[] = [];
  for (let lo = range[0]; lo + WINDOW <= range[1] + 1e-9; lo = r3(lo + 0.01)) {
    const hi = r3(lo + WINDOW);
    let s = 0, n = 0;
    xs.forEach((x, i) => { if (x[1] >= lo && x[1] < hi) { s += w[i]; n++; } });
    cand.push({ lo: r3(lo), hi, share: s / total, n });
  }
  cand.sort((a, b) => b.share - a.share || Math.abs(a.lo + WINDOW / 2 - 100) - Math.abs(b.lo + WINDOW / 2 - 100));
  const windows: AssessWindow[] = [];
  for (const c of cand) {
    if (windows.length >= 3 || c.n === 0) break;
    if (windows.some((x) => c.lo < x.hi && c.hi > x.lo)) continue;
    windows.push({ ...c, share: Math.round(c.share * 1000) / 1000 });
  }
  const qOf = (vals: number[]) => {
    const s = vals.filter((v) => v > 0).sort((a, b) => a - b);
    return s.length >= 5 ? { q: [r3(quant(s, 0.25)), r3(quant(s, 0.5)), r3(quant(s, 0.75))] as [number, number, number], n: s.length } : undefined;
  };
  const recent = xs.slice(0, 10).map((s) => s[1]);
  return {
    n: xs.length,
    range,
    from: xs[xs.length - 1][0],
    to: xs[0][0],
    q: [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => r3(quant(sorted, p))) as AssessStats["q"],
    mean: r3(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    recent: r3(recent.reduce((a, b) => a + b, 0) / recent.length),
    bins,
    binWidth,
    windows,
    baseline: Math.round((WINDOW / (range[1] - range[0])) * 1000) / 1000,
    winner: qOf(xs.map((s) => s[2])),
    first: qOf(xs.map((s) => s[3])),
  };
}

/* ---------- 투찰금액 ---------- */

/**
 * 공사 A값 (조달청 입찰가격 산정 기준): 국민건강·국민연금·노인장기요양보험료, 퇴직급여충당금, 산업안전보건관리비, 안전관리비, 품질관리비.
 * 이 금액은 깎지 않고 그대로 투찰금액에 넣는다
 */
export interface AValueParts {
  health?: number; pension?: number; care?: number; retire?: number; safety?: number; safetyCheck?: number; quality?: number;
}
export const A_LABEL: Record<keyof AValueParts, string> = {
  health: "국민건강보험료", pension: "국민연금보험료", care: "노인장기요양보험료", retire: "퇴직급여충당금",
  safety: "산업안전보건관리비", safetyCheck: "안전관리비", quality: "품질관리비",
};
export const aValueOf = (p: AValueParts | undefined) => Object.values(p ?? {}).reduce((a: number, b) => a + (Number(b) || 0), 0);

/**
 * 투찰금액 = (예정가격 − A값) × 낙찰하한율 + A값. 예정가격 = 기초금액 × 사정율.
 * 하한율에 못 미치면 탈락하므로 원 단위 올림
 */
export function bidAmount(base: number, ratio: number, lwlt: number, aValue = 0): { plan: number; amount: number } {
  const plan = (base * ratio) / 100;
  const a = aValue > 0 && aValue < plan ? aValue : 0;
  return { plan: Math.round(plan), amount: Math.ceil((plan - a) * (lwlt / 100) + a) };
}

/* ---------- 되짚어 보기 ---------- */

/** 실제 사정율이 추천 구간(1개, 3개)에 들었는지 */
export function assessHit(st: AssessStats, actual: number): { top1: boolean; top3: boolean; medianErr: number } {
  const inW = (x: AssessWindow) => actual >= x.lo && actual < x.hi;
  return { top1: !!st.windows[0] && inW(st.windows[0]), top3: st.windows.some(inW), medianErr: Math.abs(st.q[2] - actual) };
}
