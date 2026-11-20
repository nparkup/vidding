/**
 * 발주처 기준·금액 구간별 낙찰하한율 집계.
 *
 * 나라장터 공고의 낙찰방법 세부(sucsfbidMthdNm)에는 그 공고가 쓰는 평가기준표 이름과 금액 구간이 그대로 적혀 있다
 * (예: "적격심사제-추정가격 10억원 미만 3억원 이상인 입찰공사"는 행정안전부 지방자치단체 기준, "…인 공사(종합공사)"는 조달청).
 * 같은 기준 이름의 공고들이 실제로 쓴 낙찰하한율을 세어 가장 많이 쓰인 값을 그 구간의 하한율로 보여 준다.
 * 원천: 낙찰 저장소(R2)의 최근 공고 원자료, 없으면 지금 진행 중인 공고.
 */
import { basisKind, usableLwlt } from "./criteria";

export type RateIssuer = "조달청" | "행정안전부" | "기관 자체" | "기타";
export type RateBiz = "공사" | "용역" | "물품";

export interface RateRow {
  issuer: RateIssuer;
  biz: RateBiz;
  /** 적용 구간 (낙찰방법 세부에서 "적격심사제-" 를 뗀 기준 이름) */
  tier: string;
  /** 가장 많이 쓰인 낙찰하한율 (%) */
  rate: number;
  /** 그 하한율을 쓴 공고 비율 (0~1) */
  share: number;
  /** 집계한 공고 수 */
  count: number;
  /** 다른 하한율 (많은 순, 3개까지) */
  others: { rate: number; count: number }[];
  /** 정렬용 금액 (구간 이름의 하한 금액, 없으면 공고 추정가격 중앙값) */
  amount: number;
}

export interface RateTable {
  builtAt: string;
  /** 집계 기간 (공고 게시 주, YYYY-MM-DD) */
  from?: string;
  to?: string;
  source: "낙찰 저장소" | "진행 중 공고";
  notices: number;
  rows: RateRow[];
}

/** 집계 입력 한 줄 */
export interface RateInput {
  biz: RateBiz;
  /** 낙찰방법 세부 (계약방법이 "계약방법 / 낙찰방법" 으로 붙어 있어도 된다) */
  method: string;
  /** 추정가격 (원) */
  presmpt?: number;
  /** 공고 낙찰하한율 (%) */
  lwlt?: number;
}

/** 낙찰방법 문구에서 기준 이름만 ("일반경쟁 / 적격심사제-…" → "…") */
export function tierName(method: string): string {
  const m = method.includes(" / ") ? method.slice(method.lastIndexOf(" / ") + 3) : method;
  const t = m.replace(/^적격심사제\s*-\s*/, "").replace(/\s+/g, " ").trim();
  // "제한적최저가(낙찰하한율)-제한적최저가(낙찰하한율)"처럼 같은 말이 두 번 붙은 것
  const twice = t.match(/^(.+?)\s*-\s*\1$/);
  return twice ? twice[1] : t;
}

/** 낙찰방법 문구로 기준을 낸 곳 */
export function issuerOf(method: string): RateIssuer {
  if (!/적격|추정가격|평가기준/.test(method)) return "기타";
  const k = basisKind({ method: `적격심사제-${tierName(method)}` });
  return k === "모름" ? "기타" : k;
}

const EOK = 100_000_000;
const NOTICE = 230_000_000; // 고시금액 (criteria.NOTICE_AMOUNT 와 같은 값)
/** "10억원 미만 3억원 이상" → 3억 (구간 하한). "50억원 이상" → 50억. "2억원 미만" → 0. 금액이 없으면 undefined */
export function tierAmount(tier: string): number | undefined {
  const nums = [...tier.matchAll(/(\d+(?:\.\d+)?)\s*(억|천만)\s*원?\s*(이상|미만|초과|이하)|고시금액\s*(이상|미만)/g)].map((m) => (m[4]
    ? { v: NOTICE, op: m[4] }
    : { v: Number(m[1]) * (m[2] === "억" ? EOK : 10_000_000), op: m[3] }));
  if (!nums.length) return undefined;
  const low = nums.filter((n) => n.op === "이상" || n.op === "초과").map((n) => n.v);
  if (low.length) return Math.max(...low);
  return 0;
}

const BANDS: [number, string][] = [[10_000_000_000, "100억 원 이상"], [5_000_000_000, "50억~100억 원"], [1_000_000_000, "10억~50억 원"], [500_000_000, "5억~10억 원"], [200_000_000, "2억~5억 원"], [100_000_000, "1억~2억 원"], [0, "1억 원 미만"]];
/** 기준 이름에 금액 구간이 없으면(기관 자체 "관리규정외 수기심사", 제한적최저가) 추정가격 구간을 붙여 나눈다 */
export function rateTierKey(method: string, presmpt?: number): string {
  const tier = tierName(method);
  if (tierAmount(tier) !== undefined || !presmpt) return tier;
  const band = BANDS.find(([min]) => presmpt >= min)![1];
  return `${tier} · 추정가격 ${band}`;
}

/** 공고들을 기준 이름별로 묶어 하한율을 센다. min 건 미만인 기준은 뺀다 */
export function buildRateRows(inputs: RateInput[], min = 3): RateRow[] {
  const groups = new Map<string, { issuer: RateIssuer; biz: RateBiz; tier: string; rates: Map<number, number>; amts: number[] }>();
  for (const x of inputs) {
    const lwlt = usableLwlt(x.lwlt);
    if (!lwlt || !x.method) continue;
    const base = tierName(x.method);
    if (!base || /협상|수의|2단계|규격/.test(base)) continue;
    const tier = rateTierKey(x.method, x.presmpt);
    const issuer = issuerOf(x.method);
    const key = `${x.biz}|${issuer}|${tier}`;
    const g = groups.get(key) ?? groups.set(key, { issuer, biz: x.biz, tier, rates: new Map(), amts: [] }).get(key)!;
    const r = Math.round(lwlt * 1000) / 1000;
    g.rates.set(r, (g.rates.get(r) ?? 0) + 1);
    if (x.presmpt) g.amts.push(x.presmpt);
  }
  const rows: RateRow[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.rates.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const count = sorted.reduce((s, [, n]) => s + n, 0);
    if (count < min) continue;
    const amts = g.amts.sort((a, b) => a - b);
    rows.push({
      issuer: g.issuer, biz: g.biz, tier: g.tier,
      rate: sorted[0][0], share: Math.round((sorted[0][1] / count) * 1000) / 1000, count,
      others: sorted.slice(1, 4).map(([rate, n]) => ({ rate, count: n })),
      amount: tierAmount(tierName(g.tier.split(" · 추정가격 ")[0])) ?? (amts.length ? amts[Math.floor(amts.length / 2)] : 0),
    });
  }
  const order: RateIssuer[] = ["조달청", "행정안전부", "기관 자체", "기타"];
  const bizOrder: RateBiz[] = ["공사", "용역", "물품"];
  return rows.sort((a, b) => bizOrder.indexOf(a.biz) - bizOrder.indexOf(b.biz) || order.indexOf(a.issuer) - order.indexOf(b.issuer) || b.amount - a.amount || b.count - a.count);
}

/** 공고 한 건에 맞는 집계 행 (같은 업무·같은 기준 이름) */
export function rateRowFor(table: RateTable | null | undefined, biz: string | undefined, method: string | undefined, presmpt?: number): RateRow | undefined {
  if (!table || !method) return undefined;
  const tier = rateTierKey(method, presmpt);
  const b = (biz === "외자" ? "물품" : biz ?? "용역") as RateBiz;
  return table.rows.find((r) => r.biz === b && r.tier === tier);
}

export const RATE_ISSUER_NOTE: Record<RateIssuer, string> = {
  조달청: "조달청이 집행하거나 조달청 적격심사 세부기준을 쓰는 공고",
  행정안전부: "지방자치단체 입찰시 낙찰자 결정기준(행정안전부 예규)을 쓰는 시·도, 시·군·구, 교육청 등",
  "기관 자체": "공기업·준정부기관 등이 자체 계약규정으로 심사하는 공고",
  기타: "기준 이름으로 출처를 가리기 어려운 공고 (제한적최저가 등)",
};
