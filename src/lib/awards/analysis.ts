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

/** 개찰 순위 한 칸: [업체명, 투찰률(%)] */
export type RankCell = [name: string, rate: number];

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
  /** 개찰 1~5위 평균 투찰률(%)과 표본 수. 낙찰자가 1위였던 비율 */
  ranks?: { mean: number[]; n: number; winnerFirst: number };
  /** 예정가격 ÷ 기초금액 (%) [25%, 50%, 75%] */
  pre?: { q: [number, number, number]; n: number };
  /** 최근 낙찰 예 (최대 5건): [공고번호, 공고명, 수요기관, 낙찰일, 낙찰금액, 낙찰률, 참가업체 수, 낙찰업체] */
  ex?: [string, string, string, string, number, number, number, string][];
}

/** 비슷한 공고 묶음 키: 업무|계약방법|금액대|분류. 분류는 c:세부품명번호, w:주공종, l:업종, * 전체 */
export const similarKey = (biz: string, m: MethodCode, band: string, dim: string) => `${biz}|${m}|${band}|${dim}`;
export interface SimilarIndexFile { v: 1; builtAt: string; from: string; to: string; groups: Record<string, SimilarStat> }
/** 비슷한 공고 통계를 만드는 기간(년) */
export const SIMILAR_YEARS = 3;
/** 이보다 적은 묶음은 통계를 내지 않는다 */
export const SIMILAR_MIN = 5;

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
    .replace(/[\s()\[\]{}<>「」『』【】〔〕·,.\-_/'"‘’“”]/g, "");
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
const bandLabel = (k: string) => BAND_KEYS.find((b) => b.key === k)?.label ?? "";
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

const KEY_MEMO = new WeakMap<AgencyRow[], string[]>();

/** 비슷한 공고 통계로 쓰려면 이만큼은 있어야 한다 */
const SIMILAR_USE = 10;

export function analyzeBid(t: AnalyzeTarget, agencyRows: AgencyRow[] | undefined, groups: Record<string, SimilarStat>, range: { from: string; to: string }): AwardAnalysis {
  const biz = t.bizType === "공사" || t.bizType === "물품" ? t.bizType : "용역";
  const key = titleKey(t.title);
  const posted = t.postedAt.slice(0, 10);
  const rows = agencyRows ?? [];
  // 같은 기관 공고를 여러 번 비교하므로 공고명 키를 한 번만 만든다
  let keys = KEY_MEMO.get(rows);
  if (!keys) { keys = rows.map((r) => titleKey(r[1])); KEY_MEMO.set(rows, keys); }
  const ks = keys;
  const hits = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[3] === biz && r[0] !== t.bidNtceNo && r[2] < posted)
    .map(({ r, i }) => ({ r, s: similarity(key, ks[i]) }))
    .filter((x) => x.s >= SAME_PROJECT);
  // 같은 공고번호(재입찰 등)는 한 번만
  const byNo = new Map<string, { r: AgencyRow; s: number }>();
  for (const h of hits) { const p = byNo.get(h.r[0]); if (!p || p.s < h.s) byNo.set(h.r[0], h); }
  const history = [...byNo.values()].sort((a, b) => b.r[2].localeCompare(a.r[2]) || b.s - a.s).slice(0, 10).map(({ r, s }) => toPast(r, s));

  // 전년도: 지금 공고일 기준 8~20개월 전 중 가장 비슷한 것 (같으면 1년에 가까운 것)
  const days = (d: string) => (Date.parse(posted) - Date.parse(d)) / 86400e3;
  const prior = history
    .filter((h) => days(h.date) >= 240 && days(h.date) <= 600)
    .sort((a, b) => b.similarity - a.similarity || Math.abs(days(a.date) - 365) - Math.abs(days(b.date) - 365))[0];

  let similar: AwardAnalysis["similar"];
  for (const c of similarCandidates(t)) {
    const st = groups[c.key];
    if (st && st.n >= SIMILAR_USE) { similar = { ...c, stat: st }; break; }
  }
  return { v: 1, builtAt: new Date().toISOString(), range, prior, history, similar };
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
}

const fmt = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);

/** 분석 결과에서 공고 하나의 경쟁·가격 예측값을 만든다 (입력값과 상관없는 부분) */
export function forecast(a: AwardAnalysis | null | undefined, bid: { contractMethod: string; lowerLimitRate?: number }, floor?: number): Forecast {
  if (!a) return {};
  const out: Forecast = {};
  const h = a.history;
  const st = a.similar?.stat;

  // 참가업체 수: 같은 사업 이력이 2건 이상이면 그 분포, 아니면 비슷한 공고 분포. 전년도 값이 있으면 근거에 같이 적는다
  const hb = h.map((x) => x.bidders).filter((n) => n > 0).sort((x, y) => x - y);
  if (hb.length >= 2) {
    out.bidders = { q: [Math.round(quantile(hb, 0.25)), Math.round(quantile(hb, 0.5)), Math.round(quantile(hb, 0.75))], basis: `과거 같은 사업 ${hb.length}건` };
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
  if (hr.length >= 2) out.winRate = { value: r3(median(hr)), basis: `과거 같은 사업 ${hr.length}건 중앙값` };
  else if (a.prior?.rate) out.winRate = { value: a.prior.rate, basis: "전년도 같은 사업" };
  else if (st?.rate) out.winRate = { value: r3(st.rate.q[2]), basis: `비슷한 공고 ${st.rate.n.toLocaleString()}건 중앙값` };

  // 협상: 개찰 1위(가장 낮은) 투찰률. 같은 사업 이력 > 전년도 > 비슷한 공고 > 낙찰률
  const m = methodCode(bid.contractMethod);
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
  if (h.length >= 2) {
    const c = new Map<string, number>();
    for (const x of h) if (x.winner) c.set(x.winner, (c.get(x.winner) ?? 0) + 1);
    const [name, count] = [...c].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (count >= 2) out.incumbent = { name, count, total: h.length };
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
    const rates = [...input.history.map((x) => x.rate)].filter((r) => r > 50 && r <= 110).sort((a, b) => a - b);
    // 하한율이 해마다 바뀌므로(2026 기준 개정 등) 당시 하한율이 있으면 '하한율보다 얼마나 높게 썼는지'로 비교한다
    const gaps = input.floor ? input.history.filter((x) => x.lwlt > 0 && x.rate >= x.lwlt && x.rate - x.lwlt < 10).map((x) => x.rate - x.lwlt) : [];
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
