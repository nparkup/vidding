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
import type { Bid, BizType, ContractMethod } from "./types";

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
export type ItemKind = "performance" | "credit" | "price" | "years" | "staff" | "bonus" | "qualitative" | "other";

export interface EvalItem {
  id: string;
  group: string;      // 수행능력·경영상태·기술능력·신인도·입찰가격 등
  label: string;
  max: number;        // 배점 (감점 항목은 0)
  kind: ItemKind;
  basis?: string;     // 원문 문구 또는 산식 설명
}

export interface EvalSheet {
  method: ContractMethod | "종합심사";
  title: string;
  items: EvalItem[];
  /** 통과 기준: 총점 기준 또는 기술점수 비율 기준 */
  pass?: { kind: "total"; score: number } | { kind: "techRatio"; ratio: number };
  source: "extracted" | "template";
  /** 추출 신뢰도 (배점 합계가 100에 가까운지 등) */
  confidence: "높음" | "보통" | "낮음";
  notes: string[];
}

const KIND_RULES: [ItemKind, RegExp][] = [
  ["price", /입찰\s*가격|가격\s*평가|입찰금액|투찰\s*금액|가격점수|가격\s*제안/],
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
  bonus: "신인도",
  qualitative: "기술(정성)",
  other: "기타",
};

let seq = 0;
const item = (label: string, max: number, kind: ItemKind, basis?: string, group?: string): EvalItem => ({
  id: `i${++seq}`, label, max, kind, basis, group: group ?? GROUP_OF[kind],
});

/** 고시금액(용역 2.3억 원 내외) 이상 여부: 적격심사 배점 구조가 갈린다 */
const NOTICE_AMOUNT = 230_000_000;

/**
 * 표준 평가표. 공고문을 확보하지 못했을 때 쓰는 기본 구조로, 실제 배점은 공고별 세부기준을 따른다.
 */
export function templateSheet(bid: Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category">): EvalSheet {
  const biz: BizType = bid.bizType ?? "용역";
  const amt = bid.baseAmount;
  const notes = ["공고문·규격서를 넣으면 원문 배점으로 바꿔 다시 계산합니다."];

  if (bid.contractMethod === "협상에 의한 계약") {
    return {
      method: "협상에 의한 계약",
      title: "협상에 의한 계약 제안서 평가 (기술 80 · 가격 20)",
      source: "template",
      confidence: "보통",
      pass: { kind: "techRatio", ratio: 0.85 },
      notes: [...notes, "기술능력 평가점수가 배점의 85% 이상인 업체가 협상적격자가 됩니다."],
      items: [
        item("유사 사업 수행실적", 8, "performance", "최근 3년 유사 사업 실적 금액·건수", "정량평가"),
        item("경영상태 (신용평가등급)", 6, "credit", "회사채·기업어음·기업신용평가등급", "정량평가"),
        item("참여 인력 보유", 4, "staff", "투입 인력 자격·경력", "정량평가"),
        item("신인도 가점", 2, "bonus", "여성·장애인·사회적기업, 고용우수 등", "정량평가"),
        item("사업 이해도·추진 전략", 15, "qualitative", undefined, "정성평가"),
        item("수행 방법론·세부 계획", 25, "qualitative", undefined, "정성평가"),
        item("관리 방안 (품질·일정·보안·안전)", 12, "qualitative", undefined, "정성평가"),
        item("제안 발표·질의응답", 8, "qualitative", undefined, "정성평가"),
        item("입찰가격", 20, "price", "배점 × (최저 입찰가격 ÷ 해당 입찰가격)"),
      ],
    };
  }

  if (bid.contractMethod === "적격심사") {
    if (biz === "공사") {
      return {
        method: "적격심사",
        title: "공사 적격심사 (시공경험·경영상태·가격)",
        source: "template",
        confidence: "보통",
        pass: { kind: "total", score: 92 },
        notes: [...notes, "추정가격 100억 원 미만 공사는 종합평점 92점 이상이면 낙찰자로 결정됩니다."],
        items: [
          item("시공경험 (최근 10년 동일·유사 공사)", 15, "performance", "공사 규모 대비 실적 누계"),
          item("기술능력 (기술자 보유)", 0, "staff", "규모에 따라 시공경험에 포함되거나 별도 배점"),
          item("경영상태 (신용평가등급)", 15, "credit", "등급별 평점, 미달 시 재무비율 평가"),
          item("신인도 가·감점", 0, "bonus", "±2점 내외, 부실벌점 감점"),
          item("입찰가격", 70, "price", "70 − 2 × |88/100 − 입찰가격/예정가격| × 100"),
        ].filter((i) => i.max > 0 || i.kind === "bonus"),
      };
    }
    const big = amt >= NOTICE_AMOUNT;
    return {
      method: "적격심사",
      title: `${biz} 적격심사 (${big ? "고시금액 이상" : "고시금액 미만"})`,
      source: "template",
      confidence: "보통",
      pass: { kind: "total", score: 85 },
      notes: [...notes, "종합평점 85점 이상인 업체 가운데 최저가 순으로 낙찰자를 정합니다."],
      items: big
        ? [
            item(`${biz === "물품" ? "납품" : "용역 수행"}실적`, 15, "performance", "최근 3년 유사 실적 ÷ 추정가격"),
            item("경영상태 (신용평가등급)", 15, "credit", "신용평가등급별 평점"),
            item("신인도 가·감점", 0, "bonus", "+2 ~ −3점, 고용·인증·제재 이력"),
            item("입찰가격", 70, "price", "70 − 4 × |88/100 − 입찰가격/예정가격| × 100"),
          ]
        : [
            item(`${biz === "물품" ? "납품" : "용역 수행"}실적`, 10, "performance", "최근 3년 유사 실적 ÷ 추정가격"),
            item("경영상태 (신용평가등급)", 10, "credit", "신용평가등급별 평점"),
            item("신인도 가·감점", 0, "bonus", "+2 ~ −3점"),
            item("입찰가격", 80, "price", "80 − 4 × |88/100 − 입찰가격/예정가격| × 100"),
          ],
    };
  }

  // 최저가·수의계약: 점수 평가가 없거나 가격만 본다
  return {
    method: bid.contractMethod,
    title: `${bid.contractMethod} (가격 중심)`,
    source: "template",
    confidence: "보통",
    notes: [...notes, "이 계약방법은 별도 평가점수 없이 자격 충족 후 가격으로 낙찰자를 정합니다."],
    items: [item("입찰가격", 100, "price", "예정가격 이하 최저가 (하한율 적용 시 그 이상)")],
  };
}

/* ---------- 원문 추출 ---------- */

const POINT_RE = /(\d{1,2}(?:\.\d{1,2})?)\s*점/g;
const SKIP_RE = /(합\s*계|총\s*계|총\s*점|^계$|소\s*계|만점|이상인\s*자|이상\s*득점|평점\s*산식|배점\s*한도|감점\s*한도)/;

function cleanLabel(s: string): string {
  return s
    .replace(/^[\s\d.)(①-⑳ㄱ-ㅎ가-하]{0,3}[.)]\s*/, "")
    .replace(/[|│┃\t]+/g, " ")
    .replace(/[○●◦·\-–—:：]+\s*$/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[(\[（]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 40);
}

/** 공고문 텍스트에서 계약방법을 추정한다 */
export function detectMethod(text: string): EvalSheet["method"] | undefined {
  if (/종합\s*심사/.test(text)) return "종합심사";
  if (/협상에\s*의한\s*계약|제안서\s*평가|기술\s*능력\s*평가/.test(text)) return "협상에 의한 계약";
  if (/적격\s*심사/.test(text)) return "적격심사";
  if (/최저\s*가/.test(text)) return "최저가";
  return undefined;
}

/**
 * 공고문·규격서·평가기준서 텍스트에서 평가항목과 배점을 뽑는다.
 * - "평가항목 … 15점" 형태의 줄, 배점표의 "항목  15" 형태(배점 머리글 이후)를 모두 읽는다.
 * - 합계·소계·통과 기준 문장은 제외하고, 같은 이름은 한 번만 넣는다.
 * - 배점 합계가 100에 가까우면 신뢰도 높음.
 */
export function extractSheet(text: string, fallback?: EvalSheet): EvalSheet | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
  const found: EvalItem[] = [];
  const seen = new Set<string>();
  let inTable = false;
  let lastLabel = "";

  const push = (rawLabel: string, max: number, basis: string) => {
    let label = cleanLabel(rawLabel).replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
    // 표의 첫 열(구분)이 같은 줄에 붙어 오면 그룹 이름으로 떼어 낸다
    let group: string | undefined;
    const g = label.match(/^((?:정량|정성|기술|가격|신인도)\s*(?:평가)?|수행\s*능력|경영\s*상태)\s+(.{2,})$/);
    if (g) { group = g[1].replace(/\s/g, ""); label = g[2]; }
    if (!label || label.length < 2 || /^\d/.test(label) || SKIP_RE.test(label)) return;
    if (!(max > 0 && max <= 80)) return;
    const key = label.replace(/\s/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    found.push(item(label, max, kindOf(label), basis.slice(0, 80), group));
  };

  for (const line of lines) {
    if (/배\s*점/.test(line) && /(평가\s*항목|평가\s*요소|구\s*분|심사\s*항목)/.test(line)) { inTable = true; continue; }
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
      // "실적 15점 신용 15점" 처럼 한 줄에 여러 항목
      let start = 0;
      for (const m of pts) {
        const seg = line.slice(start, m.index).trim();
        if (seg) push(seg, Number(m[1]), line);
        start = (m.index ?? 0) + m[0].length;
      }
      lastLabel = "";
      continue;
    }
    if (inTable) {
      const m = line.match(/^(.{2,40}?)\s+(\d{1,2}(?:\.\d{1,2})?)$/);
      if (m && kindOf(m[1]) !== "other") { push(m[1], Number(m[2]), line); continue; }
    }
    // 다음 줄에 점수만 있는 경우를 위해 기억
    lastLabel = kindOf(line) !== "other" && line.length <= 40 ? line : "";
  }

  // 소계 머리글 처리: 바로 뒤 항목들의 배점 합과 같으면 머리글로 보고 하위 항목의 그룹 이름으로 쓴다
  for (let i = 0; i < found.length; i++) {
    let acc = 0;
    let j = i + 1;
    while (j < found.length && acc + found[j].max <= found[i].max + 0.001) { acc += found[j].max; j++; }
    if (j > i + 1 && Math.abs(acc - found[i].max) < 0.01) {
      const group = found[i].label.replace(/\s*\(.*$/, "");
      for (let k = i + 1; k < j; k++) found[k].group = group;
      found.splice(i, 1);
      i = j - 2;
    }
  }

  if (found.length < 2) return undefined;

  const method = detectMethod(text) ?? fallback?.method ?? "적격심사";
  const sum = found.reduce((s, i) => s + i.max, 0);
  const declaredTotal = (() => {
    const m = text.match(/(?:합\s*계|총\s*점|총\s*계|계)\s*[:：]?\s*(100|1000)\s*점?/);
    return m ? Number(m[1]) : undefined;
  })();
  const near100 = Math.abs(sum - (declaredTotal ?? 100)) <= 2;
  const confidence: EvalSheet["confidence"] = near100 ? "높음" : sum >= 60 && sum <= 130 ? "보통" : "낮음";

  const notes: string[] = [`원문에서 평가항목 ${found.length}개, 배점 합계 ${round1(sum)}점을 찾았습니다.`];
  if (!near100) notes.push("배점 합계가 100점과 달라 일부 항목이 빠졌거나 세부항목이 겹쳤을 수 있습니다. 항목을 확인해 주세요.");
  if (!found.some((i) => i.kind === "price") && method !== "종합심사") {
    const priceMax = Math.max(0, 100 - sum);
    if (priceMax >= 5) {
      found.push(item("입찰가격", priceMax, "price", "원문에 가격 배점이 없어 100점에서 나머지로 계산"));
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
  creditGrade: CreditGrade;
  /** 최근 3년 유사 실적 합계(원) */
  pastPerformance: number;
  /** 신인도 가점 항목 수 (여성·장애인·사회적기업, 고용우수, 인증 등) */
  bonusCount: number;
  /** 최근 2년 제재·벌점 건수 */
  penaltyCount: number;
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
  pastPerformance: 0,
  bonusCount: 0,
  penaltyCount: 0,
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
}

export interface Prediction {
  sheet: EvalSheet;
  items: PredictedItem[];
  total: number;
  max: number;
  techScore: number;
  techMax: number;
  passed?: boolean;
  passLabel?: string;
  gap?: number;
  /** 적격심사: 통과에 필요한 투찰률 범위 */
  rateWindow?: { low: number; high: number };
  tips: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** 금액 구간별로 만점이 나오는 신용등급이 달라진다 (규모가 클수록 높은 등급 요구) */
function creditRatio(grade: CreditGrade, amount: number): number {
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

/** 적격심사 가격 평점: 배점 − k × |88 − 투찰률| (k는 평가식에서 읽고, 없으면 2. 최저 2점) */
function qualPrice(max: number, rate: number, basis?: string): number {
  const k = Number(basis?.match(/[−-]\s*(\d+)\s*×/)?.[1]) || 2;
  return Math.max(2, max - k * Math.abs(88 - rate));
}

export function predict(sheet: EvalSheet, bid: Pick<Bid, "baseAmount" | "lowerLimitRate">, c: CompanyInput): Prediction {
  const amt = bid.baseAmount;
  const items: PredictedItem[] = sheet.items.map((it) => {
    let ratio = 0;
    let reason = "";
    switch (it.kind) {
      case "performance": {
        ratio = performanceRatio(c.pastPerformance, amt);
        reason = c.pastPerformance
          ? `유사 실적 ${Math.round((c.pastPerformance / amt) * 100)}% (기초금액 대비)`
          : "유사 실적 미입력: 0점으로 계산";
        break;
      }
      case "credit":
        ratio = creditRatio(c.creditGrade, amt);
        reason = `신용평가등급 ${c.creditGrade}${ratio === 1 ? ", 이 규모의 만점 등급" : ""}`;
        break;
      case "years":
        ratio = yearsRatio(c.years);
        reason = `업력 ${c.years}년`;
        break;
      case "staff":
        ratio = staffRatio(c.techStaff, amt);
        reason = `기술인력 ${c.techStaff}명`;
        break;
      case "bonus": {
        const plus = Math.min(2, c.bonusCount * 0.5);
        const minus = Math.min(3, c.penaltyCount * 1);
        const pts = it.max > 0 ? clamp((plus - minus) / it.max, -1, 1) * it.max : plus - minus;
        return { ...it, score: round1(pts), ratio: it.max > 0 ? clamp(pts / it.max) : 0, reason: `가점 ${c.bonusCount}건${c.penaltyCount ? `, 감점 ${c.penaltyCount}건` : ""}`, lost: it.max > 0 ? round1(Math.max(0, it.max - pts)) : 0 };
      }
      case "price": {
        if (sheet.method === "협상에 의한 계약" || sheet.method === "종합심사") {
          ratio = clamp(Math.min(c.bidRate, c.rivalRate) / c.bidRate);
          reason = `투찰률 ${c.bidRate}% vs 예상 최저 ${c.rivalRate}%`;
        } else if (sheet.method === "적격심사") {
          const s = qualPrice(it.max, c.bidRate, it.basis);
          return { ...it, score: round1(s), ratio: s / it.max, reason: `투찰률 ${c.bidRate}% (예정가격 대비)`, lost: round1(it.max - s) };
        } else {
          ratio = 1;
          reason = "가격 경쟁: 최저가 순위로 결정";
        }
        break;
      }
      case "qualitative":
      case "other":
        ratio = LEVEL_RATIO[c.proposal];
        reason = `제안 준비 수준 '${c.proposal}' 기준 예상`;
        break;
    }
    const score = round1(it.max * ratio);
    return { ...it, score, ratio, reason, lost: round1(it.max - score) };
  });

  const total = round1(items.reduce((s, i) => s + i.score, 0));
  const max = round1(items.reduce((s, i) => s + i.max, 0));
  const tech = items.filter((i) => i.kind !== "price");
  const techScore = round1(tech.reduce((s, i) => s + i.score, 0));
  const techMax = round1(tech.reduce((s, i) => s + Math.max(0, i.max), 0));

  let passed: boolean | undefined;
  let passLabel: string | undefined;
  let gap: number | undefined;
  if (sheet.pass?.kind === "total") {
    passed = total >= sheet.pass.score - 1e-6;
    gap = round1(total - sheet.pass.score);
    passLabel = `종합평점 ${sheet.pass.score}점 이상`;
  } else if (sheet.pass?.kind === "techRatio") {
    const need = round1(techMax * sheet.pass.ratio);
    passed = techScore >= need;
    gap = round1(techScore - need);
    passLabel = `기술점수 ${need}점 이상 (배점의 ${Math.round(sheet.pass.ratio * 100)}%)`;
  }

  // 적격심사: 비가격 점수를 고정하고, 통과 가능한 투찰률 범위를 찾는다
  let rateWindow: Prediction["rateWindow"];
  const priceItem = sheet.items.find((i) => i.kind === "price");
  if (sheet.method === "적격심사" && sheet.pass?.kind === "total" && priceItem) {
    const nonPrice = total - (items.find((i) => i.id === priceItem.id)?.score ?? 0);
    const ok: number[] = [];
    const floor = bid.lowerLimitRate ?? 0;
    const start = Math.max(80, floor);
    const rates = Array.from({ length: Math.floor((100 - start) / 0.01) + 1 }, (_, n) => Math.round((start + n * 0.01) * 1000) / 1000);
    if (start <= 88) rates.push(88);
    for (const r of rates.sort((x, y) => x - y)) {
      if (nonPrice + qualPrice(priceItem.max, r, priceItem.basis) >= sheet.pass.score - 1e-6) ok.push(r);
    }
    if (ok.length) rateWindow = { low: Math.round(ok[0] * 100) / 100, high: Math.round(ok[ok.length - 1] * 100) / 100 };
  }

  const tips: string[] = [];
  const losers = [...items].filter((i) => i.kind !== "price" && i.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 3);
  for (const l of losers) {
    if (l.kind === "performance") tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. 공동수급으로 실적을 합산하면 만점에 가까워질 수 있습니다.`);
    else if (l.kind === "credit") tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. 공고일 전 신용평가 재평가 일정을 확인하세요.`);
    else if (l.kind === "staff") tips.push(`기술인력이 부족해 ${l.lost}점이 빠집니다. 투입 예정 인력의 자격증·재직증명을 미리 준비하세요.`);
    else if (l.kind === "qualitative") tips.push(`정성평가 '${l.label}'에서 ${l.lost}점 차이가 납니다. 발주기관 과업지시서 요구사항을 목차에 1:1로 대응시키세요.`);
    else if (l.kind === "years") tips.push(`업력 항목에서 ${l.lost}점이 빠집니다.`);
  }
  if (sheet.pass?.kind === "total" && rateWindow) tips.push(`통과 가능한 투찰률은 예정가격의 ${rateWindow.low}% ~ ${rateWindow.high}% 입니다.${bid.lowerLimitRate ? ` 낙찰하한율 ${bid.lowerLimitRate}%보다 낮게 쓰면 탈락합니다.` : ""}`);
  if (sheet.pass?.kind === "total" && !rateWindow && priceItem && !passed) tips.push("가격 만점을 받아도 통과 점수에 못 미칩니다. 실적·신용 항목을 먼저 보완해야 합니다.");

  return { sheet, items, total, max, techScore, techMax, passed, passLabel, gap, rateWindow, tips };
}

/** 개업일(YYYY-MM-DD…)로 업력(년) 계산 */
export function yearsSince(iso: string, now = new Date()): number {
  const d = new Date(iso.slice(0, 10));
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (365.25 * 86400000)));
}
