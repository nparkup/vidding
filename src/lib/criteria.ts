/**
 * 공고별 적격심사 기준표.
 *
 * 나라장터 공고 목록의 낙찰방법 세부(sucsfbidMthdNm)에는 그 공고에 쓰는 평가기준표 이름이 그대로 들어 있다
 * (예: "적격심사제-시설분야용역 적격심사 추정가격 5억원 미만"). 이 이름과 추정가격·업무 구분으로 기준표를 고르고,
 * 공고에 적힌 낙찰하한율을 함께 쓴다.
 *
 * 공식 기준 대조 (2026-11-17 확인, 원문은 국가법령정보센터 행정규칙 첨부)
 * - 조달청 일반용역 적격심사 세부기준: 조달청 공고 제2026-390호(2026.7.24), 2026.7.27 시행.
 *   분야별 배점(별표1~4), 이행실적 등급(A 100% 이상 … E 10% 미만), 통과점수 85(SW 중기경쟁·여객운송 88),
 *   가격 산식 분자 90(2026.5.26 개정), 학술연구 등 97.5%/93.75%, 시설분야·SW 중기경쟁 96% 상한.
 * - 조달청 기술용역 적격심사 세부기준: 건설기술계약과-5283호(2026.5.22), 2026.5.26 시행. 구간별 배점·가격 산식·통과점수 92/95.
 * - 조달청 물품구매적격심사 세부기준: 2026.5.26 시행. 별표1~3 배점, 가격 산식(분자 90), 신용평가 점수, 통과점수 85.
 * - 조달청 시설공사 적격심사세부기준: 시설총괄과-6481호(2026.6.26), 2026.7.1 공고분부터. 구간별 배점, 통과점수 95,
 *   50억 이상 가격 산식(50 − 2×|90 − 비율|, 92.5% 이상 45점), 시공경험 등급, 신용평가 점수(35점 기준표 × 배점/35).
 * - 낙찰하한율: 나라장터 공고 값(sucsfbidLwltRate)을 그대로 쓴다.
 *
 * 추정으로 남긴 것 (화면과 기준표 설명에 "추정"으로 표시)
 * - 일반용역 신용평가 점수표: 조달청 별표10 원문을 보지 못해, 같은 구조의 일반용역 적격심사 훈령 별표6 점수를 쓴다.
 * - 시설분야·여객운송 가격 계수(2.5)와 공사 10억 미만 구간 계수: 원문 산식 기호가 깨져 있어, 통과점수·상한·낙찰하한율로 역산했다.
 * - 행정안전부(지방자치단체) 기준, 공기업·기관 자체 기준("관리규정외 수기심사"): 기준표 원문을 대조하지 못했다.
 *   같은 업무·금액대의 조달청 기준표 구조를 쓰고, 가격 산식은 공고 낙찰하한율에 맞춰 역산한다.
 */
import type { Bid, BizType } from "./types";
import type { CreditGrade, EvalItem, EvalSheet, ItemKind, PriceRule, ScoreBand } from "./evalscore";
import { estimatedRule, generalServiceRule, techServiceRule, type TrustRule } from "./trustscore";
import type { NoticeCriteria } from "./noticeCriteria";

/** 공고 목록에서 평가 기준을 고르는 데 쓰는 값 (빌드 때 참가자격 자료와 함께 공고별 파일에 넣는다) */
export interface EvalBasis {
  /** 낙찰방법 세부 원문 (예: 적격심사제-시설분야용역 적격심사 추정가격 5억원 미만) */
  method?: string;
  /** 공고 낙찰하한율 (%) */
  lwlt?: number;
  /** 추정가격 (원) */
  presmpt?: number;
  /** 협상계약 기술능력·가격 배점 비율 */
  techRatio?: number;
  priceRatio?: number;
  /** 공고기관 */
  agency?: string;
  /** 일반용역 / 기술용역 */
  srvceDiv?: string;
}

/** 나라장터 공고 목록 원본에서 평가 기준 값을 꺼낸다 */
export function evalBasisOf(it: Record<string, string | undefined>): EvalBasis | undefined {
  const num = (v?: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const b: EvalBasis = {
    method: it.sucsfbidMthdNm?.trim() || undefined,
    lwlt: num(it.sucsfbidLwltRate),
    presmpt: num(it.presmptPrce),
    techRatio: num(it.techAbltEvlRt),
    priceRatio: num(it.bidPrceEvlRt),
    agency: it.ntceInsttNm?.trim() || undefined,
    srvceDiv: it.srvceDivNm?.trim() || undefined,
  };
  return Object.values(b).some((v) => v !== undefined) ? b : undefined;
}

/** 고시금액 (물품·용역, 2026년 적용 2.3억 원 내외로 본다) */
export const NOTICE_AMOUNT = 230_000_000;

/* ---------- 점수표 ---------- */

const ALL_GRADES: CreditGrade[] = [
  "AAA", "AA+", "AA0", "AA-", "A+", "A0", "A-",
  "BBB+", "BBB0", "BBB-", "BB+", "BB0", "BB-",
  "B+", "B0", "B-", "CCC+", "CCC0", "CCC-", "CC", "C", "D",
];

/** 등급 구간별 점수를 등급 하나하나의 점수로 펼친다 */
function gradeTable(rows: [CreditGrade[], number][], rest: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of ALL_GRADES) out[g] = rest;
  for (const [gs, p] of rows) for (const g of gs) out[g] = p;
  return out;
}
const AAA_TO_A: CreditGrade[] = ["AAA", "AA+", "AA0", "AA-", "A+", "A0", "A-"];
const B_ALL: CreditGrade[] = ["B+", "B0", "B-"];

/** 일반용역 신용평가 (일반용역 적격심사 훈령 별표6 점수, 조달청 별표10 원문 미대조) */
function generalCredit(max: number): Record<string, number> {
  const low = max >= 20 ? max * 0.8 : max >= 10 ? max * 0.7 : max * 0.4;
  return gradeTable([[AAA_TO_A, max], [["BBB+"], max - 0.2], [["BBB0"], max - 0.4], [["BBB-"], max - 0.6], [["BB+", "BB0"], max - 0.8], [["BB-"], max - 1.0], [B_ALL, max - 1.2]], round2(low));
}
/** 조달청 물품구매적격심사 경영상태 (30점) */
const GOODS_CREDIT = gradeTable([[AAA_TO_A, 30], [["BBB+"], 29.8], [["BBB0"], 29.6], [["BBB-"], 29.4], [["BB+", "BB0"], 29.2], [["BB-"], 29.0], [B_ALL, 28.8]], 25);
/** 조달청 시설공사 신용평가등급표 (35점 기준, 배점/35 를 곱한다) */
function constructionCredit(max: number): Record<string, number> {
  const t = gradeTable([[[...AAA_TO_A, "BBB+", "BBB0", "BBB-", "BB+", "BB0"], 35], [["BB-"], 34.1], [B_ALL, 33.3]], 30);
  return Object.fromEntries(Object.entries(t).map(([g, p]) => [g, round2((p * max) / 35)]));
}
/** 조달청 물품 기술능력 (기술등급) */
const TECH_GRADE_POINTS: Record<string, number> = { T1: 10, T2: 9.8, T3: 9.6, T4: 9.4, T5: 9.2, T6: 9.0, T7: 8.8, T8: 8 };
export const TECH_GRADES = Object.keys(TECH_GRADE_POINTS);

/** 일반용역 이행실적 등급 (동등이상 용역, 배점 20 또는 10) */
function generalPerfBands(max: number): ScoreBand[] {
  const s = max / 20;
  return [
    { unit: "%", min: 100, points: 20 * s, cond: "A 100% 이상" },
    { unit: "%", min: 70, points: 18 * s, cond: "B 70% 이상" },
    { unit: "%", min: 40, points: 16 * s, cond: "C 40% 이상" },
    { unit: "%", min: 10, points: 14 * s, cond: "D 10% 이상" },
    { unit: "%", min: 0, points: 0, cond: "E 10% 미만" },
  ];
}
/** 조달청 시설공사 시공경험 등급 (실적에 의한 경쟁입찰) */
function constructionPerfBands(max: number, big: boolean): ScoreBand[] {
  const s = max / 15;
  const cut = big ? [100, 85, 70, 50, 30] : [75, 65, 55, 45, 30];
  const pts = [15, 13.7, 12.4, 11.0, 9.7];
  return [...cut.map((c, i) => ({ unit: "%" as const, min: c, points: round2(pts[i] * s), cond: `${"ABCDE"[i]} ${c}% 이상` })), { unit: "%", min: 0, points: round2(8.2 * s), cond: "F 30% 미만" }];
}

/* ---------- 기준표 ---------- */

export interface CriteriaRef {
  /** 기준표 이름 (화면 표시) */
  name: string;
  /** 근거 문서 */
  source: string;
  /** 공식 대조: 배점·산식·통과점수를 원문과 맞춤 / 일부 추정: 일부 값만 추정 / 추정: 기준표 원문을 대조하지 못함 */
  status: "공식 대조" | "일부 추정" | "추정";
  /** 추정한 값 설명 */
  estimates: string[];
  /** 공고 낙찰방법 원문 */
  methodText?: string;
}

let seq = 0;
const mk = (label: string, max: number, kind: ItemKind, group: string, extra: Partial<EvalItem> = {}): EvalItem => ({ id: `c${++seq}`, label, max, kind, group, ...extra });

const credit = (max: number, points: Record<string, number>, missing: number, note: string) =>
  mk("경영상태 (신용평가등급)", max, "credit", "수행능력", { lookup: { of: "credit", points, missing }, basis: note });

const qualPrice = (max: number, base: number, k: number, capAt?: number, derived = false): PriceRule => ({
  kind: "qual", base, k, capAt, min: 2, derived,
  text: `${max} − ${k} × |${base} − 투찰률(%)|${capAt ? `, 투찰률 ${capAt}% 이상은 ${capAt}%로 계산` : ""}, 최저 2점`,
});

interface Table {
  ref: CriteriaRef;
  items: EvalItem[];
  price: PriceRule;
  pass: number;
  /** 기준표의 낙찰하한율 (공고 값이 있으면 공고 값 우선) */
  lowerLimit?: number;
  trust: TrustRule;
  notes: string[];
}

const SRC = {
  general: "조달청 일반용역 적격심사 세부기준 (공고 제2026-390호, 2026.7.27 시행)",
  tech: "조달청 기술용역 적격심사 세부기준 (2026.5.26 시행)",
  goods: "조달청 물품구매적격심사 세부기준 (2026.5.26 시행)",
  cons: "조달청 시설공사 적격심사세부기준 (시설총괄과-6481호, 2026.7.1 공고분부터)",
};

type GeneralField = "시설분야" | "학술연구" | "소프트웨어" | "소프트웨어(중기경쟁)" | "폐기물처리" | "여객운송" | "기타 일반용역";

/** 일반용역 분야: 낙찰방법 원문 → 업종 분류 순 */
function generalField(bid: Pick<Bid, "category">, m: string): GeneralField {
  if (/시설분야/.test(m)) return "시설분야";
  if (/학술\s*연구/.test(m)) return "학술연구";
  if (/소프트웨어.*경쟁제품\s*대상/.test(m)) return "소프트웨어(중기경쟁)";
  if (/소프트웨어/.test(m)) return "소프트웨어";
  if (/폐기물/.test(m)) return "폐기물처리";
  if (/여객/.test(m)) return "여객운송";
  if (/수리|점검|임대차|화물|수요기관\s*지정/.test(m)) return "기타 일반용역";
  if (["청소", "시설관리", "경비", "방역·소독", "통합관리"].includes(bid.category)) return "시설분야";
  if (bid.category === "연구·조사·컨설팅") return "학술연구";
  if (bid.category === "IT·소프트웨어") return "소프트웨어";
  if (bid.category === "폐기물·환경") return "폐기물처리";
  return "기타 일반용역";
}

function generalTable(field: GeneralField, amt: number): Table {
  const big = amt >= 500_000_000;
  const aboveNotice = amt >= NOTICE_AMOUNT;
  const estimates = ["신용평가 점수표는 일반용역 적격심사 훈령 별표6 점수 (조달청 별표10 원문 미대조)"];
  const facility = field === "시설분야" || field === "여객운송";
  const swSme = field === "소프트웨어(중기경쟁)";
  const pass = swSme || field === "여객운송" ? 88 : 85;
  const priceMax = big ? 60 : 70;
  let price: PriceRule;
  let lowerLimit: number;
  if (facility) {
    price = qualPrice(priceMax, 90, 2.5, 96, true);
    lowerLimit = 89.995;
    estimates.push("가격 계수 2.5는 원문 산식 기호가 깨져 상한(96%)과 통과점수로 역산");
  } else if (swSme) {
    price = qualPrice(priceMax, 90, 2, 96, true);
    lowerLimit = 89.995;
    estimates.push("가격 계수 2는 상한(96%)과 통과점수 88점으로 역산");
  } else {
    price = qualPrice(priceMax, 90, aboveNotice ? 2 : 4, aboveNotice ? 97.5 : 93.75);
    lowerLimit = aboveNotice ? 82.495 : 86.245;
  }
  const items: EvalItem[] = [];
  const perf = (max: number) => mk("이행실적 (동등이상 용역, 최근 5년)", max, "performance", "수행능력", { bands: generalPerfBands(max), basis: "해당 용역 규모(추정가격) 대비 실적. 창업·소기업·소상공인은 최근 7년" });
  const tech = (max: number) => mk("기술능력", max, "staff", "수행능력", { basis: "분야별 기술인력·자격 (세부 점수는 공고서 기준)" });
  switch (field) {
    case "시설분야":
    case "여객운송":
      if (big) items.push(perf(20));
      items.push(credit(big ? 10 : 20, generalCredit(big ? 10 : 20), -1, "신용평가등급별 점수, 미제출 시 최저등급"));
      items.push(mk(field === "시설분야" ? "근로조건 이행계획" : "근로조건 이행계획 (추정)", 10, "plan", "근로조건", { basis: "임금·법정부담금 지급, 고용승계 확약서 제출 시 10점, 미제출 0점" }));
      if (field === "여객운송") estimates.push("여객운송 배점은 시설분야 구조를 준용 (원문 별표 미대조)");
      break;
    case "학술연구":
    case "기타 일반용역":
      items.push(perf(big ? 20 : 10));
      items.push(credit(big ? 10 : 20, generalCredit(big ? 10 : 20), -1, "신용평가등급별 점수, 미제출 시 최저등급"));
      if (big) items.push(tech(10));
      if (field === "기타 일반용역") estimates.push("수리·점검·임대차·운송 등은 학술연구용역 배점 구조를 준용 (원문 별표 미대조)");
      break;
    case "소프트웨어":
    case "소프트웨어(중기경쟁)":
      if (big) items.push(perf(20));
      items.push(credit(big ? 10 : 20, generalCredit(big ? 10 : 20), -1, "신용평가등급별 점수, 미제출 시 최저등급"));
      items.push(tech(10));
      break;
    case "폐기물처리":
      items.push(perf(big ? 20 : 10));
      items.push(credit(10, generalCredit(10), -1, "신용평가등급별 점수, 미제출 시 최저등급"));
      items.push(tech(10));
      break;
  }
  items.push(mk("신뢰도 가감점(신인도)", 0, "bonus", "신인도", { basis: "+4.25 ~ △5.0, 산업재해 감점 시 +3 ~ △5" }));
  items.push(mk("입찰가격", priceMax, "price", "입찰가격", { basis: price.text }));
  return {
    ref: { name: `조달청 일반용역 ${field} (추정가격 ${big ? "5억 원 이상" : aboveNotice ? "5억 원 미만, 고시금액 이상" : "고시금액 미만"})`, source: SRC.general, status: "일부 추정", estimates },
    items, price, pass, lowerLimit, trust: generalServiceRule(),
    notes: [`종합평점 ${pass}점 이상인 업체 가운데 최저가 순으로 낙찰자를 정합니다.`],
  };
}

function techTable(amt: number): Table {
  const estimates: string[] = [];
  const tier = amt >= 1_000_000_000 ? 0 : amt >= 500_000_000 ? 1 : amt >= NOTICE_AMOUNT ? 2 : 3;
  const cap = [70, 50, 30, 10][tier];
  const priceMax = 100 - cap;
  const price = [qualPrice(30, 90, 1, 98), qualPrice(50, 90, 2, 92.5), qualPrice(70, 90, 4, 91.25), qualPrice(90, 90, 20, 90.25)][tier];
  const pass = tier === 0 ? 92 : 95;
  const items: EvalItem[] = tier < 3
    ? [mk("사업수행능력 평가점수 환산", cap, "capability", "수행능력", { basis: `사업수행능력(PQ) 평가점수 × ${cap} ÷ 100` })]
    : [mk("경영상태 (자기자본비율·유동비율)", 10, "finance", "수행능력", { basis: "자기자본비율·유동비율을 각각 공고의 기준비율과 비교 (100% 이상 5점, 90% 4.5, 80% 4, 70% 3.5, 미만 3)" })];
  items.push(mk("신뢰도 가감점(신인도)", 0, "bonus", "신인도", { basis: tier < 3 ? "+1.0 ~ △4.0" : "+3.5 ~ △4.0" }));
  items.push(mk("입찰가격", priceMax, "price", "입찰가격", { basis: price.text }));
  return {
    ref: { name: `조달청 기술용역 (추정가격 ${["10억 원 이상", "5억 원 이상 10억 원 미만", "고시금액 이상 5억 원 미만", "고시금액 미만"][tier]})`, source: SRC.tech, status: "공식 대조", estimates },
    items, price, pass, lowerLimit: [81.995, 87.495, 88.745, 89.745][tier], trust: techServiceRule(amt),
    notes: [`종합평점 ${pass}점 이상이면 낙찰자로 결정됩니다.`],
  };
}

function goodsTable(amt: number, m: string): Table {
  const estimates: string[] = [];
  const make = /제조/.test(m) && !/구매/.test(m);
  // 중소기업자간 경쟁물품·국민안전 물품·간행물은 별도 기준(계약이행능력심사 등)이고 낙찰하한율 89.995%
  // 낙찰방법이 "추정가격 고시금액 미만"처럼 '물품' 없이 짧게 적힌 조달청 공고도 이 기준이다 (공고 대조: 하한율 89.995%)
  const sme = /중소기업자간\s*경쟁|국민안전|출판|간행물/.test(m) || (/^적격심사제-추정가격\s/.test(m) && !/물품/.test(m));
  if (sme) estimates.push("중소기업자간 경쟁물품 계약이행능력심사 등 별도 기준이라 배점·가격 산식은 물품 적격심사 구조를 준용하고 낙찰하한율 89.995%를 하한으로 씀");
  const tier = amt >= 1_000_000_000 && make ? 1 : amt >= NOTICE_AMOUNT ? 2 : 3;
  const items: EvalItem[] = [];
  let price: PriceRule;
  let trust: TrustRule;
  if (tier === 1) {
    items.push(mk("납품실적", 5, "performance", "납품이행능력", { bands: [
      { unit: "%", min: 100, points: 5, cond: "100% 이상" }, { unit: "%", min: 60, points: 3.5, cond: "60% 이상" },
      { unit: "%", min: 30, points: 2, cond: "30% 이상" }, { unit: "%", min: 5, points: 1, cond: "5% 이상" }, { unit: "%", min: 0, points: 0, cond: "5% 미만" },
    ], basis: "중기업·대기업 최근 5년 (소기업·소상공인·창업기업은 기본점수 가산, 최근 7년)" }));
    estimates.push("10억 원 이상 제조입찰의 납품실적 구간 점수 일부는 원문 표가 흐려 추정");
    items.push(mk("기술능력 (기술등급)", 10, "techGrade", "납품이행능력", { lookup: { of: "techGrade", points: TECH_GRADE_POINTS, missing: 8 }, basis: "T1 10점 … T8 8점, 미확인 시 최저등급" }));
    price = qualPrice(55, 90, 2, 97.5);
    trust = estimatedRule("조달청 물품 신인도 +5 ~ △5 (항목 점수는 일반용역 기준 준용)", 5, 5);
  } else {
    price = qualPrice(70, 90, tier === 2 ? 2 : 4, tier === 2 ? 97.5 : 93.75);
    trust = estimatedRule("조달청 물품 신인도 +3 ~ △3 (항목 점수는 일반용역 기준 준용)", 3, 3);
  }
  estimates.push("신인도 항목별 점수는 일반용역 기준 준용");
  items.push(credit(30, GOODS_CREDIT, -1, tier === 3 ? "신용평가등급별 점수. 창업기업·소기업·소상공인은 만점" : "신용평가등급별 점수, 미제출 시 최저등급"));
  if (tier === 3) items[items.length - 1].smallFirmFull = true;
  items.push(mk("신뢰도 가감점(신인도)", 0, "bonus", "신인도", { basis: tier === 1 ? "+5 ~ △5" : "+3 ~ △3" }));
  const priceMax = tier === 1 ? 55 : 70;
  items.push(mk("입찰가격", priceMax, "price", "입찰가격", { basis: price.text }));
  return {
    ref: {
      name: sme ? `중소기업자간 경쟁물품 등 (${tier === 3 ? "고시금액 미만" : "고시금액 이상"}, 배점 구조는 조달청 물품 적격심사 준용)` : `조달청 물품 (${tier === 1 ? "추정가격 10억 원 이상 제조" : tier === 2 ? "고시금액 이상" : "고시금액 미만"})`,
      source: sme ? `중소기업자간 경쟁물품 계약이행능력심사 세부기준 등: 원문 배점 미대조. 배점 구조는 ${SRC.goods}` : SRC.goods,
      status: sme ? "추정" : "일부 추정", estimates,
    },
    items, price, pass: 85, lowerLimit: sme ? 89.995 : tier === 3 ? 86.245 : 82.495, trust,
    notes: ["종합평점 85점 이상이면 낙찰자로 결정됩니다."],
  };
}

function constructionTable(amt: number, m: string, bid: Pick<Bid, "category">): Table {
  const estimates: string[] = ["입찰가격은 (입찰가격 − A) ÷ (예정가격 − A)로 계산하지만 A값(보험료 등)은 공고마다 달라 투찰률로 계산"];
  const special = /전기|정보통신|소방|국가유산/.test(m) || (!m && bid.category === "전기·통신공사");
  const byRecord = /실적에\s*의한\s*경쟁입찰[,)]/.test(m) || /\(실적제한[,)]/.test(m);
  let tier: number;
  if (amt >= 5_000_000_000) tier = 1;
  else if (amt >= 1_000_000_000) tier = 2;
  else if (amt >= 300_000_000) tier = special ? 2 : 3;
  else if (amt >= (special ? 80_000_000 : 200_000_000)) tier = 4;
  else tier = 5;
  const tierName = special
    ? ["", "100억 원 미만 50억 원 이상", "50억 원 미만 3억 원 이상", "", "3억 원 미만 8천만 원 이상", "8천만 원 미만"][tier]
    : ["", "100억 원 미만 50억 원 이상", "50억 원 미만 10억 원 이상", "10억 원 미만 3억 원 이상", "3억 원 미만 2억 원 이상", "2억 원 미만"][tier];
  const exp = [0, 15, 15, 10, 5, 0][tier];
  const mgmt = [0, 15, 15, 10, 5, 10][tier];
  const priceMax = [0, 50, 70, 80, 90, 90][tier];
  const lower = [0, 87.495, amt >= 1_000_000_000 ? 88.745 : 89.745, 89.745, 89.745, 89.745][tier];
  const items: EvalItem[] = [];
  if (exp) {
    items.push(mk(`시공경험 (최근 5년 해당 업종 실적)`, exp, "performance", "수행능력", byRecord
      ? { bands: constructionPerfBands(exp, tier === 1), basis: "평가기준 대비 실적 백분율 등급" }
      : { perfLinear: tier === 1 ? 2 : 1, basis: `실적계수 = 실적 ÷ (기초금액 × ${tier === 1 ? 2 : 1}), 점수 = 실적계수 × ${exp}` }));
    if (tier >= 3) estimates.push("10억 원 미만 시공경험 평가방법은 50억 원 미만 구간을 준용");
  }
  items.push(credit(mgmt, constructionCredit(mgmt), 0, "신용평가등급표(35점 기준) × 배점 ÷ 35, 유효한 등급이 없으면 0점"));
  if (tier === 1) {
    items.push(mk("자재 및 인력조달가격의 적정성", 10, "plan", "수행능력", { basis: "자재·인력 단가 적정성 (서류 기준)" }));
    items.push(mk("하도급관리계획의 적정성", 10, "plan", "수행능력", { basis: "하도급 관리계획 (서류 기준)" }));
    estimates.push("자재·인력조달, 하도급관리계획은 만점 기준으로 계산");
  }
  items.push(mk("신뢰도 가감점(신인도)", 0, "bonus", "신인도", { basis: tier === 1 ? "일반신인도 ±1.0, 건설안전 −3 ~ +1" : "일반신인도 −1 ~ +4, 건설안전 −8 ~ +2" }));
  const nonPrice = 100 - priceMax;
  const k = tier === 1 ? 2 : round2((priceMax - (95 - nonPrice)) / (90 - lower));
  const cap = round2(90 + (priceMax - (95 - nonPrice)) / k);
  const price = qualPrice(priceMax, 90, k, cap, tier !== 1);
  if (tier !== 1) estimates.push(`가격 계수 ${k}는 통과점수 95점과 낙찰하한율 ${lower}%로 역산`);
  items.push(mk("입찰가격", priceMax, "price", "입찰가격", { basis: price.text }));
  return {
    ref: { name: `조달청 시설공사 (추정가격 ${tierName}${special ? ", 전기·정보통신·소방 등" : ""})`, source: SRC.cons, status: "일부 추정", estimates },
    items, price, pass: 95, lowerLimit: lower,
    trust: estimatedRule(`조달청 시설공사 신인도 (${tier === 1 ? "±1" : "+4 ~ △1"}, 항목 점수는 일반용역 기준 준용)`, tier === 1 ? 1 : 4, 1),
    notes: ["종합평점 95점 이상이면 낙찰자로 결정됩니다.", "예정가격 100억 원 미만 공사는 입찰가격이 순공사원가의 98% 미만이면 심사에서 제외됩니다."],
  };
}

/**
 * 낙찰방법 문구로 기준표 출처를 가른다.
 * 조달청 기준표 이름(시설분야용역, 기술용역 평가기준, 물품 제조 또는 구매입찰, "…인 공사(종합공사)")과
 * 행정안전부 기준표 이름("…인 입찰공사", "…인 용역", P.Q 기술용역, "…인 물품의 평가기준")이 다르다.
 */
export function basisKind(b?: EvalBasis): "조달청" | "행정안전부" | "기관 자체" | "모름" {
  const m = (b?.method ?? "").replace(/^적격심사제-/, "");
  if (!/적격심사|추정가격|평가기준/.test(b?.method ?? "")) return "모름";
  if (/관리규정외|수기심사/.test(m)) return "기관 자체";
  if (/입찰공사|P\.?\s*Q|물품의\s*평가기준|재난복구/.test(m)) return "행정안전부";
  if (/^추정가격\s*\d+억원\s*(미만|이상)(\s*\d+억원\s*(미만|이상))?인\s*용역$/.test(m)) return "행정안전부";
  if (/^추정가격\s*\d+억\s*(미만|이상)$/.test(m)) return "기관 자체";
  return "조달청";
}

/** 공고에 맞는 기준표 */
function pickTable(bid: Pick<Bid, "bizType" | "baseAmount" | "category">, b?: EvalBasis): Table {
  const biz: BizType = bid.bizType ?? "용역";
  const amt = b?.presmpt || bid.baseAmount;
  const m = b?.method ?? "";
  if (biz === "공사") return constructionTable(amt, m, bid);
  if (biz === "물품" || biz === "외자") return goodsTable(amt, m);
  const tech = b?.srvceDiv === "기술용역" || /기술\s*용역|설계|감리|건설사업관리/.test(m) || (!b?.srvceDiv && bid.category === "설계·감리·엔지니어링");
  if (tech) return techTable(amt);
  return generalTable(generalField(bid, m), amt);
}

/** 낙찰하한율로 쓸 수 있는 값인지 (공고에 0.001, 1, 100 같은 값이 들어오기도 한다) */
export const usableLwlt = (v?: number) => (v !== undefined && v >= 70 && v <= 95 ? v : undefined);

/**
 * 공고 낙찰하한율이 기준표 값과 다르면(행정안전부·기관 자체 기준, 특례 물품 등) 배점 구조는 그대로 두고
 * 가격 산식 계수를 공고 낙찰하한율에서 통과점수가 정확히 나오도록 역산한다.
 */
function calibrate(t: Table, kind: ReturnType<typeof basisKind>, rawLwlt?: number, force = false, stdName?: string): Table {
  const lwlt = usableLwlt(rawLwlt);
  if (!lwlt) return stdName ? named(t, kind, stdName) : t;
  const foreign = kind === "행정안전부" || kind === "기관 자체";
  if (!foreign && !force && t.lowerLimit !== undefined && Math.abs(lwlt - t.lowerLimit) <= 0.02) return { ...t, lowerLimit: lwlt };
  const priceItem = t.items.find((i) => i.kind === "price");
  if (!priceItem) return t;
  const nonPrice = t.items.filter((i) => i.kind !== "price" && i.kind !== "bonus").reduce((s, i) => s + i.max, 0);
  const room = priceItem.max - (t.pass - nonPrice);
  // 2026년 개정(조달청 공사·용역·물품, 행정안전부 공사)으로 기준 투찰률이 90이 됐다. 하한율이 88 아래인 기준도 90으로 계산한다
  const base = 90;
  const gap = base - lwlt;
  const k = gap > 0.05 && room > 0 ? round2(room / gap) : t.price.k ?? 4;
  const capAt = base + Math.max(0, room) / k;
  const price: PriceRule = { ...qualPrice(priceItem.max, base, k, capAt, true), text: qualPrice(priceItem.max, base, k, round2(capAt), true).text };
  const estimate = `가격 산식 계수는 공고 낙찰하한율 ${lwlt}%에서 통과점수 ${t.pass}점이 되도록 역산`;
  const items = t.items.map((i) => (i.kind === "price" ? { ...i, basis: price.text } : i));
  if (!foreign) {
    return { ...t, items, price, lowerLimit: lwlt, ref: { ...t.ref, status: t.ref.status === "공식 대조" ? "일부 추정" : t.ref.status, estimates: [...t.ref.estimates, `공고 낙찰하한율 ${lwlt}%가 기준표 값 ${t.lowerLimit !== undefined ? round3(t.lowerLimit) : "-"}%와 달라 ${estimate}`] } };
  }
  const who = stdName ? `「${stdName}」` : kind === "행정안전부" ? "행정안전부 지방자치단체 낙찰자 결정기준" : "발주기관 자체 기준";
  return {
    ...t,
    items,
    price,
    lowerLimit: lwlt,
    ref: {
      ...t.ref,
      name: `${who} (배점 구조는 ${t.ref.name} 준용)`,
      source: `${who}: 원문 기준표 미대조. 배점 구조는 ${t.ref.source}`,
      status: "추정",
      estimates: [`${who} 원문을 대조하지 못해 같은 업무·금액대 조달청 기준표 배점을 씀`, estimate, ...t.ref.estimates],
    },
  };
}

/** 하한율이 없어 역산하지 않을 때도 공고서가 적은 기준 이름은 붙인다 */
function named(t: Table, kind: ReturnType<typeof basisKind>, stdName: string): Table {
  if (kind === "조달청") return t;
  return { ...t, ref: { ...t.ref, name: `「${stdName}」 (배점 구조는 ${t.ref.name} 준용)`, source: `「${stdName}」: 원문 기준표 미대조. 배점 구조는 ${t.ref.source}`, status: "추정", estimates: [`「${stdName}」 원문을 대조하지 못해 같은 업무·금액대 조달청 기준표 배점을 씀`, ...t.ref.estimates] } };
}

/** 협상에 의한 계약: 공고의 기술·가격 배점 비율을 쓴다 */
function negoSheet(b?: EvalBasis): EvalSheet {
  const tech = b?.techRatio && b?.priceRatio && b.techRatio + b.priceRatio === 100 ? b.techRatio : 80;
  const s = tech / 80;
  const r = (n: number) => round2(n * s);
  const items: EvalItem[] = [
    mk("유사 사업 수행실적", r(8), "performance", "정량평가", { basis: "최근 유사 사업 실적 금액·건수 (공고서 기준)" }),
    mk("경영상태 (신용평가등급)", r(6), "credit", "정량평가", { basis: "회사채·기업어음·기업신용평가등급" }),
    mk("참여 인력 보유", r(4), "staff", "정량평가", { basis: "투입 인력 자격·경력" }),
    mk("신뢰도 가점(신인도)", r(2), "bonus", "정량평가", { basis: "여성·장애인·사회적기업, 고용우수 등" }),
    mk("사업 이해도·추진 전략", r(15), "qualitative", "정성평가"),
    mk("수행 방법론·세부 계획", r(25), "qualitative", "정성평가"),
    mk("관리 방안 (품질·일정·보안·안전)", r(12), "qualitative", "정성평가"),
    mk("제안 발표·질의응답", r(8), "qualitative", "정성평가"),
    mk("입찰가격", 100 - tech, "price", "입찰가격", { basis: "배점 × (최저 입찰가격 ÷ 해당 입찰가격). 최저 입찰가격이 추정가격의 70% 미만이면 70%로 계산" }),
  ];
  const fromNotice = tech !== 80 || !!b?.techRatio;
  return {
    method: "협상에 의한 계약",
    title: `협상에 의한 계약 제안서 평가 (기술 ${tech} · 가격 ${100 - tech})`,
    source: "template",
    confidence: "보통",
    pass: { kind: "techRatio", ratio: 0.85 },
    trust: estimatedRule("협상계약 가점 (평가표 배점 기준, 항목 점수는 일반용역 기준 준용)", r(2), r(2)),
    price: { kind: "nego", text: "배점 × (최저 입찰가격 ÷ 해당 입찰가격)" },
    criteria: {
      name: `협상에 의한 계약 (기술 ${tech} : 가격 ${100 - tech}${fromNotice ? ", 공고 배점" : ", 공고 배점 없음"})`,
      source: "재정경제부 계약예규 「협상에 의한 계약체결기준」 제안서 평가 (기술능력 평가점수가 배점의 85% 이상이면 협상적격자)",
      status: "일부 추정",
      estimates: ["기술평가 세부 항목 배점은 공고 제안요청서마다 달라 일반적인 구성으로 나눔", ...(fromNotice ? [] : ["공고에 기술·가격 비율이 없어 80 : 20으로 계산"])],
      methodText: b?.method,
    },
    notes: ["기술능력 평가점수가 배점의 85% 이상인 업체가 협상적격자가 됩니다.", "공고 첨부의 제안요청서 평가표가 있으면 그 배점으로 바꿔 계산합니다."],
    items,
  };
}

/** 공고에 맞는 평가표 (공고 첨부에서 평가표를 못 읽었을 때 쓰는 기준표) */
export function criteriaSheet(bid: Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">, b?: EvalBasis, notice?: NoticeCriteria): EvalSheet {
  if (bid.contractMethod === "협상에 의한 계약") {
    const s = negoSheet(b);
    return notice?.pass ? { ...s, pass: notice.pass.value } : s;
  }
  if (bid.contractMethod !== "적격심사") {
    return {
      method: bid.contractMethod,
      title: `${bid.contractMethod} (가격 중심)`,
      source: "template",
      confidence: "보통",
      notes: ["이 계약방법은 별도 평가점수 없이 자격 충족 후 가격으로 낙찰자를 정합니다."],
      price: { kind: "lowest", text: "예정가격 이하 최저가 (낙찰하한율이 있으면 그 이상)" },
      lowerLimit: usableLwlt(b?.lwlt) ?? bid.lowerLimitRate,
      items: [mk("입찰가격", 100, "price", "입찰가격", { basis: "예정가격 이하 최저가 (하한율 적용 시 그 이상)" })],
    };
  }
  // 공고서가 적용 기준(발주기관 기준, 환경부 건설폐기물 기준 등)과 통과점수를 적었으면 그것이 우선이다
  const std = notice?.standard;
  const kind = std ? (std.issuer === "조달청" || std.issuer === "행정안전부" ? std.issuer : "기관 자체") : basisKind(b);
  const forTable: EvalBasis | undefined = std || notice?.tier ? { ...b, method: [b?.method, std?.value, notice?.tier?.value].filter(Boolean).join(" ") } : b;
  let base = pickTable(bid, forTable);
  const noticePass = notice?.pass?.value.kind === "total" ? notice.pass.value.score : undefined;
  const passChanged = noticePass !== undefined && noticePass !== base.pass;
  if (passChanged) base = { ...base, pass: noticePass, notes: [`종합평점 ${noticePass}점 이상이면 낙찰자로 결정됩니다 (공고서).`] };
  const t = calibrate(base, kind, b?.lwlt, passChanged, std?.value);
  const lwlt = usableLwlt(b?.lwlt);
  const notes = [...t.notes];
  return {
    method: "적격심사",
    title: t.ref.name,
    source: "template",
    confidence: t.ref.status === "공식 대조" ? "높음" : "보통",
    pass: { kind: "total", score: t.pass },
    trust: t.trust,
    price: t.price,
    lowerLimit: lwlt ?? t.lowerLimit,
    refAmount: b?.presmpt,
    criteria: { ...t.ref, methodText: b?.method },
    notes,
    items: t.items,
  };
}

/**
 * 공고 첨부에서 읽은 평가표에 기준표의 세부 산식을 보탠다:
 * 배점이 같은 항목은 기준표의 등급표·구간을 쓰고, 가격 산식·낙찰하한율·근거는 기준표를 쓴다.
 */
export function enrichSheet(extracted: EvalSheet, base: EvalSheet): EvalSheet {
  const used = new Set<string>();
  const items = extracted.items.map((it) => {
    const twin = base.items.find((b) => !used.has(b.id) && b.kind === it.kind && Math.abs(b.max - it.max) < 0.01 && it.max > 0);
    if (!twin) return it;
    used.add(twin.id);
    return {
      ...it,
      bands: it.bands ?? twin.bands,
      lookup: it.bands ? undefined : twin.lookup,
      perfLinear: it.bands ? undefined : twin.perfLinear,
      smallFirmFull: twin.smallFirmFull,
    };
  });
  const priceSame = extracted.items.find((i) => i.kind === "price")?.max === base.items.find((i) => i.kind === "price")?.max;
  return {
    ...extracted,
    items,
    price: priceSame ? base.price : extracted.price,
    lowerLimit: base.lowerLimit,
    criteria: base.criteria ? { ...base.criteria, name: `공고 원문 평가표 + ${base.criteria.name}` } : undefined,
    pass: extracted.pass ?? base.pass,
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }

/** 검증용: 공고 값으로 보정하기 전 기준표의 이름·낙찰하한율·출처 구분 */
export function tableCheck(bid: Pick<Bid, "bizType" | "baseAmount" | "category">, b?: EvalBasis): { kind: ReturnType<typeof basisKind>; name: string; lowerLimit?: number; status: CriteriaRef["status"] } {
  const t = pickTable(bid, b);
  return { kind: basisKind(b), name: t.ref.name, lowerLimit: t.lowerLimit, status: t.ref.status };
}

/**
 * 공고 원문에서 읽은 배점표가 그대로 써도 될 만큼 온전한지.
 * 가격 배점을 실제로 읽었고 합계가 100이거나, 협상계약에서 기술 배점 합이 공고의 기술 배점과 같아야 한다.
 * (문서 전체에서 세부 기준·등급표 숫자를 함께 잡으면 합계가 100을 넘거나, 모자란 만큼 가격으로 채워져 100처럼 보인다)
 */
export function adoptable(ex: EvalSheet, b?: EvalBasis): boolean {
  const price = ex.items.filter((i) => i.kind === "price");
  // AI 판독은 원문 문구 확인을 거쳤으므로 "사업수행능력 + 입찰가격" 같은 두 항목 표도 받는다
  const enough = ex.reader?.by === "ai" && price.length === 1 ? ex.items.filter((i) => i.max > 0).length >= 2 : ex.items.length >= 3;
  if (!enough || price.length > 1) return false;
  // 가격평가가 없는 공고(기술 100점, 비예산 사업 등): 나라장터에 가격 배점이 없고 항목 합이 100점이어야 한다
  if (price.length === 0) {
    // 적격심사의 낙찰 평가표는 늘 입찰가격 배점이 있다. 가격 없는 표는 계약 전 안전보건수준 평가표나
    // 압축 첨부 안 예규 전문의 다른 표(기술제안 평가 등)를 읽은 것이다
    if (/^적격/.test(b?.method ?? "")) return false;
    if ((b?.priceRatio ?? 0) > 0) return false;
    if (b?.techRatio !== undefined && Math.abs(b.techRatio - 100) > 0.5) return false;
    return Math.abs(ex.items.reduce((a, i) => a + i.max, 0) - 100) <= 0.5;
  }
  // 산식·등급 줄을 항목으로 잘못 읽은 경우
  if (ex.items.some((i) => /[=＝]|^평점|^[o□■①-⑳]\s/.test(i.label))) return false;
  // 협상계약은 공고의 기술·가격 배점(나라장터 목록 값)과 맞아야 한다
  if (b?.priceRatio !== undefined && Math.abs(price[0].max - b.priceRatio) > 0.5) return false;
  const sum = ex.items.reduce((a, i) => a + i.max, 0);
  const tech = sum - price[0].max;
  if (!ex.priceFilled) return Math.abs(sum - 100) <= 0.5;
  return b?.techRatio !== undefined && Math.abs(tech - b.techRatio) <= 0.5;
}

/**
 * 공고 한 건의 평가표: 공고 원문 > 공고서 문장 > 기준표 순으로 쓴다.
 * - 원문 배점표가 온전하면 그 배점에 기준표의 등급표·가격 산식을 보탠다.
 * - 협상계약에서 정량평가 표만 읽혔으면, 정량 항목은 공고 배점으로, 나머지 기술 배점은 정성평가로 둔다.
 * - 어느 경우든 공고서에 적힌 통과점수·적용 기준·낙찰하한율·신인도 범위·기준비율·실적 인정 범위를 덮어쓴다.
 */
export function bidSheet(
  bid: Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">,
  b: EvalBasis | undefined,
  opts: { extracted?: EvalSheet; notice?: NoticeCriteria; quant?: { items: EvalItem[]; total: number; quote: string } } = {},
): EvalSheet {
  const { extracted, notice, quant } = opts;
  const basis: EvalBasis | undefined = notice?.lowerLimit && !usableLwlt(b?.lwlt) ? { ...b, lwlt: notice.lowerLimit.value } : b;
  const tpl = criteriaSheet(bid, basis, notice);
  const facts: NonNullable<EvalSheet["noticeFacts"]> = [];
  let sheet: EvalSheet;
  if (extracted && adoptable(extracted, b)) {
    sheet = enrichSheet(extracted, tpl);
    sheet.pass = notice?.pass?.value ?? extracted.pass ?? tpl.pass;
    facts.push({ label: "평가항목·배점", value: `공고 원문 배점표 ${extracted.items.length}개 항목`, quote: extracted.notes[0] ?? "" });
  } else if (quant && tpl.method === "협상에 의한 계약") {
    const price = tpl.items.find((i) => i.kind === "price");
    const techMax = 100 - (price?.max ?? 0);
    const rest = round2(techMax - quant.total);
    const items: EvalItem[] = [
      ...quant.items.map((i) => ({ ...i, group: "정량평가" })),
      ...(rest > 0 ? [mk("정성평가 (제안서·발표)", rest, "qualitative", "정성평가", { basis: `기술 배점 ${techMax}점에서 공고 정량평가 ${quant.total}점을 뺀 나머지` })] : []),
      ...(price ? [price] : []),
    ];
    sheet = { ...tpl, items, source: "extracted", title: `공고 정량평가 표 + ${tpl.title}`, confidence: "보통" };
    facts.push({ label: "정량평가 배점", value: quant.items.map((i) => `${i.label} ${i.max}점`).join(", "), quote: quant.quote });
  } else {
    sheet = tpl;
  }
  if (!notice) return sheet;
  if (notice.standard) facts.push({ label: "적용 기준", value: notice.standard.value + (notice.tier ? ` · ${notice.tier.value}` : ""), quote: notice.standard.quote });
  else if (notice.tier) facts.push({ label: "적용 구간", value: notice.tier.value, quote: notice.tier.quote });
  if (notice.pass) {
    const p = notice.pass.value;
    facts.push({ label: "통과 기준", value: p.kind === "total" ? `${sheet.method === "적격심사" ? "종합평점" : "합산점수"} ${p.score}점 이상` : `기술점수가 배점의 ${Math.round(p.ratio * 100)}% 이상`, quote: notice.pass.quote });
    sheet.pass = p;
  }
  if (notice.lowerLimit) facts.push({ label: "낙찰하한율", value: `${notice.lowerLimit.value}%`, quote: notice.lowerLimit.quote });
  if (notice.trustRange && sheet.trust) {
    const { plus, minus } = notice.trustRange.value;
    sheet.trust = { ...sheet.trust, plusCap: plus, minusCap: minus, capFromNotice: true, fromNotice: [...(sheet.trust.fromNotice ?? []), `상·하한 +${plus} ~ △${minus}`] };
    facts.push({ label: "신뢰도 가감점 범위", value: `+${plus} ~ △${minus}`, quote: notice.trustRange.quote });
  }
  if (notice.financeBase) {
    sheet.financeBase = notice.financeBase.value;
    const f = notice.financeBase.value;
    facts.push({ label: "경영상태 기준비율", value: [f.equity !== undefined ? `자기자본비율 ${f.equity}%` : "", f.current !== undefined ? `유동비율 ${f.current}%` : ""].filter(Boolean).join(", "), quote: notice.financeBase.quote });
  }
  if (notice.refAmount) {
    sheet.refAmount = notice.refAmount.value;
    facts.push({ label: "평가 기준금액", value: `${notice.refAmount.value.toLocaleString("ko-KR")}원`, quote: notice.refAmount.quote });
  }
  if (notice.recognition) {
    const key = (t: string) => t.replace(/[\s\d)①-⑳.,]/g, "").slice(0, 30);
    const merged: string[] = [];
    for (const t of [...notice.recognition, ...(sheet.recognition ?? [])]) if (!merged.some((m) => key(m) === key(t))) merged.push(t);
    sheet.recognition = merged.slice(0, 6);
    facts.push({ label: "실적 인정 범위", value: notice.recognition[0], quote: notice.recognition[0] });
  }
  sheet.noticeFacts = facts;
  return sheet;
}

/* ---------- 기준표 화면 (발주처별 낙찰하한율·통과점수·실적 기준) ---------- */

export interface StandardTier {
  biz: "공사" | "용역" | "물품";
  /** 기준표 이름 */
  name: string;
  source: string;
  status: CriteriaRef["status"];
  lowerLimit?: number;
  pass: number;
  /** 실적 평가 항목 (없으면 실적 평가 없음) */
  perf?: { label: string; max: number; multiple: string; basis?: string };
}

/** 실적 평가가 만점이 되는 기준을 "추정가격의 1배" 같은 배수 문장으로 */
export function perfMultiple(it: EvalItem): string {
  if (it.perfLinear) return `기초금액의 ${it.perfLinear}배 실적이면 만점 (실적 ÷ 기준금액 × 배점)`;
  const top = it.bands?.find((b) => b.unit === "%");
  if (top) return `추정가격의 ${Math.round(top.min) / 100}배 이상이면 만점 (${it.bands!.filter((b) => b.unit === "%").map((b) => b.cond).join(", ")})`;
  return "공고서 기준";
}

/** 조달청 기준표를 업무·금액 구간마다 하나씩 (화면 표시용. 값은 공고 평가에 쓰는 pickTable 과 같다) */
export function standardTiers(): StandardTier[] {
  const cases: [StandardTier["biz"], Pick<Bid, "bizType" | "baseAmount" | "category">, EvalBasis | undefined][] = [
    ["공사", { bizType: "공사", baseAmount: 7_000_000_000, category: "건축·토목공사" }, undefined],
    ["공사", { bizType: "공사", baseAmount: 3_000_000_000, category: "건축·토목공사" }, undefined],
    ["공사", { bizType: "공사", baseAmount: 500_000_000, category: "건축·토목공사" }, undefined],
    ["공사", { bizType: "공사", baseAmount: 250_000_000, category: "건축·토목공사" }, undefined],
    ["공사", { bizType: "공사", baseAmount: 100_000_000, category: "건축·토목공사" }, undefined],
    ["공사", { bizType: "공사", baseAmount: 3_000_000_000, category: "전기·통신공사" }, { method: "전기" }],
    ["공사", { bizType: "공사", baseAmount: 100_000_000, category: "전기·통신공사" }, { method: "전기" }],
    ["공사", { bizType: "공사", baseAmount: 50_000_000, category: "전기·통신공사" }, { method: "전기" }],
    ["용역", { bizType: "용역", baseAmount: 600_000_000, category: "청소" }, { method: "시설분야" }],
    ["용역", { bizType: "용역", baseAmount: 300_000_000, category: "청소" }, { method: "시설분야" }],
    ["용역", { bizType: "용역", baseAmount: 100_000_000, category: "청소" }, { method: "시설분야" }],
    ["용역", { bizType: "용역", baseAmount: 600_000_000, category: "연구·조사·컨설팅" }, { method: "학술연구" }],
    ["용역", { bizType: "용역", baseAmount: 300_000_000, category: "연구·조사·컨설팅" }, { method: "학술연구" }],
    ["용역", { bizType: "용역", baseAmount: 100_000_000, category: "연구·조사·컨설팅" }, { method: "학술연구" }],
    ["용역", { bizType: "용역", baseAmount: 600_000_000, category: "IT·소프트웨어" }, { method: "소프트웨어" }],
    ["용역", { bizType: "용역", baseAmount: 100_000_000, category: "IT·소프트웨어" }, { method: "소프트웨어" }],
    ["용역", { bizType: "용역", baseAmount: 600_000_000, category: "폐기물·환경" }, { method: "폐기물" }],
    ["용역", { bizType: "용역", baseAmount: 100_000_000, category: "폐기물·환경" }, { method: "폐기물" }],
    ["용역", { bizType: "용역", baseAmount: 1_500_000_000, category: "설계·감리·엔지니어링" }, { srvceDiv: "기술용역" }],
    ["용역", { bizType: "용역", baseAmount: 700_000_000, category: "설계·감리·엔지니어링" }, { srvceDiv: "기술용역" }],
    ["용역", { bizType: "용역", baseAmount: 300_000_000, category: "설계·감리·엔지니어링" }, { srvceDiv: "기술용역" }],
    ["용역", { bizType: "용역", baseAmount: 100_000_000, category: "설계·감리·엔지니어링" }, { srvceDiv: "기술용역" }],
    ["물품", { bizType: "물품", baseAmount: 1_500_000_000, category: "기타 물품" }, { method: "물품 제조" }],
    ["물품", { bizType: "물품", baseAmount: 300_000_000, category: "기타 물품" }, { method: "물품 구매" }],
    ["물품", { bizType: "물품", baseAmount: 100_000_000, category: "기타 물품" }, { method: "물품 구매" }],
    ["물품", { bizType: "물품", baseAmount: 300_000_000, category: "기타 물품" }, { method: "중소기업자간 경쟁" }],
    ["물품", { bizType: "물품", baseAmount: 100_000_000, category: "기타 물품" }, { method: "중소기업자간 경쟁" }],
  ];
  const out: StandardTier[] = [];
  for (const [biz, bid, b] of cases) {
    const t = pickTable(bid, b);
    if (out.some((x) => x.name === t.ref.name)) continue;
    const p = t.items.find((i) => i.kind === "performance");
    out.push({
      biz, name: t.ref.name, source: t.ref.source, status: t.ref.status, lowerLimit: t.lowerLimit, pass: t.pass,
      perf: p ? { label: p.label, max: p.max, multiple: perfMultiple(p), basis: p.basis } : undefined,
    });
  }
  return out;
}
