/**
 * 평가점수 예측 엔진 (프리미엄).
 *
 * 1) 평가표 확보: 공고문·규격서 텍스트에서 평가항목과 배점을 추출한다(extractSheet).
 *    원문이 없으면 계약방법·업무 구분·금액으로 표준 평가표를 고른다(templateSheet).
 * 2) 기업 정보: 나라장터 조달업체 정보(업력·인력·등록 업종)와 고객이 낸 서류(신용평가등급확인서, 실적증명)를 합친다.
 * 3) 예측: 항목 유형별 채점 규칙으로 예상 점수를 내고, 통과 기준과 비교한다(predict).
 *
 * 표준 평가표와 채점 규칙은 조달청 적격심사·협상계약 평가 구조를 단순화한 추정 모델이다.
 * 실제 점수는 공고마다 세부기준이 달라, 공고문에서 추출한 배점이 있으면 그 배점을 우선한다.
 */
import type { Bid, ContractMethod } from "./types";
import { estimatedRule, generalServiceRule, parseTrustRule, scoreTrust, type TrustRule, type TrustScore } from "./trustscore";
import { criteriaSheet, type CriteriaRef, type EvalBasis } from "./criteria";
import { won } from "./format";

/* ---------- 신용평가등급 ---------- */

export const CREDIT_GRADES = [
  "AAA", "AA+", "AA0", "AA-", "A+", "A0", "A-",
  "BBB+", "BBB0", "BBB-", "BB+", "BB0", "BB-",
  "B+", "B0", "B-", "CCC+", "CCC0", "CCC-", "CC", "C", "D",
] as const;
export type CreditGrade = (typeof CREDIT_GRADES)[number];

/** 신용평가등급확인서 등 텍스트에서 등급을 찾는다. 'BBB' 처럼 부호가 없으면 0으로 본다 */
export function findCreditGrade(text: string): CreditGrade | undefined {
  const t = text.replace(/\s+/g, " ");
  const re = /(?:신용\s*평가\s*등급|신용등급|회사채\s*등급|기업\s*신용\s*등급|등\s*급)\s*[:：]?\s*(AAA|AA|A|BBB|BB|B|CCC|CC|C|D)\s*([+\-0]|zero|플러스|마이너스)?(?![A-Z])/i;
  const m = t.match(re) ?? t.match(/(?<![A-Z])(AAA|AA|BBB|BB|CCC|CC)\s*([+\-0])?(?![A-Z])/);
  if (!m) return undefined;
  const base = m[1].toUpperCase();
  const sign = (m[2] ?? "").replace("플러스", "+").replace("마이너스", "-");
  const cand = (["AAA", "CC", "C", "D"].includes(base) ? base : `${base}${sign || "0"}`) as CreditGrade;
  return (CREDIT_GRADES as readonly string[]).includes(cand) ? cand : undefined;
}

/* ---------- 평가표 ---------- */

/** 항목 유형: 채점 규칙을 고르는 기준 */
export type ItemKind =
  | "performance" | "credit" | "price" | "years" | "staff" | "bonus" | "qualitative" | "other"
  /** 사업수행능력(PQ) 평가점수 환산 (기술용역) */
  | "capability"
  /** 확약서·계획서를 내면 만점인 항목 (근로조건 이행계획, 하도급관리계획 등) */
  | "plan"
  /** 재무비율 (자기자본비율·유동비율) */
  | "finance"
  /** 물품 기술등급 (T1~T8) */
  | "techGrade";

export interface EvalItem {
  id: string;
  group: string;      // 수행능력·경영상태·기술능력·신인도·입찰가격 등
  label: string;
  max: number;        // 배점 (감점 항목은 0)
  kind: ItemKind;
  basis?: string;     // 원문 문구 또는 산식 설명
  /** 공고 세부기준의 점수 구간 (예: 실적 100% 이상 15점, 80% 이상 13점) */
  bands?: ScoreBand[];
  /** 이 항목에서 인정하는 서류·실적 범위 (원문 문장) */
  recognition?: string[];
  /** 정성 항목의 평가 요소 (원문 문장) */
  criteria?: string[];
  /** 기준표의 등급별 점수 (신용평가등급, 기술등급). missing 이 −1 이면 자료가 없을 때 최저등급 점수 */
  lookup?: { of: "credit" | "techGrade"; points: Record<string, number>; missing: number };
  /** 실적계수 방식: 점수 = 배점 × min(1, 실적 ÷ (기준금액 × perfLinear)) */
  perfLinear?: number;
  /** 창업기업·소기업·소상공인이면 만점 (물품 고시금액 미만 경영상태) */
  smallFirmFull?: boolean;
}

/** 입찰가격 평점 산식 */
export interface PriceRule {
  /** qual: 배점 − k × |기준 − 투찰률|, nego: 배점 × 최저가 ÷ 입찰가, lowest: 최저가 */
  kind: "qual" | "nego" | "lowest";
  base?: number;
  k?: number;
  /** 이 투찰률 이상은 이 투찰률로 계산 */
  capAt?: number;
  min?: number;
  /** 계수를 통과점수·하한율로 역산했는지 */
  derived?: boolean;
  /** 화면 표시 산식 */
  text: string;
}

/**
 * 점수 구간. unit 이 grade 면 CREDIT_GRADES 순번으로 best(높은 등급) ~ worst(낮은 등급) 범위,
 * 그 밖에는 min 이상(값 기준: 실적은 기초금액 대비 %, 인력은 명, 업력은 년)이면 points.
 */
export interface ScoreBand {
  unit: "%" | "grade" | "명" | "년" | "건";
  min: number;
  best?: number;
  worst?: number;
  points: number;
  /** 원문 조건 (화면 표시용) */
  cond: string;
}

/** 정성평가 등급 (예: 탁월 100%, 우수 90%, 보통 80%) */
export interface ScaleLevel { label: string; ratio: number }

export interface EvalSheet {
  method: ContractMethod | "종합심사";
  title: string;
  items: EvalItem[];
  /** 통과 기준: 총점 기준 또는 기술점수 비율 기준 */
  pass?: { kind: "total"; score: number } | { kind: "techRatio"; ratio: number };
  source: "extracted" | "template";
  /** 원문 배점표를 누가 읽었는지 (없으면 규칙 파서). AI 판독은 원문 문구·합계 검증을 통과한 경우만 */
  reader?: { by: "ai"; model: string };
  /** 추출 신뢰도 (배점 합계가 100에 가까운지 등) */
  confidence: "높음" | "보통" | "낮음";
  notes: string[];
  /** 정성평가 등급표 */
  scale?: ScaleLevel[];
  /** 신뢰도 가감점(신인도) 기준표: 항목별 점수와 상·하한 */
  trust?: TrustRule;
  /** 평가위원 점수 처리 방식 (예: 최고·최저 점수를 뺀 산술평균) */
  panelRule?: string;
  /** 공고 전체에 걸친 서류 인정 기준 (기준일, 발급 기관, 공동수급 지분 등) */
  recognition?: string[];
  /** 입찰가격 평점 산식 */
  price?: PriceRule;
  /** 낙찰하한율 (%) */
  lowerLimit?: number;
  /** 실적 비율 등의 기준 금액 (추정가격). 없으면 공고 기초금액 */
  refAmount?: number;
  /** 적용한 기준표와 근거 */
  criteria?: CriteriaRef;
  /** 공고서에서 읽어 기준표보다 우선 적용한 값 (화면에 원문 근거로 보여 준다) */
  noticeFacts?: NoticeFactView[];
  /** 공고서의 경영상태 기준비율 (자기자본비율·유동비율, %) */
  financeBase?: { equity?: number; current?: number };
  /** 원문에 가격 배점이 없어 100점에서 나머지를 가격으로 채웠는지 */
  priceFilled?: boolean;
}

/** 공고서에서 읽은 기준 한 가지 */
export interface NoticeFactView {
  label: string;
  value: string;
  quote: string;
}

const KIND_RULES: [ItemKind, RegExp][] = [
  ["price", /입찰\s*가격|가격\s*평가|입찰금액|투찰\s*금액|가격점수|가격\s*제안/],
  ["capability", /사업\s*수행\s*능력\s*평가|P\.?\s*Q\s*점수/],
  ["plan", /근로\s*조건\s*이행|하도급\s*관리\s*계획|자재\s*및\s*인력\s*조달/],
  ["techGrade", /기술\s*등급/],
  ["credit", /신용|경영\s*상태|재무|부채비율|유동비율/],
  ["performance", /실적|이행\s*경험|수행\s*경험|시공\s*경험|납품\s*경험|유사\s*용역/],
  ["years", /업력|업무\s*경력|영업\s*기간|설립/],
  ["staff", /기술\s*인력|기술자|참여\s*인력|인력\s*보유|기술\s*능력|자격\s*보유|기술인/],
  ["bonus", /신인도|가점|감점|고용|여성기업|장애인|사회적\s*기업|일자리|녹색|우수/],
  ["qualitative", /제안|정성|계획|방안|이해도|발표|운영|관리\s*방안|품질|안전|보안|전략|방법론|추진|기획|구성|콘텐츠|홍보|디자인|교육|창의|차별/],
];

export function kindOf(label: string): ItemKind {
  for (const [k, re] of KIND_RULES) if (re.test(label)) return k;
  return "other";
}

const GROUP_OF: Record<ItemKind, string> = {
  performance: "수행능력",
  credit: "경영상태",
  price: "입찰가격",
  years: "수행능력",
  staff: "기술능력",
  bonus: "신뢰도 가감점",
  qualitative: "기술(정성)",
  other: "기타",
  capability: "수행능력",
  plan: "이행계획",
  finance: "경영상태",
  techGrade: "기술능력",
};

let seq = 0;
const item = (label: string, max: number, kind: ItemKind, basis?: string, group?: string): EvalItem => ({
  id: `i${++seq}`, label, max, kind, basis, group: group ?? GROUP_OF[kind],
});

/**
 * 공고 첨부에서 평가표를 못 읽었을 때 쓰는 기준표. 공고의 낙찰방법 세부·낙찰하한율·추정가격(basis)이 있으면
 * 그 공고에 맞는 공식 기준표를 고른다 (criteria.ts).
 */
export function templateSheet(bid: Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">, basis?: EvalBasis): EvalSheet {
  const sheet = criteriaSheet(bid, basis);
  return { ...sheet, notes: ["공고 첨부의 평가표를 찾으면 원문 배점으로 바꿔 계산합니다.", ...sheet.notes] };
}

/* ---------- 원문 추출 ---------- */

const POINT_RE = /(\d{1,2}(?:\.\d{1,2})?)\s*점/g;
const SKIP_RE = /(합\s*계|총\s*계|총\s*점|^계$|소\s*계|만점|이상인\s*자|이상\s*득점|평점\s*산식|배점\s*한도|감점\s*한도)/;

/** 이름만 쓴 분야 ("정량", "정성", "가격")는 표 머리글처럼 "…평가"로 쓴다 */
const BARE_FIELD: Record<string, string> = { 정량: "정량평가", 정량적: "정량적 평가", 정성: "정성평가", 정성적: "정성적 평가", 가격: "가격평가", 기술: "기술평가", 계량: "계량평가", 비계량: "비계량평가" };

const OPEN_RE = /[(（[［【「『{｛]/g;
const CLOSE_RE = /[)）\]］】」』}｝]/g;
/** 문장 앞 접속어·조사 ("…10점과 입찰가격평가 20점" 을 자르면 "과 입찰가격평가" 가 남는다) */
const LEAD_RE = /^(?:[,，、;；/·ㆍ∙+＋&:：\])）\]］❑❍▣□■◦○●▪•※*\-–—]+\s*|(?:및|와|과|는|은|을|를|이며|이고|으로|로|중|그리고|또는)\s+)/;

/**
 * 항목 이름 앞뒤에 남은 문장 부호를 지운다.
 * "기술능력평가(정량 10점, 정성 80점), 가격평가 10점" 을 점수마다 자르면 "(정량", ", 정성", ", 가격평가" 가 남는다.
 * 앞의 쉼표·가운뎃점·접속어, 짝이 없는 괄호를 떼고, 이름만 쓴 분야는 "정량평가"처럼 쓴다.
 */
export function tidyItemLabel(s: string, preferInner = false): string {
  let t = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 5; i++) {
    const before = t;
    t = t.replace(LEAD_RE, "").replace(/\s*[,，、;；/·ㆍ∙+＋&:：=]+$/, "").replace(/\s+(?:및|와|과|또는|그리고)$/, "").trim();
    const open = (t.match(OPEN_RE) ?? []).length, close = (t.match(CLOSE_RE) ?? []).length;
    if (open > close) {
      // "기술능력평가(정량" → 괄호 안 "정량" 이 항목 (괄호 앞은 묶음 이름).
      // 괄호 안이 길거나 쉼표가 있으면 40자에서 잘린 설명이라 괄호 앞까지만 쓴다 ("…최근 5년(창업기업, 소기업,")
      let at = -1;
      for (const m of t.matchAll(OPEN_RE)) at = m.index ?? at;
      const inner = t.slice(at + 1).trim();
      const field = preferInner && inner.replace(/[^가-힣A-Za-z]/g, "").length >= 2 && inner.length <= 12 && !/[,，、]/.test(inner) && /(정량|정성|계량|비계량|평가|가격|기술)/.test(inner);
      t = field ? inner : t.slice(0, at).trim();
    } else if (close > open) {
      t = t.replace(/\s*[)）\]］】」』]\s*$/, "").trim();
    }
    if (t === before) break;
  }
  return BARE_FIELD[t] ?? t;
}

/**
 * 한 줄에 여러 항목이 적힌 문장에서 점수 앞 구의 끝 명사구만 남긴다.
 * "협상에 의한 계약 낙찰자 결정기준에 의하여 기술능력 평가" → "기술능력 평가", "는 양평군에서 평가하며, 정성적 평가" → "정성적 평가"
 */
function tailPhrase(s: string): string {
  const words = lastPhrase(s).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    // 조사·어미로 끝나는 낱말(…에, …하여, …하되, …으로, …에서, …하며) 앞에서 멈춘다
    if (out.length && /(에|은|는|로|여|되|며|고|서|면|중|따라|대한|의한)$/.test(w)) break;
    out.unshift(w);
    if (out.length >= 5) break;
  }
  return out.join(" ") || s;
}

/** 문장 끝의 마지막 구 ("…진행하되, 기술능력평가" → "기술능력평가") */
const lastPhrase = (s: string) => (s.split(/[,，、;；:：]/).map((p) => p.trim()).filter(Boolean).pop() ?? s).trim();

/** "기술능력평가(정량" 처럼 괄호가 열린 채 끝나면 괄호 앞 이름 (묶음 이름) */
function openParenParent(s: string): string | undefined {
  // 끝에 빈 괄호가 열려 있으면 ("…[정량적 평가(" 의 "(") 떼고 본다
  const t = s.replace(/^\s*[,，、;；/·ㆍ]\s*/, "").replace(/\s*[(（[［{｛]\s*$/, "").trim();
  const open = (t.match(OPEN_RE) ?? []).length, close = (t.match(CLOSE_RE) ?? []).length;
  if (open <= close) return undefined;
  let at = -1;
  for (const m of t.matchAll(OPEN_RE)) at = m.index ?? at;
  if (t.slice(at + 1).replace(/[^가-힣A-Za-z]/g, "").length < 2) return undefined;
  const head = tailPhrase(t.slice(0, at).replace(/\s*\d{1,3}(?:\.\d+)?\s*(?:점|%)?\s*$/, "").trim());
  const name = tidyItemLabel(head.replace(/\s*[(（]\s*\d+(?:\.\d+)?\s*(?:%|점)?\s*[)）]/g, ""));
  return name.replace(/[^가-힣A-Za-z]/g, "").length >= 2 && /(평가|능력|기술|가격)/.test(name) ? name.slice(0, 20) : undefined;
}

function cleanLabel(s: string, preferInner = false): string {
  return tidyItemLabel(s
    .replace(/^[\s\d.)(①-⑳ㄱ-ㅎ가-하]{0,3}[.)]\s*/, "")
    .replace(/[|│┃\t]+/g, " ")
    .replace(/[○●◦·\-–—:：]+\s*$/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[(\[（]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim(), preferInner)
    .slice(0, 40);
}
/** 40자로 자른 뒤 괄호가 열린 채 끝나면 괄호 앞까지 쓴다 */
const cleanLabelCut = (s: string, preferInner = false) => tidyItemLabel(cleanLabel(s, preferInner), preferInner);

/** 공고문 텍스트에서 계약방법을 추정한다 */
export function detectMethod(text: string): EvalSheet["method"] | undefined {
  if (/종합\s*심사/.test(text)) return "종합심사";
  if (/협상에\s*의한\s*계약|제안서\s*평가|기술\s*능력\s*평가/.test(text)) return "협상에 의한 계약";
  if (/적격\s*심사/.test(text)) return "적격심사";
  if (/최저\s*가/.test(text)) return "최저가";
  return undefined;
}

/* ---------- 세부기준: 점수 구간 · 서류 인정 범위 · 정성 등급 ---------- */

const GRADE_TOKEN = /(?<![A-Za-z])(AAA|AA[+\-0]?|A[+\-0]?|BBB[+\-0]?|BB[+\-0]?|B[+\-0]?|CCC[+\-0]?|CC|C|D)(?![A-Za-z])/g;
const COND_RE = /(\d{1,3}(?:\.\d+)?)\s*(%|배|명|년|건)\s*(이상|초과|미만|이하)?/g;
const BAND_POINT_RE = /(\d{1,2}(?:\.\d{1,2})?)\s*점|\s(\d{1,2}(?:\.\d{1,2})?)\s*$/g;

function gradeIndex(tok: string): number {
  const t = ["AAA", "CC", "C", "D"].includes(tok) ? tok : /[+\-0]$/.test(tok) ? tok : `${tok}0`;
  return (CREDIT_GRADES as readonly string[]).indexOf(t);
}

/** 한 줄에서 "조건 … N점" 묶음을 읽는다. 조건이 없는 묶음이 있으면 구간 줄로 보지 않는다 */
export function parseBands(line: string): ScoreBand[] {
  const out: ScoreBand[] = [];
  let start = 0;
  for (const m of line.matchAll(BAND_POINT_RE)) {
    const seg = line.slice(start, m.index);
    start = (m.index ?? 0) + m[0].length;
    const points = Number(m[1] ?? m[2]);
    const cond = seg.replace(/^[\s:：,·\-–~※]+|[\s:：,·~]+$/g, "").trim();
    const all = [...seg.matchAll(COND_RE)];
    const pct = all.filter((c) => c[2] === "%" || c[2] === "배");
    const conds = pct.length ? pct : all;
    if (conds.length) {
      const unit = conds[0][2] === "배" ? "%" : (conds[0][2] as ScoreBand["unit"]);
      const val = (c: RegExpMatchArray) => Number(c[1]) * (c[2] === "배" ? 100 : 1);
      const lower = conds.find((c) => c[3] === "이상" || c[3] === "초과" || !c[3]);
      out.push({ unit, min: lower ? val(lower) : 0, points, cond }); // "20% 미만" 처럼 상한만 있으면 가장 낮은 구간
      continue;
    }
    const grades = [...seg.matchAll(GRADE_TOKEN)].map((g) => gradeIndex(g[1])).filter((i) => i >= 0);
    if (!grades.length || !/등급|이상|이하|~|∼|,|AAA|BBB|[ABC][+\-0]/.test(seg)) return [];
    let best = Math.min(...grades), worst = Math.max(...grades);
    if (grades.length === 1 && /이상/.test(seg)) best = 0;
    if (grades.length === 1 && /이하|미만/.test(seg)) worst = CREDIT_GRADES.length - 1;
    out.push({ unit: "grade", min: 0, best, worst, points, cond });
  }
  return out;
}

/** 줄 맨 앞이 조건으로 시작하면(항목 이름이 없으면) 바로 앞 항목의 구간 줄이다 */
function isBandLine(line: string, max = Infinity, kind?: ItemKind): boolean {
  const bands = parseBands(line);
  if (!bands.length || bands.some((b) => b.points > max + 0.001)) return false;
  const first = line.search(/\d{1,3}(?:\.\d+)?\s*(%|배|명|년|건)|(?<![A-Za-z])(AAA|AA|A|BBB|BB|B|CCC)[+\-0]?(?![A-Za-z])/);
  const rawPrefix = first > 0 ? line.slice(0, first) : "";
  const prefix = rawPrefix
    .replace(/[가나다라마바사아자차카타파하]\s*[.)]/g, "")
    .replace(/(추정\s*가격|기초\s*금액|예정\s*가격|사업\s*금액|계약\s*금액|금액|대비|비율|등급|신용\s*평가|구간|평점|의|이|가)/g, "")
    .replace(/[\s\-·○◦•▪:：()\d.~∼]/g, "");
  // 글머리표로 시작하고 앞 항목과 같은 종류(또는 종류 없음)의 말만 붙어 있으면 구간 줄로 본다
  const pk = kindOf(rawPrefix);
  return prefix.length <= 1 || (/^[\-·○◦•▪※]/.test(line) && (pk === "other" || pk === kind));
}

const RECOG_RE = /(인정(?!보)|제외|합산|이내|기준일|마감일|증빙|발급|지분|공동\s*수급|확인서|증명서|유효\s*기간|준공|완료된|계약\s*금액)/;

/** 정성평가 등급표: "탁월(100%) 우수(90%) 보통(80%)" 처럼 한 줄에 3개 이상 등급 */
export function parseScale(text: string): ScaleLevel[] | undefined {
  const re = /(매우\s*우수|탁월|우수|양호|보통|미흡|매우\s*미흡|불량|[수우미양가]|[ABCDE](?=\s*등급|\s*[(:：]))\s*(?:등급)?\s*[(:：]?\s*(?:배점\s*[x×*]\s*)?(\d{2,3}(?:\.\d)?)\s*%/g;
  for (const line of text.split(/\r?\n/)) {
    const ms = [...line.matchAll(re)];
    if (ms.length < 3) continue;
    const levels = ms.map((m) => ({ label: m[1].replace(/\s/g, ""), ratio: Number(m[2]) / 100 })).filter((l) => l.ratio > 0 && l.ratio <= 1);
    const uniq = new Set(levels.map((l) => l.label));
    const desc = levels.every((l, i) => i === 0 || l.ratio < levels[i - 1].ratio);
    if (levels.length >= 3 && uniq.size === levels.length && desc) return levels;
  }
  return undefined;
}

function parsePanelRule(text: string): string | undefined {
  const line = text.split(/\r?\n/).find((l) => /최고\s*(?:점수|점)?.{0,6}최저\s*(?:점수|점)?/.test(l) && /(제외|평균)/.test(l))
    ?? text.split(/\r?\n/).find((l) => /평가\s*위원.{0,20}(산술\s*)?평균/.test(l));
  return line ? line.replace(/\s+/g, " ").trim().slice(0, 100) : undefined;
}

/** 평가표 전체에 걸린 문장(등급표·위원 점수 처리·통과 기준)은 항목 세부기준에서 뺀다 */
const SHEET_LEVEL_RE = /(최고\s*점|최저\s*점|산술\s*평균|협상\s*적격|낙찰자|배점\s*한도|탁월|평가\s*등급)/;

const tidy = (l: string) => l.replace(/^[\s\-·○◦•▪※*]+/, "").replace(/\s+/g, " ").trim().slice(0, 90);

/**
 * 공고문·규격서·평가기준서 텍스트에서 평가항목과 배점을 뽑는다.
 * - "평가항목 … 15점" 형태의 줄, 배점표의 "항목  15" 형태(배점 머리글 이후)를 모두 읽는다.
 * - 합계·소계·통과 기준 문장은 제외하고, 같은 이름은 한 번만 넣는다.
 * - 배점 합계가 100에 가까우면 신뢰도 높음.
 */
interface Scan { found: EvalItem[]; lineOf: Map<EvalItem, number>; inline: Map<EvalItem, ScoreBand[]> }

/** 배점표 머리글 ("평가항목 … 배점", "구분 … 배점한도") */
const TABLE_HEAD_RE = /배\s*점/;
const TABLE_HEAD_COL_RE = /(평가\s*항목|평가\s*요소|구\s*분|심사\s*항목|심사\s*분야|평가\s*분야)/;
/** 배점표 끝 (합계 100) */
const TABLE_END_RE = /^(?:[^\d]{0,12})?(?:합\s*계|총\s*계|총\s*점|계)\s*[:：]?\s*\(?\s*(100|1000)\s*(?:점)?\s*\)?/;

/**
 * lines[from, to) 에서 평가항목을 읽는다.
 * window 가 참이면 배점표 안이라고 보고, "항목 이름 … 숫자"로 끝나는 줄을 종류와 상관없이 항목으로 읽는다.
 */
function scanItems(lines: string[], from: number, to: number, window: boolean): Scan {
  const found: EvalItem[] = [];
  const seen = new Set<string>();
  let inTable = window;
  let lastLabel = "";
  let curGroup: string | undefined;
  let cur = from - 1;
  const lineOf = new Map<EvalItem, number>();
  const inline = new Map<EvalItem, ScoreBand[]>();

  const push = (rawLabel: string, max: number, basis: string, parent?: string, inner = false) => {
    let label = cleanLabelCut(rawLabel, inner).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
    // 표의 첫 열(구분)이 같은 줄에 붙어 오면 그룹 이름으로 떼어 낸다
    let group: string | undefined;
    const g = label.match(/^((?:정량|정성|기술|가격|신인도)\s*(?:적\s*)?(?:평가)?(?:\s*\(\s*\d+\s*\))?|수행\s*능력|경영\s*상태)\s+(.{2,})$/);
    if (g && !/^평가$/.test(g[2])) { group = g[1].replace(/\s|\(\d+\)/g, ""); label = g[2]; curGroup = group; }
    else if (parent) group = parent;
    else if (window) group = curGroup;
    label = label.replace(/^[○●◦·•▪\-]\s*/, "").trim();
    if (!label || label.length < 2 || /^\d/.test(label) || SKIP_RE.test(label)) return;
    if (!(max > 0 && max <= 80)) return;
    // 배점표 안에서도 조건 문장·등급표 줄·신인도 세부 항목은 평가항목이 아니다
    if (window && (/^(배\s*점|평가\s*항목|구\s*분)/.test(label) || /(인\s*경우|에\s*준하는|없음\s*없음|^[(（+]|^[A-Z][.)]\s|이상인|미만인|이하인)/.test(label) || (kindOf(label) === "bonus" && !/^(신인도|신뢰도|가\s*점|감\s*점)/.test(label)))) return;
    const key = label.replace(/\s/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    // 정성평가 묶음 안의 항목은 이름에 '기술능력'·'인력'이 있어도 위원이 매기는 정성 항목이다
    const k = kindOf(label);
    // "정량평가"처럼 세부 항목 없이 묶음으로만 배점이 적힌 경우는 '기타'가 아니라 기술(정량)이다
    if (!group && k === "other" && /(정량|계량)/.test(label) && !/비계량/.test(label)) group = "기술(정량)";
    const it = item(label, max, group && /정성/.test(group) && k !== "price" ? "qualitative" : k, basis.slice(0, 80), group);
    lineOf.set(it, cur);
    found.push(it);
  };

  for (let n = from; n < to; n++) {
    const line = lines[n];
    cur = n;
    if (window && n > from && (TABLE_END_RE.test(line.replace(/\s+/g, " ")) || (TABLE_HEAD_RE.test(line) && TABLE_HEAD_COL_RE.test(line) && found.length))) break;
    // 앞 항목의 점수 구간 줄("80% 이상 13점", "A0 이상 15점")은 새 항목으로 만들지 않는다
    if (found.length && isBandLine(line, found[found.length - 1].max, found[found.length - 1].kind)) { lastLabel = ""; continue; }
    if (TABLE_HEAD_RE.test(line) && TABLE_HEAD_COL_RE.test(line)) { inTable = true; continue; }
    if (SKIP_RE.test(line) && /\d/.test(line)) { lastLabel = ""; continue; }

    const pts = [...line.matchAll(POINT_RE)];
    if (pts.length === 1) {
      const m = pts[0];
      const before = line.slice(0, m.index).trim();
      const label = before || lastLabel;
      if (label && (kindOf(label) !== "other" || /평가|심사|능력|실적|점수/.test(label))) push(label, Number(m[1]), line);
      lastLabel = "";
      continue;
    }
    if (pts.length > 1) {
      // "실적 15점  100% 이상 15점" 처럼 항목 줄에 첫 구간이 붙어 온 경우
      const first = pts[0];
      const rest = line.slice((first.index ?? 0) + first[0].length);
      const head = line.slice(0, first.index).trim();
      if (head && isBandLine(rest.trim(), Number(first[1]), kindOf(head))) {
        const before = found.length;
        push(head, Number(first[1]), line);
        if (found.length > before) inline.set(found[found.length - 1], parseBands(rest.trim()));
        lastLabel = "";
        continue;
      }
      // "실적 15점 신용 15점" 처럼 한 줄에 여러 항목.
      // "기술능력평가(정량 10점, 정성 80점), 가격평가 10점" 은 괄호 안 항목이 괄호 앞 이름(기술능력평가) 묶음이다
      let start = 0;
      let parent: string | undefined;
      let prevSeg = "";
      for (const m of pts) {
        const seg = line.slice(start, m.index).trim();
        if (/^[)）\]］}｝]/.test(seg)) parent = undefined;
        // "기술능력평가 90점(정량 10점, …": 괄호가 점수 뒤에서 열리면 바로 앞 항목이 묶음 이름이다
        if (/^[(（[{]/.test(seg) && prevSeg) parent = tidyItemLabel(tailPhrase(prevSeg)).slice(0, 20);
        parent = openParenParent(seg) ?? parent;
        prevSeg = seg;
        // 문장 속 항목은 점수 앞의 끝 명사구가 이름이다 (괄호가 열려 있으면 괄호 안)
        if (seg) push(tailPhrase(tidyItemLabel(seg, true)), Number(m[1]), line, parent, true);
        if (/[)）\]］}｝]/.test(line.slice((m.index ?? 0) + m[0].length).match(/^[^가-힣A-Za-z\d]*/)?.[0] ?? "")) parent = undefined;
        start = (m.index ?? 0) + m[0].length;
      }
      lastLabel = "";
      continue;
    }
    if (inTable) {
      // 배점표 안: "항목 이름 … 15" (등급별 점수 열이 뒤따르면 첫 숫자가 배점)
      const m = line.match(/^(.{2,60}?)\s+(\d{1,2}(?:\.\d{1,2})?)(?:\s+\d{1,2}(?:\.\d{1,2})?){0,5}(?:\s+[가-힣()·\s]{0,12})?$/)
        // 배점표 안에서는 배점 뒤에 평가 기준 문장이 이어져도 된다 ("1. 용역수행 실적 6 ○ 최근 10년 이내 …")
        ?? (window ? line.match(/^(.{2,40}?)\s+(\d{1,2}(?:\.\d{1,2})?)\s+(?![\d.%점년건명])\S.*$/) : null);
      if (m && (window || kindOf(m[1]) !== "other") && !/^\(?\d/.test(cleanLabel(m[1]))) {
        // 그룹 머리("기술(80) 소 계 20")와 그룹 배점만 있는 줄은 건너뛴다
        if (!/소\s*계/.test(m[1])) { push(m[1].replace(/\s*\(\s*\d+\s*\)\s*$/, ""), Number(m[2]), line); continue; }
      }
      // "입찰가격평가(20) 20", "수행실적(5)" 처럼 괄호 배점
      const p = line.match(/^(.{2,40}?)\s*\(\s*(\d{1,2}(?:\.\d)?)\s*(?:점)?\s*\)\s*$/);
      if (window && p && kindOf(p[1]) !== "other") { push(p[1], Number(p[2]), line); continue; }
    }
    // 다음 줄에 점수만 있는 경우를 위해 기억
    lastLabel = kindOf(line) !== "other" && line.length <= 40 ? line : "";
  }

  // 소계 머리글 처리: "정량평가"처럼 분야 이름이고 바로 뒤 2개 이상 항목의 배점 합과 같으면 머리글로 보고 하위 항목의 그룹 이름으로 쓴다
  for (let i = 0; i < found.length; i++) {
    let acc = 0;
    let j = i + 1;
    while (j < found.length && acc + found[j].max <= found[i].max + 0.001) { acc += found[j].max; j++; }
    const groupLike = /(정량|정성|계량|비계량|기술\s*능력|평가\s*분야|부문|분야)/.test(found[i].label) && !["performance", "credit", "price", "staff", "years"].includes(found[i].kind);
    // 배점표 안에서는 바로 뒤 2개 이상 항목의 합과 배점이 같은 항목(대분류)을 머리글로 본다
    if ((groupLike ? j > i + 2 : window && found[i].kind !== "price" && j > i + 2) && Math.abs(acc - found[i].max) < 0.01) {
      const group = found[i].label.replace(/\s*\(.*$/, "");
      for (let k = i + 1; k < j; k++) found[k].group = group;
      found.splice(i, 1);
      i = j - 2;
    }
  }
  return { found, lineOf, inline };
}

/** "평 가 항 목", "배 점" 처럼 한 글자씩 띄운 표 머리글을 붙인다 */
const despace = (l: string) => l.replace(/(?:(?<![가-힣])[가-힣] ){1,}[가-힣](?![가-힣])/g, (m) => (m.length <= 3 && !/^(배 점|합 계|총 계|소 계|구 분)$/.test(m) ? m : m.replace(/ /g, "")));
const prepLines = (text: string) => text.split(/\r?\n/).map((l) => despace(l.replace(/\u00a0/g, " ").trim())).filter(Boolean);

const QUANT_KINDS: ItemKind[] = ["performance", "credit", "staff", "years", "bonus", "finance", "techGrade"];

/**
 * 협상 제안요청서의 정량평가 표만 읽는다 (예: "정량적 평가 (20점)의 평가항목 및 기준"의 실적 6 · 경영상태 2 · 인력 10 · 신인도 2).
 * 전체 배점표를 못 읽었을 때 정량 항목은 공고 배점으로, 나머지 기술점수는 정성평가로 둔다.
 */
export function extractQuantBlock(text: string): { items: EvalItem[]; total: number; quote: string } | undefined {
  const lines = prepLines(text);
  let best: { items: EvalItem[]; total: number; quote: string } | undefined;
  for (let n = 0; n < lines.length; n++) {
    if (!(TABLE_HEAD_RE.test(lines[n]) && TABLE_HEAD_COL_RE.test(lines[n]))) continue;
    const ctx = lines.slice(Math.max(0, n - 3), n + 1).join(" ");
    const declared = ctx.match(/정량\s*(?:적)?\s*평가[^\d]{0,6}\(?\s*(\d{1,2})\s*점/);
    if (!/정량/.test(ctx)) continue;
    const { found } = scanItems(lines, n, Math.min(lines.length, n + 30), true);
    const items = found.filter((i) => QUANT_KINDS.includes(i.kind) || i.kind === "other");
    if (items.length < 2 || items.length !== found.length) continue;
    const total = items.reduce((a, i) => a + i.max, 0);
    if (total < 5 || total > 60 || (declared && Math.abs(total - Number(declared[1])) > 0.01)) continue;
    if (!items.some((i) => i.kind === "performance" || i.kind === "credit")) continue;
    if (!best || items.length > best.items.length) best = { items, total, quote: ctx.slice(0, 100) };
  }
  return best;
}

export function extractSheet(text: string, fallback?: EvalSheet): EvalSheet | undefined {
  const lines = prepLines(text);
  // 문서 전체를 읽은 결과와, 배점표 머리글마다 그 표만 읽은 결과 가운데 배점 합계가 100에 가장 맞는 것을 쓴다
  // (협상 제안요청서는 배점표 뒤에 세부 평가기준·등급표가 이어져 문서 전체를 읽으면 같은 배점이 두세 번 잡힌다)
  const sumOf = (s: Scan) => s.found.reduce((a, i) => a + i.max, 0);
  const cands: Scan[] = [scanItems(lines, 0, lines.length, false)];
  for (let n = 0; n < lines.length; n++) {
    if (!(TABLE_HEAD_RE.test(lines[n]) && TABLE_HEAD_COL_RE.test(lines[n]))) continue;
    cands.push(scanItems(lines, n, Math.min(lines.length, n + 70), true));
  }
  const fit = (s: Scan) => {
    const sum = sumOf(s);
    if (s.found.length < 2 || s.found.filter((i) => i.kind === "price").length > 1) return -1e9;
    const off = Math.abs(sum - 100);
    return (off <= 0.5 ? 1000 : off <= 2 ? 500 : 0) - off + Math.min(s.found.length, 12) * 2 + (s.found.some((i) => i.kind === "price") ? 5 : 0);
  };
  const { found, lineOf, inline } = cands.reduce((a, b) => (fit(b) > fit(a) ? b : a));

  if (found.length < 2) return undefined;

  // 항목 사이 줄(최대 14줄)을 그 항목의 세부기준으로 읽는다: 점수 구간, 서류 인정 범위, 평가 요소
  const used = new Set<number>();
  found.forEach((it, n) => {
    const from = lineOf.get(it);
    if (from === undefined || it.kind === "price") return;
    const next = found.slice(n + 1).map((f) => lineOf.get(f)).find((v): v is number => v !== undefined) ?? lines.length;
    const to = Math.min(next, from + 15);
    const bands: ScoreBand[] = [...(inline.get(it) ?? [])];
    const recognition: string[] = [];
    const criteria: string[] = [];
    for (let k = from + 1; k < to; k++) {
      const l = lines[k];
      if (/배\s*점/.test(l) && /(평가\s*항목|구\s*분)/.test(l)) break;
      if (isBandLine(l, it.max, it.kind)) { bands.push(...parseBands(l)); used.add(k); continue; }
      if (/\d\s*점/.test(l)) continue;
      const t = tidy(l);
      if (t.length < 4 || SHEET_LEVEL_RE.test(t)) continue;
      if (RECOG_RE.test(t)) { if (recognition.length < 4) recognition.push(t); used.add(k); }
      else if ((it.kind === "qualitative" || it.kind === "other") && t.length >= 6 && criteria.length < 5 && !SKIP_RE.test(t)) { criteria.push(t); used.add(k); }
    }
    // 구간 최고점이 배점과 맞을 때만 이 항목의 구간으로 쓴다 (다른 표의 숫자를 잘못 붙이는 것을 막는다)
    const top = bands.length ? Math.max(...bands.map((b) => b.points)) : 0;
    if (bands.length >= 2 && Math.abs(top - it.max) < 0.01 && bands.every((b) => b.points <= it.max + 0.001)) it.bands = bands;
    if (recognition.length) it.recognition = recognition;
    if (criteria.length) it.criteria = criteria;
  });
  const recognitionAll = [...new Set(lines.filter((l, k) => !used.has(k) && !SHEET_LEVEL_RE.test(l) && /(실적|서류|증명|확인서|등급)/.test(l) && /(인정(?!보)|제외|기준일|마감일|발급|유효\s*기간|합산|지분)/.test(l)).map(tidy))]
    .filter((l) => l.length >= 8).slice(0, 6);

  const method = detectMethod(text) ?? fallback?.method ?? "적격심사";
  const sum = found.reduce((s, i) => s + i.max, 0);
  const declaredTotal = (() => {
    const m = text.match(/(?:합\s*계|총\s*점|총\s*계|계)\s*[:：]?\s*(100|1000)\s*점?/);
    return m ? Number(m[1]) : undefined;
  })();
  const near100 = Math.abs(sum - (declaredTotal ?? 100)) <= 2;
  const confidence: EvalSheet["confidence"] = near100 ? "높음" : sum >= 60 && sum <= 130 ? "보통" : "낮음";

  const notes: string[] = [`원문에서 평가항목 ${found.length}개, 배점 합계 ${round1(sum)}점을 찾았습니다.`];
  const detailed = found.filter((i) => i.bands || i.recognition || i.criteria).length;
  if (detailed) notes.push(`세부기준(점수 구간·인정 범위·평가 요소)을 ${detailed}개 항목에서 읽어 함께 적용했습니다.`);
  if (!near100) notes.push("배점 합계가 100점과 달라 일부 항목이 빠졌거나 세부항목이 겹쳤을 수 있습니다. 항목을 확인해 주세요.");
  let priceFilled = false;
  if (!found.some((i) => i.kind === "price") && method !== "종합심사") {
    const priceMax = Math.max(0, 100 - sum);
    if (priceMax >= 5) {
      found.push(item("입찰가격", priceMax, "price", "원문에 가격 배점이 없어 100점에서 나머지로 계산"));
      priceFilled = true;
      notes.push(`가격 배점을 찾지 못해 나머지 ${round1(priceMax)}점을 입찰가격으로 두었습니다.`);
    }
  }

  let pass: EvalSheet["pass"];
  const techRatio = text.match(/배점\s*한도의\s*(\d{2})\s*%\s*이상/);
  const passScore = text.match(/(?:종합\s*평점|평점|합계\s*점수|적격\s*심사).{0,30}?(\d{2}(?:\.\d)?)\s*점\s*이상/);
  if (techRatio) pass = { kind: "techRatio", ratio: Number(techRatio[1]) / 100 };
  else if (passScore) pass = { kind: "total", score: Number(passScore[1]) };
  else pass = fallback?.pass;

  return {
    method,
    title: `공고 원문 평가표 (${method})`,
    items: found,
    pass,
    source: "extracted",
    confidence,
    notes,
    scale: parseScale(text),
    panelRule: parsePanelRule(text),
    recognition: recognitionAll.length ? recognitionAll : undefined,
    trust: parseTrustRule(text, fallback?.trust ?? generalServiceRule()),
    priceFilled: priceFilled || undefined,
  };
}

/* ---------- 기업 정보와 예측 ---------- */

export type Level = "상" | "중" | "하";

export interface CompanyInput {
  corpName?: string;
  bizno?: string;
  /** 개업일 기준 업력(년) */
  years: number;
  employees: number;
  /** 공고 분야 기술인력 수 */
  techStaff: number;
  /** 신용평가등급. "없음"이면 기준표의 미제출 처리(최저등급 또는 0점) */
  creditGrade: CreditGrade | "없음";
  /** 창업기업·소기업·소상공인 (물품 고시금액 미만 경영상태 만점, 일반용역 실적 인정기간 7년) */
  smallFirm: boolean;
  /** 사업수행능력(PQ) 평가점수 (0~100, 기술용역) */
  pqScore: number;
  /** 물품 기술등급 (T1~T8) */
  techGrade: string;
  /** 자기자본비율(%)·유동비율(%) 과 공고의 기준비율 (기술용역 고시금액 미만 경영상태) */
  equityRatio?: number;
  currentRatio?: number;
  equityBase: number;
  currentBase: number;
  /** 유사 실적 합계(원) */
  pastPerformance: number;
  /** 실적 중 나라장터 낙찰 이력에서 자동으로 찾은 금액이 있으면 그 설명 (예: "나라장터 낙찰 4건 추정") */
  perfSource?: string;
  /** 신뢰도 가감점(신인도) 해당 항목 id (trustscore.ts TRUST_ITEMS) */
  trustItems: string[];
  /** 제안서·정성평가 준비 수준 */
  proposal: Level;
  /** 투찰률: 입찰가격 ÷ 예정가격 (%) */
  bidRate: number;
  /** 협상계약에서 예상하는 최저 경쟁 투찰률 (%) */
  rivalRate: number;
}

export const DEFAULT_COMPANY: CompanyInput = {
  years: 7,
  employees: 25,
  techStaff: 4,
  creditGrade: "BBB0",
  smallFirm: false,
  pqScore: 90,
  techGrade: "T8",
  equityBase: 40,
  currentBase: 130,
  pastPerformance: 0,
  trustItems: [],
  proposal: "중",
  bidRate: 88,
  rivalRate: 86,
};

export interface PredictedItem extends EvalItem {
  score: number;
  ratio: number;  // 0~1 (가점 항목은 획득/배점)
  reason: string;
  /** 이 항목에서 잃은 점수 */
  lost: number;
  /** 자료가 없어 점수를 정하지 못한 항목 (예: 기초금액이 없는 공고의 금액 비율 실적). score 는 0, 합계에서 빼고 따로 안내한다 */
  unknown?: boolean;
}

export interface Prediction {
  sheet: EvalSheet;
  items: PredictedItem[];
  total: number;
  max: number;
  /** 점수를 정하지 못한 항목들의 배점 합. total 은 이 점수를 뺀 값이다 */
  pending: number;
  techScore: number;
  techMax: number;
  passed?: boolean;
  passLabel?: string;
  gap?: number;
  /** 신뢰도 가감점 계산 내역 */
  trust?: TrustScore & { rule: TrustRule };
  /** 적격심사: 통과에 필요한 투찰률 범위 */
  rateWindow?: { low: number; high: number };
  tips: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const TECH_POINTS: Record<string, number> = { T1: 10, T2: 9.8, T3: 9.6, T4: 9.4, T5: 9.2, T6: 9.0, T7: 8.8, T8: 8 };
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** 금액 구간별로 만점이 나오는 신용등급이 달라진다 (규모가 클수록 높은 등급 요구) */
function creditRatio(g: CreditGrade | "없음", amount: number): number {
  const grade: CreditGrade = g === "없음" ? "CCC+" : g;
  const idx = CREDIT_GRADES.indexOf(grade);
  const fullAt = amount >= 5_000_000_000 ? CREDIT_GRADES.indexOf("A-") : amount >= 1_000_000_000 ? CREDIT_GRADES.indexOf("BBB-") : CREDIT_GRADES.indexOf("BB+");
  if (grade === "D") return 0;
  if (idx <= fullAt) return 1;
  return clamp(1 - (idx - fullAt) * 0.07, 0.4);
}

function performanceRatio(past: number, amount: number): number {
  if (!past || amount <= 0) return 0;
  const r = past / amount;
  return r >= 1 ? 1 : r >= 0.8 ? 0.9 : r >= 0.6 ? 0.8 : r >= 0.4 ? 0.7 : r >= 0.2 ? 0.6 : 0.5;
}

const yearsRatio = (y: number) => (y >= 10 ? 1 : y >= 7 ? 0.9 : y >= 5 ? 0.8 : y >= 3 ? 0.6 : 0.4);
const staffRatio = (n: number, amount: number) => clamp(n / Math.max(2, Math.ceil(amount / 1_000_000_000) + 2), 0.2);
const LEVEL_RATIO: Record<Level, number> = { 상: 0.9, 중: 0.8, 하: 0.68 };

/**
 * 적격심사 가격 평점. 기준표 산식이 있으면 그것(배점 − k × |기준 − 투찰률|, 상한 투찰률, 최저점)을 쓰고,
 * 없으면 평가식 문구에서 계수를 읽어 기준 88로 계산한다 (최저 2점).
 */
function qualPrice(max: number, rate: number, basis?: string, rule?: PriceRule): number {
  if (rule?.kind === "qual" && rule.k !== undefined) {
    const r = rule.capAt !== undefined ? Math.min(rate, rule.capAt) : rate;
    return Math.max(rule.min ?? 2, max - rule.k * Math.abs((rule.base ?? 90) - r));
  }
  const k = Number(basis?.match(/[−-]\s*(\d+)\s*×/)?.[1]) || 2;
  return Math.max(2, max - k * Math.abs(88 - rate));
}

/** 재무비율 점수 (기술용역): 기준비율 대비 100% 이상 5, 90% 4.5, 80% 4, 70% 3.5, 미만 3 */
function ratioPoints(v: number | undefined, base: number): number {
  if (!v || !(base > 0)) return 3;
  const r = (v / base) * 100;
  return r >= 100 ? 5 : r >= 90 ? 4.5 : r >= 80 ? 4 : r >= 70 ? 3.5 : 3;
}

/** 공고의 점수 구간으로 채점한다. 값에 맞는 구간이 없으면(최저 구간 미만) 0점 */
function scoreByBands(bands: ScoreBand[], value: number): { points: number; band?: ScoreBand } {
  if (bands[0].unit === "grade") {
    const hit = bands.find((b) => value >= (b.best ?? 0) && value <= (b.worst ?? 99));
    if (hit) return { points: hit.points, band: hit };
    const bestBand = [...bands].sort((a, b) => (a.best ?? 0) - (b.best ?? 0))[0];
    if (value < (bestBand.best ?? 0)) return { points: bestBand.points, band: bestBand };
    return { points: 0 };
  }
  const hit = [...bands].sort((a, b) => b.min - a.min).find((b) => value >= b.min);
  return hit ? { points: hit.points, band: hit } : { points: 0 };
}

/** 회사 값을 구간 단위에 맞춰 꺼낸다. 맞는 값이 없으면 undefined (기본 규칙으로 계산) */
function bandValue(it: EvalItem, c: CompanyInput, amt: number): number | undefined {
  const unit = it.bands?.[0]?.unit;
  if (!unit) return undefined;
  if (unit === "grade") return it.kind === "credit" ? (c.creditGrade === "없음" ? CREDIT_GRADES.length - 1 : CREDIT_GRADES.indexOf(c.creditGrade)) : undefined;
  if (unit === "%") return it.kind === "performance" && amt > 0 ? (c.pastPerformance / amt) * 100 : undefined;
  if (unit === "명") return it.kind === "staff" ? c.techStaff : undefined;
  if (unit === "년") return it.kind === "years" ? c.years : undefined;
  return undefined;
}

/** 제안 준비 수준을 공고의 정성 등급에 대응시킨다: 5단계 이상이면 상=2등급, 중=3등급, 하=4등급 */
function scaleLevel(scale: ScaleLevel[], lv: Level): ScaleLevel {
  const off = scale.length >= 5 ? 1 : 0;
  const idx = { 상: 0, 중: 1, 하: 2 }[lv] + off;
  return scale[Math.min(idx, scale.length - 1)];
}

/** 적격심사: 가격 외 점수(nonPrice)를 고정하고 통과 가능한 투찰률 범위를 찾는다. 통과 기준·가격 항목이 없으면 undefined */
export function passWindow(sheet: EvalSheet, bid: Pick<Bid, "lowerLimitRate">, nonPrice: number): Prediction["rateWindow"] {
  const priceItem = sheet.items.find((i) => i.kind === "price");
  if (sheet.method !== "적격심사" || sheet.pass?.kind !== "total" || !priceItem) return undefined;
  const ok: number[] = [];
  const floor = sheet.lowerLimit ?? bid.lowerLimitRate ?? 0;
  const start = Math.max(70, floor);
  const rates = Array.from({ length: Math.floor((100 - start) / 0.01) + 1 }, (_, n) => Math.round((start + n * 0.01) * 1000) / 1000);
  if (start <= 88) rates.push(88);
  for (const r of rates.sort((x, y) => x - y)) {
    // 점수는 소수점 처리 차이가 있어 0.01점 안쪽은 같은 점수로 본다
    if (nonPrice + qualPrice(priceItem.max, r, priceItem.basis, sheet.price) >= sheet.pass.score - 0.01) ok.push(r);
  }
  // 낙찰하한율은 기준표 산식의 끝자리 처리(…745, …995)를 반영한 값이라, 계산한 하한과 0.02%p 안이면 하한율을 쓴다
  if (!ok.length) return undefined;
  return { low: floor && ok[0] - floor <= 0.02 ? floor : Math.round(ok[0] * 1000) / 1000, high: Math.round(ok[ok.length - 1] * 100) / 100 };
}

export function predict(sheet: EvalSheet, bid: Pick<Bid, "baseAmount" | "lowerLimitRate">, c: CompanyInput): Prediction {
  const amt = sheet.refAmount || bid.baseAmount;
  const amtLabel = sheet.refAmount ? "추정가격" : "기초금액";
  const gradeText = c.creditGrade === "없음" ? "신용평가등급 없음(미제출)" : `신용평가등급 ${c.creditGrade}`;
  const items: PredictedItem[] = sheet.items.map((it) => {
    let ratio = 0;
    let reason = "";
    // 기준표 등급표 (신용평가등급, 기술등급)
    if (it.lookup && it.max > 0) {
      const pts = it.lookup.points;
      const lowest = Math.min(...Object.values(pts));
      let s: number;
      let why: string;
      if (it.lookup.of === "credit" && it.smallFirmFull && c.smallFirm) {
        s = it.max; why = "창업기업·소기업·소상공인: 기준표상 만점";
      } else if (it.lookup.of === "credit") {
        const missing = c.creditGrade === "없음";
        s = missing ? (it.lookup.missing < 0 ? lowest : it.lookup.missing) : pts[c.creditGrade] ?? lowest;
        why = missing ? `${gradeText}: 기준표상 ${it.lookup.missing < 0 ? "최저등급" : `${it.lookup.missing}점`}` : `${gradeText} → 기준표 ${round2(s)}점`;
      } else {
        s = pts[c.techGrade] ?? (it.lookup.missing < 0 ? lowest : it.lookup.missing);
        why = `기술등급 ${c.techGrade} → 기준표 ${round2(s)}점`;
      }
      s = Math.min(it.max, s);
      return { ...it, score: round2(s), ratio: s / it.max, reason: why, lost: round2(it.max - s) };
    }
    // 실적계수 방식 (공사 시공경험)
    if (it.perfLinear && it.kind === "performance" && it.max > 0) {
      if (!(amt > 0)) return { ...it, score: 0, ratio: 0, lost: 0, unknown: true, reason: `${amtLabel}이 없는 공고라 실적계수를 계산할 수 없습니다` };
      const coef = Math.min(1, c.pastPerformance / (amt * it.perfLinear));
      const s = it.max * coef;
      return { ...it, score: round2(s), ratio: coef, reason: `실적계수 ${coef.toFixed(3)} = 실적 ${won(c.pastPerformance)} ÷ (${amtLabel} × ${it.perfLinear})${c.perfSource ? `, ${c.perfSource}` : ""}`, lost: round2(it.max - s) };
    }
    const bv = it.bands?.length ? bandValue(it, c, amt) : undefined;
    if (bv !== undefined && it.bands && it.max > 0) {
      const { points, band } = scoreByBands(it.bands, bv);
      const s = Math.min(it.max, points);
      const what = it.kind === "credit" ? gradeText : it.kind === "performance" ? `유사 실적 ${Math.round(bv)}% (${amtLabel} 대비${c.perfSource ? `, ${c.perfSource}` : ""})` : it.kind === "staff" ? `기술인력 ${c.techStaff}명` : `업력 ${c.years}년`;
      const where = sheet.source === "extracted" ? "공고 구간" : "기준표 구간";
      return { ...it, score: round2(s), ratio: s / it.max, reason: `${what} → ${where} ${band ? `'${band.cond}' ${round2(band.points)}점` : "최저 구간 미만"}`, lost: round2(it.max - s) };
    }
    if ((it.kind === "qualitative" || it.kind === "other") && sheet.scale?.length) {
      const lv = scaleLevel(sheet.scale, c.proposal);
      const s = it.max * lv.ratio;
      return { ...it, score: round1(s), ratio: lv.ratio, reason: `공고 등급 '${lv.label}(${Math.round(lv.ratio * 100)}%)' 적용, 제안 준비 '${c.proposal}' 기준 예상`, lost: round1(it.max - s) };
    }
    switch (it.kind) {
      case "performance": {
        // 기초금액이 없는 공고(수수료·단가형 등)는 기초금액 대비 비율을 구할 수 없다. 점수를 지어내지 않고 확인 필요로 둔다
        if (!(amt > 0)) {
          return {
            ...it, score: 0, ratio: 0, lost: 0, unknown: true,
            reason: `${amtLabel}이 없는 공고라 ${amtLabel} 대비 실적 비율로 계산할 수 없습니다${c.perfSource ? ` (인정 실적: ${c.perfSource})` : ""}. 공고서의 실적 평가 기준(건수·금액)을 확인하세요`,
          };
        }
        ratio = performanceRatio(c.pastPerformance, amt);
        reason = c.pastPerformance
          ? `유사 실적 ${Math.round((c.pastPerformance / amt) * 100)}% (${amtLabel} 대비${c.perfSource ? `, ${c.perfSource}` : ""})`
          : "유사 실적 미입력: 0점으로 계산";
        break;
      }
      case "credit":
        ratio = creditRatio(c.creditGrade, amt);
        reason = `${gradeText} (공고 등급표를 읽지 못해 금액대별 표준 비율로 추정)`;
        break;
      case "capability":
        ratio = clamp(c.pqScore / 100);
        reason = `사업수행능력 평가점수 ${c.pqScore}점 × ${it.max} ÷ 100`;
        break;
      case "plan":
        ratio = 1;
        reason = "확약서·계획서를 기준대로 내면 만점 (미제출이면 0점)";
        break;
      case "finance": {
        const e = ratioPoints(c.equityRatio, c.equityBase), cu = ratioPoints(c.currentRatio, c.currentBase);
        const s = Math.min(it.max, ((e + cu) * it.max) / 10);
        return { ...it, score: round2(s), ratio: s / it.max, reason: `자기자본비율 ${c.equityRatio ? `${c.equityRatio}%` : "미입력"} (기준 ${c.equityBase}%) ${e}점 + 유동비율 ${c.currentRatio ? `${c.currentRatio}%` : "미입력"} (기준 ${c.currentBase}%) ${cu}점`, lost: round2(it.max - s) };
      }
      case "techGrade":
        ratio = (TECH_POINTS[c.techGrade] ?? 8) / 10;
        reason = `기술등급 ${c.techGrade}`;
        break;
      case "years":
        ratio = yearsRatio(c.years);
        reason = `업력 ${c.years}년`;
        break;
      case "staff":
        ratio = staffRatio(c.techStaff, amt);
        reason = `기술인력 ${c.techStaff}명`;
        break;
      case "bonus":
        // 다른 항목 점수를 본 뒤 아래에서 채운다 (가점은 수행능력에서 잃은 점수 안에서만 더해진다)
        return { ...it, score: 0, ratio: 0, reason: "", lost: 0 };
      case "price": {
        if (sheet.method === "협상에 의한 계약" || sheet.method === "종합심사") {
          ratio = clamp(Math.min(c.bidRate, c.rivalRate) / c.bidRate);
          reason = `투찰률 ${c.bidRate}% vs 예상 최저 ${c.rivalRate}%`;
        } else if (sheet.method === "적격심사") {
          const rule = sheet.price?.kind === "qual" ? sheet.price : undefined;
          const s = qualPrice(it.max, c.bidRate, it.basis, rule);
          const under = sheet.lowerLimit ?? bid.lowerLimitRate;
          const note = under && c.bidRate < under ? `, 낙찰하한율 ${under}% 미만이라 낙찰 대상 아님` : "";
          return { ...it, score: round2(s), ratio: s / it.max, reason: `투찰률 ${c.bidRate}% (예정가격 대비)${rule ? `: ${rule.text}` : ""}${note}`, lost: round2(it.max - s) };
        } else {
          ratio = 1;
          reason = "가격 경쟁: 최저가 순위로 결정";
        }
        break;
      }
      case "qualitative":
      case "other":
        ratio = LEVEL_RATIO[c.proposal];
        reason = it.kind === "other" && /(정량|계량)/.test(it.label) && !/비계량/.test(it.label)
          ? `공고에 정량평가 세부 배점이 없어 준비 수준 '${c.proposal}' 기준으로 예상`
          : `제안 준비 수준 '${c.proposal}' 기준 예상`;
        break;
    }
    const score = round1(it.max * ratio);
    return { ...it, score, ratio, reason, lost: round1(it.max - score) };
  });

  // 신뢰도 가감점: 평가표에 항목이 여럿이면(가점·감점 따로) 첫 항목에 합산한다
  let trust: Prediction["trust"];
  const bonusItems = items.filter((i) => i.kind === "bonus");
  if (bonusItems.length) {
    const first = bonusItems[0];
    const base = sheet.trust ?? (sheet.method === "적격심사" && first.max <= 0 ? generalServiceRule() : estimatedRule("평가표 배점 기준", first.max > 0 ? first.max : 2, first.max > 0 ? first.max : 3));
    const rule: TrustRule = first.max > 0 && !base.capFromNotice ? { ...base, plusCap: first.max, minusCap: Math.max(first.max, base.minusCap) } : base;
    const room = sheet.method === "적격심사"
      ? items.filter((i) => !i.unknown && ["performance", "credit", "years", "staff", "capability", "finance", "techGrade"].includes(i.kind)).reduce((s, i) => s + i.lost, 0)
      : undefined;
    const ts = scoreTrust(c.trustItems ?? [], rule, room);
    trust = { ...ts, rule };
    const parts = [
      ts.applied.length ? null : "해당 항목 없음",
      ts.plus ? `가점 +${ts.plus}` : null,
      ts.minus ? `감점 △${ts.minus}` : null,
    ].filter(Boolean).join(", ");
    first.score = round1(ts.total);
    first.ratio = first.max > 0 ? clamp(ts.total / first.max) : 0;
    first.lost = first.max > 0 ? round1(Math.max(0, first.max - ts.total)) : 0;
    first.reason = `${parts || "0점"} (${rule.name}${rule.fromNotice ? ", 공고서 기준 반영" : ""})`;
    for (const o of bonusItems.slice(1)) {
      o.reason = `${first.label}에 합산해 계산`;
    }
  }

  const total = round2(items.reduce((s, i) => s + i.score, 0));
  const max = round1(items.reduce((s, i) => s + i.max, 0));
  const pending = round1(items.filter((i) => i.unknown).reduce((s, i) => s + Math.max(0, i.max), 0));
  const tech = items.filter((i) => i.kind !== "price");
  const techScore = round2(tech.reduce((s, i) => s + i.score, 0));
  const techMax = round1(tech.reduce((s, i) => s + Math.max(0, i.max), 0));

  // 확인 필요 항목이 있으면 그 항목이 0점일 때와 만점일 때 모두 같은 결과일 때만 통과·미달을 말한다
  let passed: boolean | undefined;
  let passLabel: string | undefined;
  let gap: number | undefined;
  const judge = (score: number, need: number) => {
    const lo = score >= need - 1e-6, hi = score + pending >= need - 1e-6;
    passed = lo === hi ? lo : undefined;
    gap = pending ? undefined : round2(score - need);
  };
  if (sheet.pass?.kind === "total") {
    judge(total, sheet.pass.score);
    passLabel = `${sheet.method === "적격심사" ? "종합평점" : "합산점수"} ${sheet.pass.score}점 이상`;
  } else if (sheet.pass?.kind === "techRatio") {
    const need = round1(techMax * sheet.pass.ratio);
    judge(techScore, need);
    passLabel = `기술점수 ${need}점 이상 (배점의 ${Math.round(sheet.pass.ratio * 100)}%)`;
  }

  // 적격심사: 비가격 점수를 고정하고, 통과 가능한 투찰률 범위를 찾는다
  const priceItem = sheet.items.find((i) => i.kind === "price");
  const rateWindow = pending ? undefined : passWindow(sheet, bid, total - (items.find((i) => i.id === priceItem?.id)?.score ?? 0));

  const tips: string[] = [];
  for (const u of items.filter((i) => i.unknown)) tips.push(`${u.label}(${u.max}점)은 기초금액이 없는 공고라 계산하지 못했습니다. 공고서의 실적 평가 기준을 확인하면 점수를 정할 수 있습니다.`);
  const losers = [...items].filter((i) => i.kind !== "price" && i.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 3);
  for (const l of losers) {
    const up = l.bands && l.bands[0].unit === "%" ? [...l.bands].sort((a, b) => a.min - b.min).find((b) => b.points > l.score && b.min > 0) : undefined;
    if (l.kind === "performance" && up) tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. ${sheet.source === "extracted" ? "공고" : "기준표"} 구간상 유사 실적이 ${amtLabel}의 ${up.min}%(${won(Math.round((amt * up.min) / 100))}) 이상이면 ${up.points}점입니다. 공동수급 지분 합산도 검토하세요.`);
    else if (l.kind === "performance") tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. 공동수급으로 실적을 합산하면 만점에 가까워질 수 있습니다.`);
    else if (l.kind === "credit") tips.push(c.creditGrade === "없음" ? `${l.label}에서 ${l.lost}점이 빠집니다. 유효한 신용평가등급확인서가 없으면 최저등급(공사는 0점)으로 평가하니 공고일 전 신용평가를 받으세요.` : `${l.label}에서 ${l.lost}점이 빠집니다. 공고일 전 신용평가 재평가 일정을 확인하세요.`);
    else if (l.kind === "capability") tips.push(`사업수행능력 평가점수가 ${c.pqScore}점이라 ${l.lost}점이 빠집니다. 참여기술인·유사 용역 실적 서류를 보강하세요.`);
    else if (l.kind === "finance") tips.push(`재무비율이 공고 기준비율보다 낮아 ${l.lost}점이 빠집니다. 최근 결산 재무제표 기준으로 다시 확인하세요.`);
    else if (l.kind === "staff") tips.push(`기술인력이 부족해 ${l.lost}점이 빠집니다. 투입 예정 인력의 자격증·재직증명을 미리 준비하세요.`);
    else if (l.kind === "qualitative") tips.push(`정성평가 '${l.label}'에서 ${l.lost}점 차이가 납니다. 발주기관 과업지시서 요구사항을 목차에 1:1로 대응시키세요.`);
    else if (l.kind === "years") tips.push(`업력 항목에서 ${l.lost}점이 빠집니다.`);
  }
  const lwlt = sheet.lowerLimit ?? bid.lowerLimitRate;
  if (sheet.pass?.kind === "total" && rateWindow) tips.push(`통과 가능한 투찰률은 예정가격의 ${rateWindow.low}% ~ ${rateWindow.high}% 입니다.${lwlt ? ` 낙찰하한율 ${lwlt}%보다 낮게 쓰면 탈락합니다.` : ""}`);
  if (sheet.pass?.kind === "total" && !rateWindow && priceItem && !passed) tips.push("가격 만점을 받아도 통과 점수에 못 미칩니다. 실적·신용 항목을 먼저 보완해야 합니다.");

  return { sheet, items, total, max, pending, techScore, techMax, passed, passLabel, gap, rateWindow, tips, trust };
}

/** 개업일(YYYY-MM-DD…)로 업력(년) 계산 */
export function yearsSince(iso: string, now = new Date()): number {
  const d = new Date(iso.slice(0, 10));
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (365.25 * 86400000)));
}
