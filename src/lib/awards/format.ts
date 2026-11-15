/**
 * 나라장터 낙찰 5년치 저장소(Cloudflare R2 버킷 bidmate-awards)의 파일 형식.
 * 수집(scripts/awards/collect.ts), 중계 서버(worker/corp-lookup), 화면이 같이 쓴다. Node 전용 모듈은 쓰지 않는다.
 *
 * R2 안의 파일
 * - raw/{kind}/{op}/{YYYYMMDD}.json.gz : 한 주(월~일) 치 원자료에서 필요한 열만. kind = award(낙찰) · notice(공고) · rgn(참가가능지역) · lic(업종제한)
 * - shards/{0000~9999}.json.gz          : 낙찰 건을 공고 정보와 합친 행. 낙찰자 사업자번호 6~9번째 자리(일련번호 부분)로 나눠 크기를 고르게 했다.
 *                                          파일 하나를 작게(약 200건) 해 중계 서버가 무료 CPU 한도(요청당 10ms) 안에서 읽게 한다
 * - stats/rates.json                     : 업무·계약방법·금액대·업종별 낙찰률 통계 (최근 1년, 전체 기간)
 * - stats/agency.json.gz                 : 수요기관별 적격심사·협상계약 낙찰률 목록 (같은 기관의 과거 유사 공고 찾기용)
 * - stats/meta.json                      : 수집 범위·완료 여부·용량
 * - manifest.json                        : 수집 상태 (어떤 주를 언제 받았는지, 파일별 크기)
 */

/** 저장 기간(년). 2026-11-15 사용자 요청으로 3년 → 5년 */
export const AWARD_YEARS = 5;
/** 나라장터 유사 실적 자동 조회 기간(년). 저장 기간과 같은 최근 5년 (2026-11-15 사용자 요청). 평가표 기간이 더 짧으면 그 기간만 */
export const PERF_DEFAULT_YEARS = 5;
/** 공고는 낙찰보다 먼저 나오므로 낙찰 기간보다 이만큼 앞선 주부터 받는다 */
export const NOTICE_LEAD_WEEKS = 13;
export const BUCKET = "bidmate-awards";

export type AwardBiz = "용역" | "공사" | "물품";
export const OPS: Record<AwardBiz, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };
export const BIZ_OF_OP: Record<string, AwardBiz> = { Servc: "용역", Cnstwk: "공사", Thng: "물품" };

/** 샤드 파일의 열 순서 */
export const SHARD_COLS = [
  "bizno", "winner", "no", "ord", "biz", "title", "agency", "amount", "rate", "date", "bidders",
  "method", "price", "clsNo", "clsNm", "mid", "lrg", "work", "region", "lic",
] as const;
export type ShardRow = [
  bizno: string, winner: string, no: string, ord: string, biz: AwardBiz, title: string, agency: string,
  /** 낙찰금액(원) */ amount: number, /** 낙찰률(%), 없으면 0 */ rate: number, /** 최종낙찰일 YYYY-MM-DD */ date: string,
  /** 참가업체 수 */ bidders: number, /** 계약방법 (일반경쟁 등 + 낙찰방법) */ method: string, /** 추정가격(원) */ price: number,
  clsNo: string, clsNm: string, mid: string, lrg: string, /** 공사 주공종 */ work: string,
  /** 참가가능지역 (여러 곳이면 쉼표) */ region: string, /** 업종제한 (여러 곳이면 쉼표) */ lic: string,
];

export interface ShardFile { v: 1; cols: readonly string[]; rows: ShardRow[] }

/** 사업자번호 → 샤드 번호 (0000~9999). 앞 3자리(세무서)는 지역에 몰려 크기가 고르지 않아 일련번호 부분을 쓴다 */
export const shardOf = (bizno: string) => bizno.replace(/\D/g, "").padStart(10, "0").slice(5, 9);

export interface AwardMeta {
  builtAt: string;
  /** 낙찰 자료 범위 YYYY-MM-DD (최종낙찰 등록일 기준 주) */
  from: string;
  to: string;
  /** 업무마다 받은 낙찰 주 수 / 받아야 할 주 수 (가장 적은 업무 기준) */
  weeks: number;
  totalWeeks: number;
  /** 낙찰·공고·지역·업종 자료를 저장 기간을 모두 받았는지 */
  complete: boolean;
  rows: number;
  /** R2에 올린 파일 크기 합 (바이트) */
  bytes: number;
}

/** 이 기간(YYYY-MM-DD 이후)의 자료가 다 있으면 true: 마지막으로 받은 범위가 그 날짜를 덮는지 본다 */
export const metaCovers = (m: AwardMeta | null | undefined, since: string) =>
  !!m && (m.complete || (m.from <= since && m.weeks > 0));

/* ---------- 주 단위 ---------- */

export const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
export const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const parse = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));

/** 그 날이 속한 주의 월요일 (YYYYMMDD) */
export function mondayOf(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return ymd(t);
}

export const addDays = (s: string, n: number) => ymd(new Date(parse(s).getTime() + n * 86400e3));

/** from 주부터 to 주까지 월요일 목록 (YYYYMMDD) */
export function weeksBetween(fromMonday: string, toMonday: string): string[] {
  const out: string[] = [];
  for (let w = fromMonday; w <= toMonday; w = addDays(w, 7)) out.push(w);
  return out;
}

/** 오늘(KST) 기준 낙찰 수집 첫 주: AWARD_YEARS년 전 같은 날이 속한 주 */
export function awardStartWeek(todayKst: Date, years = AWARD_YEARS): string {
  const d = new Date(todayKst);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return mondayOf(d);
}

export const kstNow = () => new Date(Date.now() + 9 * 3600e3);

/* ---------- 계약방법 ---------- */

export type RateMethod = "적격심사" | "협상에 의한 계약";
export function rateMethodOf(method?: string): RateMethod | undefined {
  if (!method) return undefined;
  if (/협상/.test(method)) return "협상에 의한 계약";
  if (/적격/.test(method)) return "적격심사";
  return undefined;
}

/** 업종제한 문자열의 첫 업종명 ("의료기기판매업/5312, ..." → "의료기기판매업") */
export const firstLicense = (lic?: string) => (lic ?? "").split(/\s*,\s*/)[0]?.replace(/\/\d+$/, "").trim() ?? "";
