/**
 * 평가점수 예측의 '낙찰 결과 분석': 낙찰 저장소(R2)의 과거 낙찰로 지금 공고의
 * (1) 전년도 같은 사업 낙찰 결과, (2) 과거 같은 사업(매년 반복 발주)의 낙찰 추이, (3) 비슷한 공고들의 낙찰 결과를 만든다.
 * 그리고 그 결과로 가격점수(협상 최저 경쟁 투찰률, 적격 투찰률)·경쟁 강도·낙찰 가능성을 예측한다.
 *
 * 만드는 곳
 * - 수집(scripts/awards/collect.ts)이 매일 색인을 만든다
 *   idx/agency/{00~63}.json.gz : 수요기관별 과거 낙찰 (10년, 공고 1건당 1줄). 기관 이름 해시로 64개 파일에 나눈다
 *   idx/similar.json.gz        : 업무·계약방법·금액대·세부품명(또는 주공종·업종)별 최근 3년 낙찰 통계
 * - 사이트 빌드(scripts/awards/forBuild.ts)가 지금 공고마다 analyzeBid 로 분석을 만들어 /award-analysis/{id}.json 으로 낸다
 * - 화면(ScorePredictor)이 forecast 로 예측에 반영한다
 * 이 파일은 Node 전용 모듈을 쓰지 않는다 (빌드·화면이 같이 쓴다).
 */
import type { AwardBiz } from "./format";
import { assessSamples, usesAssess, type AssessData } from "./assess";

/* ---------- 색인 형식 ---------- */

/** 계약방법 약자: Q 적격심사, N 협상에 의한 계약, L 최저가·기타 가격 경쟁, O 그 밖 */
export type MethodCode = "Q" | "N" | "L" | "O";
export const METHOD_NAME: Record<MethodCode, string> = { Q: "적격심사", N: "협상에 의한 계약", L: "최저가", O: "기타" };
export function methodCode(method?: string): MethodCode {
  const m = method ?? "";
  if (/협상/.test(m)) return "N";
  if (/적격/.test(m)) return "Q";
  if (/최저|제한경쟁|일반경쟁/.test(m)) return "L";
  return "O";
}

/** 개찰 순위 한 칸: [업체명, 투찰률(%), 투찰금액(원, 2026-11-19 이전 색인은 없음)] */
export type RankCell = [name: string, rate: number, amount?: number];

/** 수요기관 색인 한 줄 (공고 1건) */
export type AgencyRow = [
  no: string, title: string, /** 최종낙찰일 YYYY-MM-DD */ date: string, biz: AwardBiz,
  /** 낙찰금액(원) */ amount: number, /** 낙찰률(%), 없으면 0 */ rate: number, bidders: number, method: MethodCode,
  /** 추정가격(원) */ price: number, /** 기초금액(원) */ base: number, /** 예정가격(원) */ plnprc: number, /** 낙찰하한율(%) */ lwlt: number,
  winner: string, /** 낙찰자의 개찰 순위 (모르면 0) */ wr: number, /** 개찰 1~5위 */ top: RankCell[],
];
export const AGENCY_COLS = ["no", "title", "date", "biz", "amount", "rate", "bidders", "method", "price", "base", "plnprc", "lwlt", "winner", "wr", "top"] as const;
export interface AgencyIndexFile { v: 1; cols: readonly string[]; agencies: Record<string, AgencyRow[]> }

export const AGENCY_BUCKETS = 64;
/** 수요기관 이름 → 색인 파일 번호 (00~63) */
export function agencyBucket(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String((h >>> 0) % AGENCY_BUCKETS).padStart(2, "0");
}

/** 비슷한 공고 통계 (한 묶음) */
export interface SimilarStat {
  /** 낙찰 건수 */
  n: number;
  /** 낙찰률 분포 [10%, 25%, 50%, 75%, 90%] 지점과 평균 (낙찰률이 있는 건만), 표본 수 */
  rate?: { q: [number, number, number, number, number]; mean: number; n: number };
  /** 낙찰률 − 낙찰하한율 (%p) [25%, 50%, 75%]. 하한율이 있는 건만 */
  gap?: { q: [number, number, number]; n: number };
  /** 참가업체 수 [25%, 50%, 75%]와 평균 */
  bidders: { q: [number, number, number]; mean: number };
  /** 자주 낙찰받은 업체 [업체명, 건수] (많은 순 5곳) */
  winners: [string, number][];
  /** 개찰 1~5위에 자주 든 업체 [업체명, 횟수] (많은 순 8곳, 2026-11-19 이후 색인) */
  ranked?: [string, number][];
  /** 개찰 1~5위 평균 투찰률(%)과 표본 수. 낙찰자가 1위였던 비율 */
  ranks?: { mean: number[]; n: number; winnerFirst: number };
  /** 예정가격 ÷ 기초금액 (%) [25%, 50%, 75%] */
  pre?: { q: [number, number, number]; n: number };
  /** 최근 낙찰 예 (최대 5건): [공고번호, 공고명, 수요기관, 낙찰일, 낙찰금액, 낙찰률, 참가업체 수, 낙찰업체, 낙찰자 개찰 순위(모르면 0), 개찰 1~5위] */
  ex?: [string, string, string, string, number, number, number, string, number?, RankCell[]?][];
}

/** 비슷한 공고 묶음 키: 업무|계약방법|금액대|분류. 분류는 c:세부품명번호, w:주공종, l:업종, * 전체 */
export const similarKey = (biz: string, m: MethodCode, band: string, dim: string) => `${biz}|${m}|${band}|${dim}`;
export interface SimilarIndexFile { v: 1; builtAt: string; from: string; to: string; groups: Record<string, SimilarStat> }
/** 비슷한 공고 통계를 만드는 기간(년) */
export const SIMILAR_YEARS = 3;
/** 이보다 적은 묶음은 통계를 내지 않는다 */
export const SIMILAR_MIN = 5;

/* ---------- 공고명 핵심어 색인 ---------- */

/**
 * 핵심어 색인 한 줄 (최근 3년 낙찰 공고 1건): 기관과 상관없이 공고명 핵심어가 같은 공고를 찾는다.
 * idx/kw/{00~63}.json.gz : 핵심어 해시로 나눈 파일. 핵심어마다 df(그 핵심어가 든 공고 수)와 최근 공고 KW_ROWS건
 */
export type KwRow = [
  no: string, title: string, agency: string, date: string, biz: AwardBiz, amount: number, rate: number, bidders: number,
  method: MethodCode, base: number, winner: string, wr: number, top: [name: string, rate: number][],
];
export interface KwPosting { df: number; rows: KwRow[] }
export interface KwIndexFile { v: 1; /** 전체 공고 수 */ n: number; kw: Record<string, KwPosting> }
export const KW_ROWS = 20;
/** 이보다 적은 공고에만 나온 핵심어는 색인하지 않는다 */
export const KW_MIN_DF = 2;
export const kwBucket = (k: string) => agencyBucket(`kw:${k}`);

/** 핵심어로 치지 않는 흔한 말 */
const KW_STOP = new Set([
  "용역", "사업", "운영", "위탁", "구매", "공고", "입찰", "재공고", "긴급", "변경", "정정", "관리", "제작", "설치", "공사", "물품", "대행", "지원",
  "선정", "업체", "업체선정", "추진", "단가", "계약", "연간", "및", "등", "외", "년", "년도", "학년도", "소액수의", "견적", "협상", "제안", "수의",
  "일반", "제한", "경쟁", "개소", "관련", "신규", "기타", "추가", "분", "차", "회", "월", "월분", "상반기", "하반기", "분기", "위한", "의", "를", "에",
  "위탁운영", "운영위탁", "용역사업", "유지", "유지관리", "유지보수", "시스템", "정보시스템", "기술지원", "고도화", "구축", "개발", "개선", "사업자", "사업수행", "수행", "통합", "제", "호", "건", "식", "개", "종", "기", "구입", "임차", "보수", "정비",
]);
/** 핵심어 끝에 붙는 흔한 말: 떼어 낸 앞부분도 핵심어로 넣는다 (예: 선택적복지제도 → 선택적복지) */
const KW_SUFFIX = ["용역", "사업", "운영", "위탁", "대행", "구매", "관리", "제도", "업무", "서비스", "공사", "지원", "구축", "개발", "설치", "제작", "물품", "사업자"];
export function keywords(title: string): string[] {
  const t = title
    .replace(/\(?(긴급|재공고|재입찰|변경|정정)\)?/g, " ")
    .replace(/(19|20)\d{2}\s*(학년도|년도|년)?/g, " ")
    .replace(/\d+/g, " ");
  const out = new Set<string>();
  for (let tok of t.split(/[^가-힣A-Za-z]+/)) {
    if (tok.length < 2) continue;
    tok = tok.toUpperCase();
    if (!KW_STOP.has(tok)) out.add(tok);
    // 뒤에 붙은 흔한 말을 떼어 낸다 (여러 번)
    for (let i = 0; i < 3; i++) {
      const suf = KW_SUFFIX.find((x) => tok.endsWith(x) && tok.length - x.length >= 2);
      if (!suf) break;
      tok = tok.slice(0, -suf.length);
      if (!KW_STOP.has(tok)) out.add(tok);
    }
  }
  return [...out];
}

/** 공고명이 비슷한 다른 낙찰 (기관 무관, 최근 3년) */
export interface Related {
  /** 찾은 공고 수 */
  n: number;
  /** 겹친 핵심어 (무거운 순) */
  terms: string[];
  /** 공고명이 가장 비슷한 낙찰 (최대 8건). SimilarStat.ex 와 같은 꼴 */
  ex: NonNullable<SimilarStat["ex"]>;
  /** 자주 낙찰받은 업체, 개찰 1~5위에 자주 든 업체 (낙찰 제외) */
  winners: [string, number][];
  ranked: [string, number][];
  /** 낙찰률 [25%, 50%, 75%]와 표본 수 (1곳 수의계약 제외) */
  rate?: { q: [number, number, number]; n: number };
  /** 참가업체 수 [25%, 50%, 75%]와 표본 수 */
  bidders?: { q: [number, number, number]; n: number };
  /** 찾은 낙찰 (가까운 순 최대 30건). 같은 종류의 일인지 확인해 거를 때 쓴다 */
  rows?: KwRow[];
}
/** 지역·업종 묶음을 쓰는 최소 표본 */
export const REGIONAL_MIN = 20;
/** 비슷한 공고로 볼 핵심어 가중 Dice 하한 */
export const RELATED_MIN = 0.35;

/* ---------- 통계 도구 ---------- */

export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const median = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

/* ---------- 공고명 비교 ---------- */

/** 연도·차수·괄호 등을 지운 공고명 (같은 사업 찾기용) */
export function titleKey(title: string) {
  return title
    .replace(/(19|20)\d{2}\s*(년도|년)?/g, "")
    .replace(/\d{2}\s*(년도|년)/g, "")
    .replace(/제?\d+\s*(차|회|분기)/g, "")
    .replace(/\(?(긴급|재공고|재입찰|변경|정정)\)?/g, "")
    .replace(/[\s()\[\]{}<>「」『』【】〔〕·,.\-_/'"‘’“”~]/g, "");
}
/** 공고명 유사도: 두 글자 묶음(bigram)의 Dice 계수, 0~1 */
export function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b);
  let common = 0;
  for (const [g, c] of ga) common += Math.min(c, gb.get(g) ?? 0);
  return (2 * common) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}
/** 이 이상 비슷하면 같은 사업으로 본다 */
export const SAME_PROJECT = 0.6;

/* ---------- 공고별 분석 ---------- */

export interface PastAward {
  no: string;
  title: string;
  date: string;
  amount: number;
  rate: number;
  /** 낙찰률이 비어 있어 낙찰금액 ÷ 예정가격(또는 기초금액)으로 계산한 값이면 true */
  derived?: boolean;
  bidders: number;
  method: MethodCode;
  price: number;
  base: number;
  plnprc: number;
  lwlt: number;
  winner: string;
  wr: number;
  top: RankCell[];
  /** 지금 공고명과의 유사도 0~1 */
  similarity: number;
}

export interface AwardAnalysis {
  v: 1;
  builtAt: string;
  /** 자료 범위 (낙찰일 기준) */
  range: { from: string; to: string };
  /** 전년도 같은 사업: 지금 공고보다 약 1년 전(8~20개월) 같은 수요기관의 가장 비슷한 공고 */
  prior?: PastAward;
  /** 과거 같은 사업: 같은 수요기관·같은 업무, 공고명이 비슷한 낙찰 (최근 순, 최대 10건) */
  history: PastAward[];
  /** 비슷한 공고: 가장 좁은 묶음부터 표본이 충분한 것 */
  similar?: { label: string; key: string; stat: SimilarStat };
  /** 공고명에 적힌 계약 기간이 2년 이상이면 그 햇수 (전년도 대신 그만큼 전의 직전 계약을 찾는다) */
  cycleYears?: number;
  /** 같은 사업인지 애매한 후보 (최대 10건). 화면에서 확인을 거쳐 이력에 넣는다 */
  maybe?: PastAward[];
  /** 공고명 핵심어가 같은 다른 낙찰 (기관 무관) */
  related?: Related;
  /** 애매한 후보 확인용 지금 공고 정보 */
  subject?: { title: string; agency: string; baseAmount: number; postedAt: string };
  /** 애매한 후보 중 같은 사업으로 확인되어 이력에 넣은 공고번호 */
  confirmed?: string[];
  /** 공사: 참가 지역·업종이 같은 비슷한 공고의 참가업체 수 [25%, 50%, 75%] */
  regional?: { label: string; n: number; q: [number, number, number] };
  /** 사정율 분석 표본: 같은 수요기관 최근 4년 낙찰의 예정가격 ÷ 기초금액 (가격 경쟁 공고만). src/lib/awards/assess.ts */
  assess?: AssessData;
  /**
   * 묶음 공고(따로 맡는 업무를 함께 뽑는 공고, 예: 선택적복지 위탁운영 및 복지카드 발급)의 업무별 낙찰.
   * 화면에서 중계 서버 확인 결과로 채운다 (withParts). 업무가 하나면 없음
   */
  parts?: PartGroup[];
}

export interface PartGroup {
  /** 업무 이름 (예: 복지카드 발급) */
  name: string;
  /** 같은 수요기관이 이 업무만 따로 뽑았던 과거 낙찰 (최근 순) */
  own: PastAward[];
  /** 다른 기관 포함 공고명이 비슷한 낙찰 가운데 이 업무의 것 */
  related?: Related;
}

export interface AnalyzeTarget {
  id: string;
  bidNtceNo: string;
  title: string;
  demandAgency: string;
  bizType?: string;
  contractMethod: string;
  baseAmount: number;
  postedAt: string;
  licenseRaw?: string;
  cls?: { no?: string; nm?: string; work?: string };
  /** 참가가능지역 (사이트 공고: 시·도 대표값과 목록, 낙찰 원자료: 원문) */
  region?: string;
  regions?: string[];
  regionRaw?: string;
}

const PROVINCES: [string, string[]][] = [
  ["서울", ["서울"]], ["경기", ["경기"]], ["인천", ["인천"]], ["강원", ["강원"]],
  ["충청북", ["충북"]], ["충북", ["충북"]], ["충청남", ["충남"]], ["충남", ["충남"]],
  ["대전", ["대전"]], ["세종", ["세종"]], ["전라북", ["전북"]], ["전북", ["전북"]],
  ["전남광주", ["광주", "전남"]], ["전라남", ["전남"]], ["전남", ["전남"]], ["광주", ["광주"]],
  ["경상북", ["경북"]], ["경북", ["경북"]], ["경상남", ["경남"]], ["경남", ["경남"]],
  ["대구", ["대구"]], ["울산", ["울산"]], ["부산", ["부산"]], ["제주", ["제주"]],
];
/** 참가가능지역 → 시·도 묶음 키 (제한 없으면 "전국") */
export function provinceKey(x: string | string[] | undefined): string {
  const parts = Array.isArray(x) ? x : (x ?? "").split(",");
  const out = new Set<string>();
  for (const part of parts) {
    if (!part || part.includes("전국")) continue;
    const hit = PROVINCES.find(([k]) => part.includes(k));
    if (hit) hit[1].forEach((r) => out.add(r));
  }
  return out.size ? [...out].sort().join("+") : "전국";
}
/** 공사: 참가 지역(시·도)·업종이 같은 비슷한 공고 묶음 키 (좁은 것부터) */
export function regionalKeys(t: AnalyzeTarget): string[] {
  const rk = provinceKey(t.regionRaw ?? (t.regions?.length ? t.regions : t.region));
  const m = methodCode(t.contractMethod), band = bandOfAmount(t.baseAmount), lic = firstLic(t.licenseRaw);
  return [lic ? similarKey("공사", m, band, `l:${lic}|r:${rk}`) : "", similarKey("공사", m, band, `r:${rk}`)].filter(Boolean);
}

const BAND_KEYS: { key: string; label: string; max: number }[] = [
  { key: "a", label: "1억 원 미만", max: 100_000_000 },
  { key: "b", label: "1억~2.3억 원", max: 230_000_000 },
  { key: "c", label: "2.3억~10억 원", max: 1_000_000_000 },
  { key: "d", label: "10억~50억 원", max: 5_000_000_000 },
  { key: "e", label: "50억 원 이상", max: Infinity },
];
/** rivalRate.ts 의 금액대와 같다 */
export const bandOfAmount = (amount: number) => (BAND_KEYS.find((b) => amount < b.max) ?? BAND_KEYS[BAND_KEYS.length - 1]).key;
export const bandLabel = (k: string) => BAND_KEYS.find((b) => b.key === k)?.label ?? "";
export const firstLic = (raw?: string) => (raw ?? "").split(/\s*,\s*/)[0]?.replace(/\/\d+$/, "").trim() ?? "";

/** 낙찰률이 비어 있으면(협상계약 용역 등) 낙찰금액 ÷ 예정가격(없으면 기초금액)으로 채운다. 50~110%를 벗어나면 0 */
function rateOf(r: AgencyRow): { rate: number; derived?: boolean } {
  if (r[5] > 0) return { rate: r[5] };
  const den = r[10] || r[9];
  const v = den > 0 ? (r[4] / den) * 100 : 0;
  return v > 50 && v <= 110 ? { rate: r3(v), derived: true } : { rate: 0 };
}

const toPast = (r: AgencyRow, s: number): PastAward => ({
  no: r[0], title: r[1], date: r[2], amount: r[4], ...rateOf(r), bidders: r[6], method: r[7], price: r[8], base: r[9], plnprc: r[10],
  lwlt: r[11], winner: r[12], wr: r[13], top: r[14], similarity: Math.round(s * 100) / 100,
});

/** 비슷한 공고 묶음 후보 (좁은 것부터) */
export function similarCandidates(t: AnalyzeTarget): { key: string; label: string }[] {
  const biz = t.bizType === "공사" || t.bizType === "물품" ? t.bizType : "용역";
  const m = methodCode(t.contractMethod);
  const band = bandOfAmount(t.baseAmount);
  const lic = firstLic(t.licenseRaw);
  const dims: { dim: string; name: string }[] = [];
  if (t.cls?.no) dims.push({ dim: `c:${t.cls.no}`, name: `세부품명 ${t.cls.nm ?? t.cls.no}` });
  if (t.cls?.work) dims.push({ dim: `w:${t.cls.work}`, name: `주공종 ${t.cls.work}` });
  if (lic) dims.push({ dim: `l:${lic}`, name: `업종 ${lic}` });
  const out: { key: string; label: string }[] = [];
  const head = `${biz} · ${METHOD_NAME[m]}`;
  for (const d of dims) out.push({ key: similarKey(biz, m, band, d.dim), label: `${head} · 추정가격 ${bandLabel(band)} · ${d.name}` });
  for (const d of dims) out.push({ key: similarKey(biz, m, "*", d.dim), label: `${head} · ${d.name} (금액 전체)` });
  out.push({ key: similarKey(biz, m, band, "*"), label: `${head} · 추정가격 ${bandLabel(band)}` });
  return out;
}

/* ---------- 같은 사업 판정 ---------- */

/**
 * 구분어: 같은 기관이 권역·학년·노선·공구만 바꿔 같은 날 여러 건 내는 공고(형제 공고)를 가른다.
 * 두 공고명에 같은 종류의 구분어가 있는데 값이 다르면 다른 사업이다.
 */
const DIVIDERS: RegExp[] = [
  /([가-힣]{1,2}부)\s*권(?!역)/, /(\d+)\s*권역/, /(\d+)\s*학년(?!도)/, /국도\s*(\d+)\s*호선/, /지방도\s*(\d+)\s*호선/,
  /(\d+)\s*공구/, /(\d+)\s*단계/, /(상|하)\s*반기/, /(\d+)\s*(?:블록|BL)\b/i,
];
function dividers(title: string): (string | undefined)[] {
  return DIVIDERS.map((re) => title.match(re)?.[1]);
}
/** 사업 종류: 둘 다 있고 겹치지 않으면 다른 사업. 감리·설계는 한쪽에만 있어도 다른 사업 */
const KINDS: [string, RegExp][] = [
  ["유지", /유지\s*(?:관리|보수)|운영\s*(?:및\s*)?유지/], ["구축", /구축|개발|도입/], ["전환", /전환|이관|마이그레이션/],
  ["개선", /개선|고도화|개편|재구축/], ["컨설팅", /컨설팅|ISP|ISMP|정보화\s*전략/], ["수학여행", /수학여행/], ["수련", /수련/],
];
const EXCLUSIVE: [string, RegExp][] = [["감리", /감리/], ["설계", /설계/]];
function kinds(title: string): Set<string> {
  return new Set(KINDS.filter(([, re]) => re.test(title)).map(([k]) => k));
}
/** 두 공고명이 구분어·사업 종류 때문에 다른 사업인지 */
export function differentProject(a: string, b: string): string | undefined {
  const da = dividers(a), db = dividers(b);
  for (let i = 0; i < da.length; i++) if (da[i] && db[i] && da[i] !== db[i]) return "구분어";
  for (const [, re] of EXCLUSIVE) if (re.test(a) !== re.test(b)) return "사업 종류";
  const ka = kinds(a), kb = kinds(b);
  if (ka.size && kb.size && ![...ka].some((k) => kb.has(k))) return "사업 종류";
  return undefined;
}
/** 금액 차이가 이보다 크면 다른 사업 */
export const AMOUNT_RATIO = 3;
/** 색인 한 줄의 비교용 금액: 기초금액, 없으면 낙찰금액 */
const rowAmount = (r: AgencyRow) => r[9] || r[4];
function amountFar(target: number, r: AgencyRow): boolean {
  const x = rowAmount(r);
  if (!(target > 0 && x > 0)) return false;
  return Math.max(target, x) / Math.min(target, x) > AMOUNT_RATIO;
}

/**
 * 기관 공고명 전체에서 흔한 두 글자 묶음은 가볍게 본다 (가중 Dice).
 * 같은 기관이 '○○교 등 4개소 시설물 보수공사'처럼 틀이 같은 공고를 많이 내면 틀 문구는 거의 0, 교량명·시스템명 같은 고유한 부분이 무겁다.
 */
interface Idf { n: number; df: Map<string, number> }
const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
function buildIdf(keys: string[]): Idf {
  const df = new Map<string, number>();
  for (const k of keys) for (const g of grams(k).keys()) df.set(g, (df.get(g) ?? 0) + 1);
  return { n: keys.length, df };
}
const weight = (idf: Idf, g: string) => Math.log((idf.n + 1) / ((idf.df.get(g) ?? 0) + 0.5));
export function weightedSimilarity(a: string, b: string, idf: Idf): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = grams(a), gb = grams(b);
  let common = 0, ta = 0, tb = 0;
  for (const [g, c] of ga) { const w = weight(idf, g); ta += c * w; common += Math.min(c, gb.get(g) ?? 0) * w; }
  for (const [g, c] of gb) tb += c * weight(idf, g);
  return ta + tb > 0 ? (2 * common) / (ta + tb) : 0;
}
/** 같은 사업: 공고명 유사도와 고유한 부분 유사도가 둘 다 넘어야 한다 */
export const SAME_WEIGHTED = 0.5;
/** 이 사이는 애매한 후보: 화면에서 따로 확인을 부탁한다 */
export const MAYBE_PLAIN = 0.45;
export const MAYBE_WEIGHTED = 0.3;
/** 같은 날 가까이(이 일수 안) 낸 공고는 한 묶음(형제 공고)으로 보고 가장 비슷한 1건만 남긴다 */
const BATCH_DAYS = 10;

const KEY_MEMO = new WeakMap<AgencyRow[], { keys: string[]; idf: Idf }>();

/** 비슷한 공고 통계로 쓰려면 이만큼은 있어야 한다 */
const SIMILAR_USE = 10;

/** 공고명에 적힌 계약 기간(년). '(2027~2028)'처럼 괄호 안이나 끝에 있는 여러 해 기간만 본다 */
export function contractYears(title: string): number {
  const m = title.match(/\(\s*(20\d{2})\s*(?:년|년도)?\s*[~\-–]\s*(20\d{2})\s*(?:년|년도)?\s*\)/);
  if (!m) return 1;
  const d = Number(m[2]) - Number(m[1]) + 1;
  return d >= 2 && d <= 5 ? d : 1;
}

/** 전년도(직전 계약): 지금 공고일 기준 계약 기간만큼 전(1년이면 8~20개월 전) 중 가장 비슷한 것 */
export function pickPrior(history: PastAward[], posted: string, years = 1): PastAward | undefined {
  const days = (d: string) => (Date.parse(posted) - Date.parse(d)) / 86400e3;
  const lo = 365 * years - 125, hi = 365 * years + 235;
  return history
    .filter((h) => days(h.date) >= lo && days(h.date) <= hi)
    .sort((a, b) => b.similarity - a.similarity || Math.abs(days(a.date) - 365 * years) - Math.abs(days(b.date) - 365 * years))[0];
}

/** 형제 공고 묶음: 날짜가 가까운 것끼리 묶어 가장 비슷한 1건만 남긴다 */
function dedupeBatches<T extends { r: AgencyRow; s: number }>(xs: T[]): T[] {
  const sorted = [...xs].sort((a, b) => b.s - a.s);
  const kept: T[] = [];
  for (const x of sorted) {
    const t = Date.parse(x.r[2]);
    if (kept.some((k) => Math.abs(Date.parse(k.r[2]) - t) <= BATCH_DAYS * 86400e3)) continue;
    kept.push(x);
  }
  return kept;
}

export function analyzeBid(t: AnalyzeTarget, agencyRows: AgencyRow[] | undefined, groups: Record<string, SimilarStat>, range: { from: string; to: string }, opts: { legacy?: boolean; kw?: KwLookup } = {}): AwardAnalysis {
  const biz = t.bizType === "공사" || t.bizType === "물품" ? t.bizType : "용역";
  const key = titleKey(t.title);
  const posted = t.postedAt.slice(0, 10);
  const rows = agencyRows ?? [];
  // 같은 기관 공고를 여러 번 비교하므로 공고명 키와 흔한 글자 통계를 한 번만 만든다
  let memo = KEY_MEMO.get(rows);
  if (!memo) { const keys = rows.map((r) => titleKey(r[1])); memo = { keys, idf: buildIdf(keys) }; KEY_MEMO.set(rows, memo); }
  const { keys: ks, idf } = memo;
  const base = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[3] === biz && r[0] !== t.bidNtceNo && r[2] < posted);
  // 같은 공고번호(재입찰 등)는 한 번만
  const once = <T extends { r: AgencyRow; s: number }>(xs: T[]) => { const m = new Map<string, T>(); for (const h of xs) { const p = m.get(h.r[0]); if (!p || p.s < h.s) m.set(h.r[0], h); } return [...m.values()]; };
  const sortRecent = <T extends { r: AgencyRow; s: number }>(xs: T[]) => xs.sort((a, b) => b.r[2].localeCompare(a.r[2]) || b.s - a.s);

  if (opts.legacy) {
    const hits = once(base.map(({ r, i }) => ({ r, s: similarity(key, ks[i]) })).filter((x) => x.s >= SAME_PROJECT));
    const history = sortRecent(hits).slice(0, 10).map(({ r, s }) => toPast(r, s));
    return { v: 1, builtAt: new Date().toISOString(), range, prior: pickPrior(history, posted), history, similar: pickSimilar(t, groups, key, true) };
  }

  const scored = base.map(({ r, i }) => {
    const plain = similarity(key, ks[i]);
    const w = plain >= MAYBE_PLAIN ? weightedSimilarity(key, ks[i], idf) : 0;
    const hard = plain >= MAYBE_PLAIN ? differentProject(t.title, r[1]) : "유사도";
    // 금액이 3배 넘게 차이 나면 확실한 같은 사업에서는 빼고 애매한 후보로 넘긴다 (단가·총액 표기가 섞인 공고가 있어서)
    const far = plain >= MAYBE_PLAIN && amountFar(t.baseAmount, r);
    return { r, s: Math.min(plain, w), plain, w, hard, far };
  }).filter((x) => !x.hard);
  const isSure = (x: (typeof scored)[number]) => !x.far && x.plain >= SAME_PROJECT && x.w >= SAME_WEIGHTED;
  const sure = dedupeBatches(once(scored.filter(isSure)));
  const history = sortRecent(sure).slice(0, 10).map(({ r, s }) => toPast(r, s));
  // 애매한 후보: 확실한 것과 같은 묶음(형제 공고)이 아닌 것만, 최근 10건
  const near = (r: AgencyRow) => sure.some((k) => Math.abs(Date.parse(k.r[2]) - Date.parse(r[2])) <= BATCH_DAYS * 86400e3);
  const maybe = sortRecent(dedupeBatches(once(scored.filter((x) => !isSure(x) && (x.w >= MAYBE_WEIGHTED || x.far) && !near(x.r)))))
    .slice(0, 10).map(({ r, s }) => toPast(r, s));
  const years = contractYears(t.title);
  const prior = pickPrior(history, posted, years);
  const out: AwardAnalysis = { v: 1, builtAt: new Date().toISOString(), range, prior, history, similar: pickSimilar(t, groups, key) };
  if (years > 1) out.cycleYears = years;
  if (usesAssess(t.contractMethod)) {
    const as = assessSamples(rows, biz, t.bidNtceNo, posted);
    if (as) out.assess = as;
  }
  if (biz === "공사") {
    const rk = provinceKey(t.regionRaw ?? (t.regions?.length ? t.regions : t.region));
    for (const k of regionalKeys(t)) {
      const g = groups[k];
      if (!g || g.n < REGIONAL_MIN) continue;
      out.regional = { label: `${rk === "전국" ? "참가 지역 제한 없는" : `참가 지역 ${rk.replace(/\+/g, "·")}`}${k.includes("|l:") ? ` · 업종 ${firstLic(t.licenseRaw)}` : ""} 공사`, n: g.n, q: g.bidders.q.map((x) => Math.round(x)) as [number, number, number] };
      break;
    }
  }
  // 애매한 후보가 있으면 확인용으로 지금 공고 정보를 같이 둔다 (중계 서버가 이 파일만 읽고 묻는다)
  const rel = opts.kw ? relatedAwards(t, opts.kw) : undefined;
  if (rel) out.related = rel;
  if (maybe.length) out.maybe = maybe;
  if (maybe.length || rel?.rows?.length) out.subject = { title: t.title, agency: t.demandAgency, baseAmount: t.baseAmount, postedAt: posted };
  return out;
}

export interface KwLookup { n: number; get(k: string): KwPosting | undefined }

/** 공고명 핵심어가 같은 다른 낙찰: 핵심어마다 흔한 정도(df)로 무게를 매겨 가중 Dice가 RELATED_MIN 이상인 것 */
export function relatedAwards(t: AnalyzeTarget, kw: KwLookup, keep?: (r: KwRow) => boolean): Related | undefined {
  const c = relatedRows(t, kw);
  if (!c) return undefined;
  return summarizeRelated(keep ? { ...c, top: c.top.filter((x) => keep(x.r)) } : c);
}

/** 핵심어가 겹치는 다른 낙찰 (가까운 순 최대 30건). 3건이 안 되면 없음 */
export function relatedRows(t: AnalyzeTarget, kw: KwLookup): { n: number; tw: Map<string, number>; top: { r: KwRow; s: number; used: string[] }[] } | undefined {
  const biz = t.bizType === "공사" || t.bizType === "물품" ? t.bizType : "용역";
  const posted = t.postedAt.slice(0, 10);
  const terms = keywords(t.title);
  const w = (k: string) => { const p = kw.get(k); return p ? Math.log((kw.n + 1) / (p.df + 1)) : Math.log(kw.n + 1); };
  const tw = new Map(terms.map((k) => [k, w(k)]));
  const tSum = [...tw.values()].reduce((a, b) => a + b, 0);
  const seen = new Map<string, KwRow>();
  for (const k of terms) for (const r of kw.get(k)?.rows ?? []) if (r[4] === biz && r[0] !== t.bidNtceNo && r[3] < posted) seen.set(r[0], r);
  const scored = [...seen.values()].map((r) => {
    const rk = keywords(r[1]);
    let common = 0, rSum = 0;
    const used: string[] = [];
    for (const k of rk) { const x = tw.get(k) ?? w(k); rSum += x; if (tw.has(k)) { common += x; used.push(k); } }
    return { r, s: tSum + rSum > 0 ? (2 * common) / (tSum + rSum) : 0, used };
  }).filter((x) => x.s >= RELATED_MIN && !kindsDiffer(t.title, x.r[1]));
  if (scored.length < 3) return undefined;
  scored.sort((a, b) => b.s - a.s || b.r[3].localeCompare(a.r[3]));
  return { n: scored.length, tw, top: scored.slice(0, 30) };
}

function summarizeRelated({ n, tw, top }: NonNullable<ReturnType<typeof relatedRows>>): Related | undefined {
  const usedT = new Map<string, number>();
  for (const { used } of top) for (const k of used) usedT.set(k, tw.get(k) ?? 0);
  return relatedFromRows(n, [...usedT].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 4), top.map((x) => x.r));
}

function relatedFromRows(n: number, terms: string[], rows: KwRow[], min = 3): Related | undefined {
  if (rows.length < min) return undefined;
  const cnt = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const wins = new Map<string, number>(), ranked = new Map<string, number>();
  for (const r of rows) {
    if (r[10]) cnt(wins, r[10]);
    for (const [name] of r[12]) if (name && name !== r[10]) cnt(ranked, name);
  }
  const q3 = (v: number[]) => { const x = [...v].sort((a, b) => a - b); return [r3(quantile(x, 0.25)), r3(quantile(x, 0.5)), r3(quantile(x, 0.75))] as [number, number, number]; };
  const rates = rows.filter((r) => r[7] !== 1 && r[6] > 50 && r[6] <= 110).map((r) => r[6]);
  const bids = rows.filter((r) => r[7] > 1).map((r) => r[7]);
  const out: Related = {
    n,
    terms,
    ex: rows.slice(0, 8).map((r) => [r[0], r[1], r[2], r[3], r[5], r[6], r[7], r[10], r[11], r[12].map(([n, x]) => [n, x] as RankCell)]),
    winners: [...wins].sort((a, b) => b[1] - a[1]).slice(0, 8),
    ranked: [...ranked].sort((a, b) => b[1] - a[1]).slice(0, 8),
    rows,
  };
  if (rates.length >= 3) out.rate = { q: q3(rates), n: rates.length };
  if (bids.length >= 3) out.bidders = { q: q3(bids), n: bids.length };
  return out;
}

/**
 * 핵심어로 찾은 다른 기관 낙찰 가운데 같은 종류의 일로 확인된 것만 남긴다 (중계 서버 확인 결과).
 * 3건이 안 남으면 핵심어 낙찰은 쓰지 않는다 (참가 예상 기업은 비슷한 공고 묶음으로)
 */
export function withKind(a: AwardAnalysis, nos: string[]): AwardAnalysis {
  const rel = a.related;
  if (!rel?.rows?.length) return a;
  const ok = new Set(nos);
  const kept = rel.rows.filter((r) => ok.has(r[0]));
  if (kept.length === rel.rows.length) return a;
  const next = relatedFromRows(kept.length, rel.terms, kept);
  const out = { ...a };
  if (next) out.related = next; else delete out.related;
  return out;
}
/**
 * 묶음 공고를 업무별로 나눈다 (중계 서버 확인 결과: 업무 이름과 후보 공고번호 → 업무 번호).
 * 다른 기관 핵심어 낙찰과, 같은 기관이 그 업무만 따로 뽑았던 애매한 후보를 업무마다 모은다.
 * withKind 보다 먼저 부른다 (withKind 가 핵심어 낙찰을 3건 미만이면 지우기 때문)
 */
export function withParts(a: AwardAnalysis, parts: string[] | undefined, partOf: Record<string, number> | undefined): AwardAnalysis {
  if (!parts || parts.length < 2 || !partOf) return a;
  const rows = a.related?.rows ?? [];
  const groups: PartGroup[] = parts.map((name, i) => {
    const own = (a.maybe ?? []).filter((m) => partOf[m.no] === i).sort((x, y) => y.date.localeCompare(x.date));
    const mine = rows.filter((r) => partOf[r[0]] === i);
    const related = relatedFromRows(mine.length, a.related?.terms ?? [], mine, 1);
    return related ? { name, own, related } : { name, own };
  });
  // 업무 하나에만 자료가 있으면 나누어 보여 줄 것이 없다
  if (groups.filter((g) => g.own.length || g.related).length < 2) return a;
  return { ...a, parts: groups };
}

/** 사업 종류만 본다 (다른 기관끼리는 권역·노선 같은 구분어가 달라도 비슷한 공고다) */
function kindsDiffer(a: string, b: string): boolean {
  for (const [, re] of EXCLUSIVE) if (re.test(a) !== re.test(b)) return true;
  const ka = kinds(a), kb = kinds(b);
  return ka.size > 0 && kb.size > 0 && ![...ka].some((k) => kb.has(k));
}

/** 비슷한 공고 묶음 고르기. 최근 낙찰 예는 공고명이 조금이라도 겹치는 것만 (가까운 순 5건) */
function pickSimilar(t: AnalyzeTarget, groups: Record<string, SimilarStat>, key: string, legacy = false): AwardAnalysis["similar"] {
  for (const c of similarCandidates(t)) {
    const st = groups[c.key];
    if (!st || st.n < SIMILAR_USE) continue;
    if (legacy || !st.ex) return { ...c, stat: legacy && st.ex ? { ...st, ex: st.ex.slice(0, 5) } : st };
    const ex = st.ex
      .map((e) => ({ e, s: similarity(key, titleKey(e[1])) }))
      .filter((x) => x.s >= EX_SIMILAR && !differentProject(t.title, x.e[1]))
      .sort((a, b) => b.s - a.s || b.e[3].localeCompare(a.e[3]))
      .slice(0, 5).map((x) => x.e);
    const stat = { ...st };
    if (ex.length) stat.ex = ex; else delete stat.ex;
    return { ...c, stat };
  }
  return undefined;
}
/** 비슷한 공고의 최근 낙찰 예로 보여 줄 최소 공고명 유사도 */
export const EX_SIMILAR = 0.2;

/** 애매한 후보 중 같은 사업으로 확인된 공고를 이력에 넣고 전년도를 다시 고른다 */
export function withConfirmed(a: AwardAnalysis, nos: string[], posted: string): AwardAnalysis {
  if (!a.maybe?.length || !nos.length) return a;
  const ok = a.maybe.filter((m) => nos.includes(m.no));
  if (!ok.length) return a;
  const history = [...a.history, ...ok].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 10);
  return { ...a, history, prior: pickPrior(history, posted, a.cycleYears ?? 1), confirmed: ok.map((m) => m.no) };
}

/* ---------- 예측에 반영 ---------- */

export type Level3 = "낮음" | "보통" | "높음" | "매우 높음";

export interface Forecast {
  /** 예상 참가업체 수 [적게, 보통, 많게] 와 근거 */
  bidders?: { q: [number, number, number]; basis: string };
  /** 경쟁 강도 */
  competition?: { level: Level3; text: string };
  /** 과거 낙찰률 기준 (%), 근거 */
  winRate?: { value: number; basis: string };
  /** 협상: 예상 최저 경쟁 투찰률(개찰 1위 투찰률) */
  rival?: { value: number; basis: string };
  /** 적격: 과거 낙찰자가 쓴 투찰률 (하한율 + 차이) */
  suggestRate?: { value: number; low: number; high: number; basis: string };
  /** 예정가격 ÷ 기초금액 (%) 예상과 근거 */
  pre?: { value: number; basis: string };
  /** 과거 같은 사업 낙찰률 추이 (최근 − 처음, %p) */
  trend?: { first: number; last: number; years: number; text: string };
  /** 같은 업체가 연속 낙찰한 경우 */
  incumbent?: { name: string; count: number; total: number };
  /** 참가 예상 기업: 과거 같은 사업에서 낙찰받거나 개찰 1~5위에 든 업체, 모자라면 비슷한 공고에 자주 낙찰·상위에 든 업체 */
  likely?: LikelyBidder[];
  /** 묶음 공고: 업무별 참가 예상 기업 */
  likelyParts?: { name: string; likely: LikelyBidder[] }[];
}

export interface LikelyBidder {
  name: string;
  /** 과거 같은 사업에서 낙찰 / 개찰 1~5위 횟수 */
  wins: number;
  top: number;
  /** 같은 사업 이력에서 나왔으면 "same", 비슷한 공고 통계에서 나왔으면 "similar" */
  from: "same" | "similar";
  /** 비슷한 공고에서의 낙찰·상위 횟수 */
  simWins?: number;
  simTop?: number;
  /** 같은 사업에서 마지막으로 나온 날 */
  last?: string;
}

/** 참가 예상 기업 (최대 n곳) */
export function likelyBidders(h: PastAward[], st: Pick<SimilarStat, "winners" | "ranked"> | undefined, n = 8): LikelyBidder[] {
  const m = new Map<string, LikelyBidder>();
  const get = (name: string, from: LikelyBidder["from"]) => m.get(name) ?? m.set(name, { name, wins: 0, top: 0, from }).get(name)!;
  for (const x of h) {
    if (x.winner) { const b = get(x.winner, "same"); b.wins++; if (!b.last || b.last < x.date) b.last = x.date; }
    for (const [name] of x.top) { if (!name) continue; const b = get(name, "same"); if (name !== x.winner) b.top++; if (!b.last || b.last < x.date) b.last = x.date; }
  }
  // 같은 사업: 낙찰 2점, 상위 1점, 최근일수록 앞에
  const same = [...m.values()].sort((a, b) => b.wins * 2 + b.top - (a.wins * 2 + a.top) || (b.last ?? "").localeCompare(a.last ?? ""));
  const out = same.slice(0, n);
  if (st && out.length < n) {
    const sim = new Map<string, { w: number; t: number }>();
    for (const [name, c] of st.winners) sim.set(name, { w: c, t: 0 });
    for (const [name, c] of st.ranked ?? []) sim.set(name, { w: sim.get(name)?.w ?? 0, t: c });
    for (const b of out) { const s = sim.get(b.name); if (s) { b.simWins = s.w; b.simTop = s.t; } }
    const rest = [...sim].filter(([name]) => !m.has(name)).sort((a, b) => b[1].w * 2 + b[1].t - (a[1].w * 2 + a[1].t));
    for (const [name, s] of rest) { if (out.length >= n) break; out.push({ name, wins: 0, top: 0, from: "similar", simWins: s.w, simTop: s.t }); }
  }
  return out;
}

const fmt = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);

/** 분석 결과에서 공고 하나의 경쟁·가격 예측값을 만든다 (입력값과 상관없는 부분) */
export function forecast(a: AwardAnalysis | null | undefined, bid: { contractMethod: string; lowerLimitRate?: number }, floor?: number): Forecast {
  if (!a) return {};
  const out: Forecast = {};
  // 1곳 수의계약은 경쟁 결과가 아니므로 낙찰률·참가업체 통계에서 뺀다 (낙찰업체 이력에는 남긴다)
  const all = a.history;
  const h = all.filter((x) => x.bidders !== 1);
  const st = a.similar?.stat;
  // 공고명이 비슷한 다른 기관 낙찰은 참가 예상 기업과 예시에만 쓴다 (되짚어 보기에서 낙찰률·참가업체 수 예측은 업무·금액대 묶음이 더 맞았다)
  const rel = a.related;

  // 참가업체 수: 같은 사업 이력이 2건 이상이면 그 분포, 아니면 비슷한 공고 분포. 전년도 값이 있으면 근거에 같이 적는다
  // 되짚어 보기(8주): 공사 적격심사를 빼면 가운데 값은 최근 3건 중앙값이 전체 중앙값보다 맞았다 (물품 적격 40→33%, 용역 적격 38→33%)
  const biz = a.similar?.key.split("|")[0];
  const m = methodCode(bid.contractMethod);
  const hbRecent = h.map((x) => x.bidders).filter((n) => n > 0);
  const hb = [...hbRecent].sort((x, y) => x - y);
  const recent3 = !(biz === "공사" && m === "Q");
  if (hb.length < 2 && a.regional) {
    // 되짚어 보기(8주): 같은 사업 이력이 적은 공사는 참가 지역·업종이 같은 공고 분포가 훨씬 맞았다 (적격 34→15%, 최저가 2009→1100%)
    out.bidders = { q: a.regional.q, basis: `${a.regional.label} ${a.regional.n.toLocaleString()}건` };
  } else if (hb.length >= 2) {
    const q: [number, number, number] = [Math.round(quantile(hb, 0.25)), Math.round(quantile(hb, 0.5)), Math.round(quantile(hb, 0.75))];
    if (recent3) {
      const top = hbRecent.slice(0, 3).sort((x, y) => x - y);
      q[1] = Math.round(quantile(top, 0.5));
      q[0] = Math.min(q[0], q[1]);
      q[2] = Math.max(q[2], q[1]);
    }
    out.bidders = { q, basis: recent3 ? `과거 같은 사업 ${hb.length}건 (가운데 값은 최근 ${Math.min(3, hb.length)}건)` : `과거 같은 사업 ${hb.length}건` };
  } else if (recent3 && hb.length === 1) {
    // 같은 사업 1건: 가운데 값은 그 건, 범위는 비슷한 공고 분포로 넓힌다
    const b = hb[0];
    const q: [number, number, number] = st ? [Math.min(b, Math.round(st.bidders.q[0])), b, Math.max(b, Math.round(st.bidders.q[2]))] : [b, b, b];
    out.bidders = { q, basis: st ? `과거 같은 사업 1건과 비슷한 공고 ${st.n.toLocaleString()}건` : "과거 같은 사업 1건" };
  } else if (st) {
    const q = st.bidders.q.map((n) => Math.round(n)) as [number, number, number];
    if (a.prior?.bidders) q[1] = Math.round((q[1] + a.prior.bidders) / 2);
    out.bidders = { q, basis: a.prior?.bidders ? `비슷한 공고 ${st.n.toLocaleString()}건과 전년도 ${a.prior.bidders}곳` : `비슷한 공고 ${st.n.toLocaleString()}건` };
  } else if (a.prior?.bidders) {
    const b = a.prior.bidders;
    out.bidders = { q: [b, b, b], basis: "전년도 같은 사업" };
  }
  if (out.bidders) {
    const n = out.bidders.q[1];
    // 비슷한 공고 분포 안에서의 위치와 절대 숫자를 같이 본다
    const rel = st ? (n > st.bidders.q[2] ? 1 : n < st.bidders.q[0] ? -1 : 0) : 0;
    const level: Level3 = n >= 100 ? "매우 높음" : n >= 30 || rel > 0 ? "높음" : n >= 8 ? "보통" : "낮음";
    const vs = st ? ` · 비슷한 공고 중앙값 ${Math.round(st.bidders.q[1])}곳` : "";
    out.competition = { level, text: `예상 참가 ${out.bidders.q[0] === out.bidders.q[2] ? `${n}곳` : `${out.bidders.q[0]}~${out.bidders.q[2]}곳 (보통 ${n}곳)`}${vs}` };
  }

  // 과거 낙찰률
  const hr = h.map((x) => x.rate).filter((r) => r > 50 && r <= 110);
  // 되짚어 보기(8주): 용역 최저가를 빼면 가장 최근 같은 사업 낙찰률이 중앙값보다 맞았다 (공사 적격 0.174→0.145%p, 물품 적격 2.48→2.27%p, 용역 적격 0.76→0.69%p)
  const latest = !(biz === "용역" && m === "L");
  // 애매한 후보에서 확인되어 들어온 건은 가장 최근 값으로 쓰지 않는다 (되짚어 보기에서 오차가 늘었다)
  const conf = new Set(a.confirmed ?? []);
  const sure = h.filter((x) => !conf.has(x.no)).map((x) => x.rate).filter((r) => r > 50 && r <= 110);
  if (latest && sure.length >= 1) out.winRate = { value: r3(sure[0]), basis: hr.length >= 2 ? `가장 최근 같은 사업 낙찰률 (과거 ${hr.length}건 중앙값 ${fmt(median(hr))}%)` : "가장 최근 같은 사업 낙찰률" };
  else if (hr.length >= 2) out.winRate = { value: r3(median(hr)), basis: `과거 같은 사업 ${hr.length}건 중앙값` };
  else if (a.prior?.rate) out.winRate = { value: a.prior.rate, basis: "전년도 같은 사업" };
  else if (st?.rate) out.winRate = { value: r3(st.rate.q[2]), basis: `비슷한 공고 ${st.rate.n.toLocaleString()}건 중앙값` };

  // 협상: 개찰 1위(가장 낮은) 투찰률. 같은 사업 이력 > 전년도 > 비슷한 공고 > 낙찰률
  if (m === "N") {
    const firsts = h.map((x) => x.top[0]?.[1] ?? 0).filter((r) => r > 50 && r <= 110);
    if (firsts.length >= 2) out.rival = { value: r3(median(firsts)), basis: `과거 같은 사업 ${firsts.length}건의 개찰 1위 투찰률 중앙값` };
    else if (firsts.length === 1) out.rival = { value: r3(firsts[0]), basis: "전년도 같은 사업의 개찰 1위 투찰률" };
    else if (st?.ranks && st.ranks.n >= SIMILAR_USE && st.ranks.mean[0] > 50) out.rival = { value: r3(st.ranks.mean[0]), basis: `비슷한 공고 ${st.ranks.n.toLocaleString()}건의 개찰 1위 평균 투찰률` };
    else if (out.winRate) out.rival = { value: out.winRate.value, basis: `${out.winRate.basis} 낙찰률` };
  }

  // 적격: 하한율 위로 낙찰자가 얼마나 붙여 썼는지. 지금 공고 하한율에 더한다
  const lw = floor ?? bid.lowerLimitRate;
  if (m === "Q" && lw) {
    const gaps = h.filter((x) => x.lwlt > 0 && x.rate > 0).map((x) => x.rate - x.lwlt).filter((g) => g >= 0 && g < 10).sort((x, y) => x - y);
    let q: [number, number, number] | undefined;
    let basis = "";
    if (gaps.length >= 3) { q = [quantile(gaps, 0.25), quantile(gaps, 0.5), quantile(gaps, 0.75)]; basis = `과거 같은 사업 ${gaps.length}건`; }
    else if (st?.gap && st.gap.n >= SIMILAR_USE) { q = st.gap.q; basis = `비슷한 공고 ${st.gap.n.toLocaleString()}건`; }
    else if (gaps.length) { q = [gaps[0], median(gaps), gaps[gaps.length - 1]]; basis = `과거 같은 사업 ${gaps.length}건`; }
    if (q) out.suggestRate = { value: r3(lw + q[1]), low: r3(lw + q[0]), high: r3(lw + q[2]), basis: `${basis}에서 낙찰자가 하한율보다 ${fmt(q[1])}%p 높게 썼습니다` };
    else {
      // 과거 공고의 하한율 자료가 없으면 과거 낙찰률 분포 (지금 하한율 아래는 하한율로)
      const wr = h.map((x) => x.rate).filter((r) => r > 50 && r <= 110).sort((x, y) => x - y);
      let qq: [number, number, number] | undefined;
      if (wr.length >= 3) { qq = [quantile(wr, 0.25), quantile(wr, 0.5), quantile(wr, 0.75)]; basis = `과거 같은 사업 ${wr.length}건`; }
      else if (st?.rate && st.rate.n >= SIMILAR_USE) { qq = [st.rate.q[1], st.rate.q[2], st.rate.q[3]]; basis = `비슷한 공고 ${st.rate.n.toLocaleString()}건`; }
      if (qq) {
        const [a, b, c] = qq.map((v) => r3(Math.max(lw, v)));
        out.suggestRate = { value: b, low: a, high: c, basis: `${basis}의 낙찰률 중앙값 ${fmt(qq[1])}%${qq[1] < lw ? `가 이 공고 하한율보다 낮아 하한율로 맞췄습니다` : "입니다"}` };
      }
    }
  }

  // 예정가격 ÷ 기초금액
  const hp = h.filter((x) => x.plnprc > 0 && x.base > 0).map((x) => (x.plnprc / x.base) * 100).filter((r) => r > 90 && r < 110);
  if (hp.length >= 3) out.pre = { value: r3(median(hp)), basis: `과거 같은 사업 ${hp.length}건 중앙값` };
  else if (st?.pre && st.pre.n >= SIMILAR_USE) out.pre = { value: r3(st.pre.q[1]), basis: `비슷한 공고 ${st.pre.n.toLocaleString()}건 중앙값` };

  // 추이·연속 낙찰
  const dated = h.filter((x) => x.rate > 50 && x.rate <= 110).sort((x, y) => x.date.localeCompare(y.date));
  if (dated.length >= 3) {
    const first = dated[0], last = dated[dated.length - 1];
    const years = Math.max(1, Math.round((Date.parse(last.date) - Date.parse(first.date)) / (365 * 86400e3)));
    const d = last.rate - first.rate;
    out.trend = { first: first.rate, last: last.rate, years, text: Math.abs(d) < 0.3 ? "낙찰률이 거의 같게 유지됩니다" : d > 0 ? `낙찰률이 ${fmt(d, 2)}%p 올랐습니다` : `낙찰률이 ${fmt(-d, 2)}%p 내려갔습니다` };
  }
  if (all.length >= 2) {
    const c = new Map<string, number>();
    for (const x of all) if (x.winner) c.set(x.winner, (c.get(x.winner) ?? 0) + 1);
    const [name, count] = [...c].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (count >= 2) out.incumbent = { name, count, total: all.length };
  }
  // 비슷한 공고는 공고명 핵심어로 찾은 것 우선. 업무·금액대만 같은 넓은 묶음의 업체는 쓰지 않는다
  const likely = likelyBidders(all, rel ? { winners: rel.winners, ranked: rel.ranked } : a.similar && !a.similar.key.endsWith("|*") ? st : undefined);
  if (likely.length) out.likely = likely;
  if (a.parts) {
    const lp = a.parts
      .map((p) => ({ name: p.name, likely: likelyBidders(p.own, p.related ? { winners: p.related.winners, ranked: p.related.ranked } : undefined, 5) }))
      .filter((p) => p.likely.length);
    if (lp.length) out.likelyParts = lp;
  }
  return out;
}

export interface WinChance {
  /** 낙찰 가능성 범위 (%), 낮게·높게 */
  low: number;
  high: number;
  level: Level3;
  basis: string[];
  /** 통과 미달이라 0%일 때, 통과 기준을 채우면 받는 범위 */
  ifPassed?: { low: number; high: number };
}

/**
 * 낙찰 가능성. 공고마다 정해지는 예정가격 추첨·정성 평가를 미리 알 수 없어 한 숫자가 아니라 범위로 낸다.
 * - 적격심사: 통과하는 업체 중 낙찰하한율 바로 위 금액을 쓴 업체가 낙찰된다. 예정가격이 추첨으로 정해져 같은 투찰률대 업체끼리는
 *   추첨에 가까우므로 참가업체 수로 나눈 확률이 바탕이다. 투찰률이 과거 낙찰률보다 높을수록 그 비율만큼 낮춘다.
 * - 협상: 기술(정성) 평가가 순위를 정한다. 참가업체 수로 나눈 확률에 제안 준비 수준과 가격점수 비율을 곱한 범위다.
 */
export function winChance(input: {
  method: string;
  fc: Forecast;
  similar?: SimilarStat;
  history: PastAward[];
  bidRate: number;
  floor?: number;
  passed?: boolean;
  proposal?: "상" | "중" | "하";
  /** 협상: 가격점수 / 가격 배점 (0~1) */
  priceRatio?: number;
}): WinChance | undefined {
  const { fc } = input;
  if (!fc.bidders) return undefined;
  const m = methodCode(input.method);
  const [nLo, , nHi] = fc.bidders.q.map((n) => Math.max(1, n));
  const basis: string[] = [`예상 참가 ${fc.bidders.q[0] === fc.bidders.q[2] ? `${fc.bidders.q[1]}곳` : `${fc.bidders.q[0]}~${fc.bidders.q[2]}곳`} (${fc.bidders.basis})`];
  if (input.passed === false) {
    const p = winChance({ ...input, passed: undefined });
    return { low: 0, high: 0, level: "낮음", basis: [...basis, `예상 점수가 통과 기준에 못 미쳐 낙찰 대상이 아닙니다${p && p.high > 0 ? `. 통과 기준을 채우면 ${p.low === p.high ? `${p.low}%` : `${p.low}~${p.high}%`}입니다` : ""}`], ifPassed: p && { low: p.low, high: p.high } };
  }
  if (input.floor && input.bidRate < input.floor) return { low: 0, high: 0, level: "낮음", basis: [...basis, `투찰률이 낙찰하한율 ${input.floor}%보다 낮아 낙찰 대상이 아닙니다`] };
  let lo = 1 / nHi, hi = 1 / nLo;
  if (m === "N") {
    const f = input.proposal === "상" ? 1.6 : input.proposal === "하" ? 0.4 : 1;
    const p = input.priceRatio ?? 1;
    lo *= f * (0.6 + 0.4 * p); hi *= f * (0.6 + 0.4 * p);
    basis.push(`제안 준비 수준 '${input.proposal ?? "중"}'과 가격점수 ${Math.round(p * 100)}%를 반영했습니다. 기술평가(정성) 결과에 따라 달라집니다`);
  } else {
    // 과거 낙찰률 중 내 투찰률 이상인 비율: 내 투찰률이 낙찰자들보다 높으면 그만큼 순서에서 밀린다
    const hist = input.history.filter((x) => x.bidders !== 1);
    const rates = [...hist.map((x) => x.rate)].filter((r) => r > 50 && r <= 110).sort((a, b) => a - b);
    // 하한율이 해마다 바뀌므로(2026 기준 개정 등) 당시 하한율이 있으면 '하한율보다 얼마나 높게 썼는지'로 비교한다
    const gaps = input.floor ? hist.filter((x) => x.lwlt > 0 && x.rate >= x.lwlt && x.rate - x.lwlt < 10).map((x) => x.rate - x.lwlt) : [];
    const above = (r: number) => {
      if (gaps.length >= 3 && input.floor) { const g = r - input.floor; return gaps.filter((x) => x >= g - 1e-9).length / gaps.length; }
      if (rates.length >= 3) return rates.filter((x) => x >= r).length / rates.length;
      const q = input.similar?.rate?.q;
      if (!q) return 1;
      const pts: [number, number][] = [[q[0], 0.9], [q[1], 0.75], [q[2], 0.5], [q[3], 0.25], [q[4], 0.1]];
      if (r <= q[0]) return 1;
      if (r >= q[4]) return 0.05;
      for (let i = 1; i < pts.length; i++) if (r <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (r - x0)) / Math.max(1e-9, x1 - x0); }
      return 0.05;
    };
    const w = Math.max(0.02, above(input.bidRate));
    lo *= w; hi *= w;
    if (gaps.length >= 3) basis.push(`하한율보다 ${Math.round((input.bidRate - (input.floor ?? 0)) * 1000) / 1000}%p 높게 쓰면, 과거 같은 사업 낙찰자 중 그보다 높게 쓴 비율 ${Math.round(w * 100)}%`);
    else if (fc.winRate) basis.push(`투찰률 ${input.bidRate}%보다 높게 쓴 과거 낙찰자 비율 ${Math.round(w * 100)}% (${rates.length >= 3 ? "과거 같은 사업" : "비슷한 공고"})`);
    if (m === "Q") basis.push("적격심사는 예정가격 추첨에 따라 하한율 바로 위 업체가 정해져, 같은 투찰률대 업체끼리는 운의 몫이 큽니다");
  }
  if (fc.incumbent && fc.incumbent.count >= 3) { lo *= 0.8; hi *= 0.8; basis.push(`같은 업체(${fc.incumbent.name})가 ${fc.incumbent.total}건 중 ${fc.incumbent.count}건 낙찰해 기존 업체가 유리할 수 있습니다`); }
  // 1% 아래는 소수 둘째 자리까지 (참가업체가 수백 곳인 공사)
  const pct = (x: number) => Math.min(95, x < 0.01 ? Math.round(x * 10000) / 100 : Math.round(x * 1000) / 10);
  const low = pct(lo), high = Math.max(pct(hi), low);
  const mid = (low + high) / 2;
  const level: Level3 = mid >= 30 ? "높음" : mid >= 10 ? "보통" : "낮음";
  return { low, high, level, basis };
}
