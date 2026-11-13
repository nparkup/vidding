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
  /** 공고 세부기준의 점수 구간 (예: 실적 100% 이상 15점, 80% 이상 13점) */
  bands?: ScoreBand[];
  /** 이 항목에서 인정하는 서류·실적 범위 (원문 문장) */
  recognition?: string[];
  /** 정성 항목의 평가 요소 (원문 문장) */
  criteria?: string[];
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
  /** 추출 신뢰도 (배점 합계가 100에 가까운지 등) */
  confidence: "높음" | "보통" | "낮음";
  notes: string[];
  /** 정성평가 등급표 */
  scale?: ScaleLevel[];
  /** 평가위원 점수 처리 방식 (예: 최고·최저 점수를 뺀 산술평균) */
  panelRule?: string;
  /** 공고 전체에 걸친 서류 인정 기준 (기준일, 발급 기관, 공동수급 지분 등) */
  recognition?: string[];
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
export function extractSheet(text: string, fallback?: EvalSheet): EvalSheet | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
  const found: EvalItem[] = [];
  const seen = new Set<string>();
  let inTable = false;
  let lastLabel = "";
  let cur = -1; // 지금 읽는 줄 번호
  const lineOf = new Map<EvalItem, number>();
  const inline = new Map<EvalItem, ScoreBand[]>();

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
    const it = item(label, max, kindOf(label), basis.slice(0, 80), group);
    lineOf.set(it, cur);
    found.push(it);
  };

  for (const line of lines) {
    cur++;
    // 앞 항목의 점수 구간 줄("80% 이상 13점", "A0 이상 15점")은 새 항목으로 만들지 않는다
    if (found.length && isBandLine(line, found[found.length - 1].max, found[found.length - 1].kind)) { lastLabel = ""; continue; }
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

  // 소계 머리글 처리: "정량평가"처럼 분야 이름이고 바로 뒤 2개 이상 항목의 배점 합과 같으면 머리글로 보고 하위 항목의 그룹 이름으로 쓴다
  for (let i = 0; i < found.length; i++) {
    let acc = 0;
    let j = i + 1;
    while (j < found.length && acc + found[j].max <= found[i].max + 0.001) { acc += found[j].max; j++; }
    const groupLike = /(정량|정성|계량|비계량|기술\s*능력|평가\s*분야|부문|분야)/.test(found[i].label) && !["performance", "credit", "price", "staff", "years"].includes(found[i].kind);
    if (groupLike && j > i + 2 && Math.abs(acc - found[i].max) < 0.01) {
      const group = found[i].label.replace(/\s*\(.*$/, "");
      for (let k = i + 1; k < j; k++) found[k].group = group;
      found.splice(i, 1);
      i = j - 2;
    }
  }

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
    scale: parseScale(text),
    panelRule: parsePanelRule(text),
    recognition: recognitionAll.length ? recognitionAll : undefined,
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
  /** 실적 중 나라장터 낙찰 이력에서 자동으로 찾은 금액이 있으면 그 설명 (예: "나라장터 낙찰 4건 추정") */
  perfSource?: string;
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
  if (unit === "grade") return it.kind === "credit" ? CREDIT_GRADES.indexOf(c.creditGrade) : undefined;
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

export function predict(sheet: EvalSheet, bid: Pick<Bid, "baseAmount" | "lowerLimitRate">, c: CompanyInput): Prediction {
  const amt = bid.baseAmount;
  const items: PredictedItem[] = sheet.items.map((it) => {
    let ratio = 0;
    let reason = "";
    const bv = it.bands?.length ? bandValue(it, c, amt) : undefined;
    if (bv !== undefined && it.bands && it.max > 0) {
      const { points, band } = scoreByBands(it.bands, bv);
      const s = Math.min(it.max, points);
      const what = it.kind === "credit" ? `신용평가등급 ${c.creditGrade}` : it.kind === "performance" ? `유사 실적 ${Math.round(bv)}% (기초금액 대비${c.perfSource ? `, ${c.perfSource}` : ""})` : it.kind === "staff" ? `기술인력 ${c.techStaff}명` : `업력 ${c.years}년`;
      return { ...it, score: round1(s), ratio: s / it.max, reason: `${what} → 공고 구간 ${band ? `'${band.cond}' ${band.points}점` : "최저 구간 미만"}`, lost: round1(it.max - s) };
    }
    if ((it.kind === "qualitative" || it.kind === "other") && sheet.scale?.length) {
      const lv = scaleLevel(sheet.scale, c.proposal);
      const s = it.max * lv.ratio;
      return { ...it, score: round1(s), ratio: lv.ratio, reason: `공고 등급 '${lv.label}(${Math.round(lv.ratio * 100)}%)' 적용, 제안 준비 '${c.proposal}' 기준 예상`, lost: round1(it.max - s) };
    }
    switch (it.kind) {
      case "performance": {
        ratio = performanceRatio(c.pastPerformance, amt);
        reason = c.pastPerformance
          ? `유사 실적 ${Math.round((c.pastPerformance / amt) * 100)}% (기초금액 대비${c.perfSource ? `, ${c.perfSource}` : ""})`
          : "유사 실적 미입력: 0점으로 계산";
        break;
      }
      case "credit":
        ratio = creditRatio(c.creditGrade, amt);
        reason = `신용평가등급 ${c.creditGrade}`;
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
    const up = l.bands && l.bands[0].unit === "%" ? [...l.bands].sort((a, b) => a.min - b.min).find((b) => b.points > l.score && b.min > 0) : undefined;
    if (l.kind === "performance" && up) tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. 공고 구간상 유사 실적이 기초금액의 ${up.min}%(${Math.round((amt * up.min) / 100 / 1e6).toLocaleString()}백만 원) 이상이면 ${up.points}점입니다. 공동수급 지분 합산도 검토하세요.`);
    else if (l.kind === "performance") tips.push(`${l.label}에서 ${l.lost}점이 빠집니다. 공동수급으로 실적을 합산하면 만점에 가까워질 수 있습니다.`);
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
