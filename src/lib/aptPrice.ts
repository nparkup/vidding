/**
 * 아파트(공동주택) 입찰가격 예측. 브라우저와 빌드에서 함께 쓴다 (서버 전용 모듈을 쓰지 않는다).
 *
 * K-apt 입찰결과에는 예정가격·기초금액이 없어 나라장터처럼 투찰률로 예측할 수 없다.
 * 대신 같은 단지·같은 분야의 직전 계약(낙찰 또는 수의계약)과 그다음 낙찰을 짝지어,
 * 금액이 얼마나 달라졌는지(다음 낙찰 ÷ 직전 계약)를 분야·낙찰방법별로 모은다.
 * 낙찰은 계약기간이 빈 건이 대부분(2024~2026 약 9.2만 건 중 735건만 기간 있음)이라 총액끼리 비교한다.
 *
 * 2026-11-20 실측: 청소·경비 짝의 약 65%는 직전과 규모가 비슷하고(±25~33%), 약 25%는 거의 두 배
 * (1년 → 2년 계약 등), 나머지는 절반·범위 변경이다. 규모가 다른 짝까지 섞으면 가운데값·구간이 흐려지므로
 * "계약 규모(기간·범위)가 직전과 같을 때"의 비율을 따로 만들고, 규모가 바뀐 비율은 함께 알린다.
 * 빌드 때 지난해까지의 짝으로 비율을 만들고 올해 낙찰에 맞춰 본 적중률을 함께 낸다.
 */
import type { AptPrior } from "./apt";

/** 규모가 직전과 같다고 보는 비율 범위 */
export const SAME_SCALE: [number, number] = [0.75, 1.33];

export interface AptPriceStat {
  /** 규모가 같은 짝 수 */
  n: number;
  /** 다음 낙찰 ÷ 직전 계약 가운데값 (규모가 같은 짝) */
  median: number;
  /** 10%·90% 지점 (예상 구간) */
  low: number;
  high: number;
  /** 전체 짝 수와 그중 규모가 같은 짝·약 두 배·약 절반 비율 */
  all: number;
  same: number;
  double: number;
  half: number;
}

export interface AptPriceCheck {
  /** 맞춰 본 낙찰 건수 (규모가 같은 짝) */
  n: number;
  /** 실제 낙찰금액이 예상 구간 안에 든 비율 */
  inRange: number;
  /** 예상 금액과 5% 안 / 10% 안 */
  within5: number;
  within10: number;
  /** 비교용: 직전 계약금액 그대로라고 봤을 때 5% 안 / 10% 안 */
  naive5: number;
  naive10: number;
  /** 오차율 가운데값 (0.02 = 2%) */
  medianError: number;
}

export interface AptPriceModel {
  /** 비율을 만든 짝 수 (전체) */
  pairs: number;
  all: AptPriceStat;
  byCat: Record<string, AptPriceStat>;
  /** `${분야}|${낙찰방법}` */
  byCatAward: Record<string, AptPriceStat>;
  /** 검증: cutoff 이전 짝으로 만든 비율로 cutoff 이후 낙찰(규모가 같은 짝)을 맞춰 본 결과 */
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

/** 표본이 이만큼은 있어야 그 묶음 비율을 쓴다 */
export const MIN_PAIRS = 40;

export interface AptPriceForecast {
  /** 예상 낙찰금액 */
  mid: number;
  low: number;
  high: number;
  /** 직전 계약 대비 규모 배율 (1 = 같음, 2 = 1년 → 2년 등) */
  scale: number;
  stat: AptPriceStat;
  /** 어느 묶음 비율을 썼는지 (예: "청소·적격심사", "청소", "전체 분야") */
  basis: string;
  check?: AptPriceCheck;
  checkBasis: string;
}

function pick(model: AptPriceModel, category: string, award?: string): [AptPriceStat, string] {
  const ca = award ? model.byCatAward[`${category}|${award}`] : undefined;
  const c = model.byCat[category];
  return ca && ca.n >= MIN_PAIRS ? [ca, `${category}·${award}`] : c && c.n >= MIN_PAIRS ? [c, category] : [model.all, "전체 분야"];
}

/**
 * 직전 계약금액으로 예상 낙찰금액을 낸다. scale 은 직전 대비 이번 계약 규모 배율이다
 * (기본 1 = 기간·범위가 직전과 같음. 1년 → 2년이면 2).
 */
export function forecastAptPrice(model: AptPriceModel, category: string, award: string | undefined, prior: Pick<AptPrior, "amount">, scale = 1): AptPriceForecast | undefined {
  if (!(prior.amount > 0) || !(scale > 0)) return undefined;
  const [stat, basis] = pick(model, category, award);
  const total = prior.amount * scale;
  const cc = model.check.byCat[category];
  return {
    mid: total * stat.median,
    low: total * stat.low,
    high: total * stat.high,
    scale,
    stat,
    basis,
    check: cc && cc.n >= 20 ? cc : model.check.all,
    checkBasis: cc && cc.n >= 20 ? category : "전체 분야",
  };
}

/* ---------- 빌드: 짝 만들기·비율·검증 ---------- */

export interface AptPriceRecord {
  no: string;
  /** `${단지코드}|${분야}` */
  key: string;
  /** 낙찰방법 (적격심사·최저낙찰 등, 낙찰 건만) */
  award?: string;
  /** 단지명·지역 (낙찰 건만, 비슷한 낙찰 찾기에 쓴다) */
  apt?: string;
  area?: string;
  prior: AptPrior;
}

interface Pair { cat: string; award?: string; ratio: number; at: string }

const quant = (sorted: number[], q: number) => {
  if (!sorted.length) return 1;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const sameScale = (r: number) => r >= SAME_SCALE[0] && r <= SAME_SCALE[1];
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function stat(ratios: number[]): AptPriceStat {
  const s = ratios.filter(sameScale).sort((a, b) => a - b);
  const n = ratios.length || 1;
  return {
    n: s.length, median: r4(quant(s, 0.5)), low: r4(quant(s, 0.1)), high: r4(quant(s, 0.9)),
    all: ratios.length,
    same: r3(s.length / n),
    double: r3(ratios.filter((r) => r >= 1.7 && r <= 2.4).length / n),
    half: r3(ratios.filter((r) => r >= 0.4 && r <= 0.6).length / n),
  };
}

/** 같은 단지·분야에서 시간순으로 이어진 (직전 계약 → 다음 낙찰) 짝 */
function pairsOf(records: AptPriceRecord[]): Pair[] {
  const byKey = new Map<string, AptPriceRecord[]>();
  const seen = new Set<string>();
  for (const r of records) {
    const id = `${r.prior.via}|${r.no}`;
    if (seen.has(id) || !r.prior.closedAt || !(r.prior.amount > 0)) continue;
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
      // 두 건 모두 계약기간이 있으면 같은 기간으로 맞춘다
      const ma = contractMonths(a.prior.start, a.prior.end), mb = contractMonths(b.prior.start, b.prior.end);
      out.push({ cat, award: b.award, ratio: (b.prior.amount / a.prior.amount) * (ma && mb ? ma / mb : 1), at: b.prior.closedAt! });
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
  let inRange = 0, w5 = 0, w10 = 0, n5 = 0, n10 = 0;
  const errs: number[] = [];
  for (const t of tests) {
    const [st] = pick({ ...model, check: { cutoff: "", all: {} as AptPriceCheck, byCat: {} } }, t.cat, t.award);
    const err = Math.abs(st.median / t.ratio - 1), naive = Math.abs(1 / t.ratio - 1);
    errs.push(err);
    if (t.ratio >= st.low && t.ratio <= st.high) inRange++;
    if (err <= 0.05) w5++;
    if (err <= 0.1) w10++;
    if (naive <= 0.05) n5++;
    if (naive <= 0.1) n10++;
  }
  const n = tests.length || 1;
  return { n: tests.length, inRange: r3(inRange / n), within5: r3(w5 / n), within10: r3(w10 / n), naive5: r3(n5 / n), naive10: r3(n10 / n), medianError: r3(quant(errs.sort((a, b) => a - b), 0.5)) };
}

/** 낙찰·수의계약 기록으로 비율을 만들고, cutoff(YYYY-MM-DD) 이후 낙찰 중 규모가 같은 짝으로 맞춰 본다 */
export function buildAptPriceModel(records: AptPriceRecord[], cutoff: string): AptPriceModel {
  const pairs = pairsOf(records);
  const early = fit(pairs.filter((p) => p.at < cutoff));
  const test = pairs.filter((p) => p.at >= cutoff && sameScale(p.ratio));
  const cats = [...new Set(test.map((t) => t.cat))];
  return {
    ...fit(pairs),
    check: { cutoff, all: checkOf(early, test), byCat: Object.fromEntries(cats.map((c) => [c, checkOf(early, test.filter((t) => t.cat === c))])) },
  };
}
