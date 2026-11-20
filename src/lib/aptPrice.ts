/**
 * 아파트(공동주택) 입찰가격 예측. 브라우저와 빌드에서 함께 쓴다 (서버 전용 모듈을 쓰지 않는다).
 *
 * K-apt 입찰결과에는 예정가격·기초금액이 없어 나라장터처럼 투찰률로 예측할 수 없다.
 * 대신 같은 단지·같은 분야의 직전 계약(낙찰 또는 수의계약)과 그다음 낙찰을 짝지어,
 * 월 환산 금액이 얼마나 오르내렸는지(다음 낙찰 ÷ 직전 계약)를 분야·낙찰방법별로 모은다.
 * 새 공고의 예상 낙찰금액 = 직전 계약 월 환산 금액 × 그 비율 (가운데값, 20~80% 구간).
 * 빌드 때 지난해까지의 짝으로 비율을 만들고 올해 낙찰에 맞춰 본 적중률을 함께 낸다.
 */
import type { AptPrior } from "./apt";

export interface AptPriceStat {
  /** 짝 수 */
  n: number;
  /** 다음 낙찰 ÷ 직전 계약 (월 환산) 가운데값 */
  median: number;
  p20: number;
  p80: number;
}

export interface AptPriceCheck {
  /** 맞춰 본 낙찰 건수 */
  n: number;
  /** 실제 낙찰금액이 예측 구간(20~80%) 안에 든 비율 */
  inRange: number;
  /** 예측 가운데값과 5% 안 / 10% 안 */
  within5: number;
  within10: number;
  /** 비교용: 직전 계약금액 그대로라고 봤을 때 10% 안 */
  naive10: number;
  /** 오차율 가운데값 (0.06 = 6%) */
  medianError: number;
}

export interface AptPriceModel {
  /** 비율을 만든 짝 수 */
  pairs: number;
  all: AptPriceStat;
  byCat: Record<string, AptPriceStat>;
  /** `${분야}|${낙찰방법}` */
  byCatAward: Record<string, AptPriceStat>;
  /** 검증: cutoff 이전 짝으로 만든 비율로 cutoff 이후 낙찰을 맞춰 본 결과 */
  check: { cutoff: string; all: AptPriceCheck; byCat: Record<string, AptPriceCheck> };
}

/** 계약기간 개월 수 (2026-01-01 ~ 2026-12-31 → 12). 이상하면 undefined */
export function contractMonths(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined;
  const m = Math.round((b - a + 86_400_000) / (30.437 * 86_400_000));
  return m >= 1 && m <= 60 ? m : undefined;
}

/** 한 달 금액 */
export function monthly(p: Pick<AptPrior, "amount" | "start" | "end">): number | undefined {
  const m = contractMonths(p.start, p.end);
  return m && p.amount > 0 ? p.amount / m : undefined;
}

/** 표본이 이만큼은 있어야 그 묶음 비율을 쓴다 */
export const MIN_PAIRS = 40;

export interface AptPriceForecast {
  /** 예상 낙찰금액 (직전과 같은 계약기간 기준) */
  mid: number;
  low: number;
  high: number;
  /** 기준 개월 수 */
  months: number;
  /** 월 환산 직전 계약금액 */
  prevMonthly: number;
  stat: AptPriceStat;
  /** 어느 묶음 비율을 썼는지 (예: "청소·적격심사", "청소", "전체 분야") */
  basis: string;
  check?: AptPriceCheck;
}

/** 직전 계약과 분야·낙찰방법으로 예상 낙찰금액을 낸다. months 를 주면 그 계약기간으로 환산한다 */
export function forecastAptPrice(model: AptPriceModel, category: string, award: string | undefined, prior: Pick<AptPrior, "amount" | "start" | "end">, months?: number): AptPriceForecast | undefined {
  const pm = contractMonths(prior.start, prior.end);
  if (!(prior.amount > 0)) return undefined;
  const base = months ?? pm ?? 12;
  // 계약기간을 모르면 직전 계약과 같은 기간이라고 보고 총액끼리 비교한다
  const prevMonthly = pm ? prior.amount / pm : prior.amount / base;
  const ca = award ? model.byCatAward[`${category}|${award}`] : undefined;
  const c = model.byCat[category];
  const [stat, basis] = ca && ca.n >= MIN_PAIRS ? [ca, `${category}·${award}`] : c && c.n >= MIN_PAIRS ? [c, category] : [model.all, "전체 분야"];
  const total = prevMonthly * base;
  return {
    mid: total * stat.median,
    low: total * stat.p20,
    high: total * stat.p80,
    months: base,
    prevMonthly,
    stat,
    basis,
    check: model.check.byCat[category] && model.check.byCat[category].n >= 20 ? model.check.byCat[category] : model.check.all,
  };
}

/* ---------- 빌드: 짝 만들기·비율·검증 ---------- */

export interface AptPriceRecord {
  no: string;
  /** `${단지코드}|${분야}` */
  key: string;
  /** 낙찰방법 (적격심사·최저낙찰 등, 낙찰 건만) */
  award?: string;
  prior: AptPrior;
}

interface Pair { cat: string; award?: string; ratio: number; prev: number; next: number; at: string }

const quant = (sorted: number[], q: number) => {
  if (!sorted.length) return 1;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
function stat(ratios: number[]): AptPriceStat {
  const s = [...ratios].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10000) / 10000;
  return { n: s.length, median: r(quant(s, 0.5)), p20: r(quant(s, 0.2)), p80: r(quant(s, 0.8)) };
}

/** 같은 단지·분야에서 시간순으로 이어진 (직전 계약 → 다음 낙찰) 짝 */
function pairsOf(records: AptPriceRecord[]): Pair[] {
  const byKey = new Map<string, AptPriceRecord[]>();
  const seen = new Set<string>();
  for (const r of records) {
    const id = `${r.prior.via}|${r.no}`;
    if (seen.has(id) || !r.prior.closedAt) continue;
    seen.add(id);
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  const out: Pair[] = [];
  for (const [key, list] of byKey) {
    const cat = key.split("|")[1];
    list.sort((a, b) => (a.prior.closedAt ?? "").localeCompare(b.prior.closedAt ?? ""));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (b.prior.via !== "낙찰") continue;
      // 재공고·분할 발주처럼 넉 달 안에 다시 나온 건은 같은 계약의 반복으로 보고 넘긴다
      if (Date.parse(b.prior.closedAt!) - Date.parse(a.prior.closedAt!) < 120 * 86_400_000) continue;
      const pa = monthly(a.prior), pb = monthly(b.prior);
      if (!pa || !pb) continue;
      const ratio = pb / pa;
      // 세 배 넘게 차이 나면 범위가 바뀐 다른 일로 본다
      if (ratio < 1 / 3 || ratio > 3) continue;
      out.push({ cat, award: b.award, ratio, prev: a.prior.amount, next: b.prior.amount, at: b.prior.closedAt! });
    }
  }
  return out;
}

function fit(pairs: Pair[]): Omit<AptPriceModel, "check"> {
  const group = (f: (p: Pair) => string | undefined) => {
    const m = new Map<string, number[]>();
    for (const p of pairs) { const k = f(p); if (!k) continue; const l = m.get(k) ?? []; l.push(p.ratio); m.set(k, l); }
    return Object.fromEntries([...m].map(([k, v]) => [k, stat(v)]));
  };
  return { pairs: pairs.length, all: stat(pairs.map((p) => p.ratio)), byCat: group((p) => p.cat), byCatAward: group((p) => (p.award ? `${p.cat}|${p.award}` : undefined)) };
}

function checkOf(model: Omit<AptPriceModel, "check">, tests: Pair[]): AptPriceCheck {
  let inRange = 0, w5 = 0, w10 = 0, naive = 0;
  const errs: number[] = [];
  for (const t of tests) {
    const ca = t.award ? model.byCatAward[`${t.cat}|${t.award}`] : undefined;
    const c = model.byCat[t.cat];
    const st = ca && ca.n >= MIN_PAIRS ? ca : c && c.n >= MIN_PAIRS ? c : model.all;
    const err = Math.abs(st.median / t.ratio - 1);
    errs.push(err);
    if (t.ratio >= st.p20 && t.ratio <= st.p80) inRange++;
    if (err <= 0.05) w5++;
    if (err <= 0.1) w10++;
    if (Math.abs(1 / t.ratio - 1) <= 0.1) naive++;
  }
  const n = tests.length || 1;
  const r = (x: number) => Math.round((x / n) * 1000) / 1000;
  return { n: tests.length, inRange: r(inRange), within5: r(w5), within10: r(w10), naive10: r(naive), medianError: Math.round(quant(errs.sort((a, b) => a - b), 0.5) * 1000) / 1000 };
}

/** 낙찰·수의계약 기록으로 비율을 만들고, cutoff(YYYY-MM-DD) 이후 낙찰로 맞춰 본다 */
export function buildAptPriceModel(records: AptPriceRecord[], cutoff: string): AptPriceModel {
  const pairs = pairsOf(records);
  const train = pairs.filter((p) => p.at < cutoff), test = pairs.filter((p) => p.at >= cutoff);
  const early = fit(train);
  const cats = [...new Set(test.map((t) => t.cat))];
  return {
    ...fit(pairs),
    check: { cutoff, all: checkOf(early, test), byCat: Object.fromEntries(cats.map((c) => [c, checkOf(early, test.filter((t) => t.cat === c))])) },
  };
}
