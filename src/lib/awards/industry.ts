/**
 * 업종별 분석: 나라장터 10년치 낙찰을 공고 검색과 같은 업종(src/lib/types.ts CATEGORY_GROUPS)으로 나눠
 * 연도별 발주 규모, 낙찰률·참가업체 수 추이, 업무·계약방법별 낙찰률, 자주 낙찰받은 업체, 주요 발주기관, 사정율 분포, 최근 낙찰을 만든다.
 * 낙찰 수집(scripts/awards/collect.ts buildIndexes)이 만들어 R2 stats/industry.json.gz 로 올리고,
 * 빌드(scripts/awards/forBuild.ts)가 받아 /industry-data/{id}.json 으로 낸다. 화면은 /analysis/industry.
 * 이 파일은 Node 전용 모듈을 쓰지 않는다.
 */
import { CATEGORIES, type ServiceCategory } from "../types";
import { quantile, type AgencyRow } from "./analysis";
import { RECENT_YEARS, STORE_WINNERS, agencySummary, isVagueAgency, recentFrom, topWinners, type AgencySummary } from "./agency";

export interface IndustrySummary extends Omit<AgencySummary, "v"> {
  v: 1;
  name: ServiceCategory;
  /** 연도별 [연도, 적격심사 낙찰률 가운데 값(%, 없으면 0), 참가업체 수 가운데 값, 적격심사 표본 수] (오래된 순) */
  trend: [number, number, number, number][];
  /** 최근 RECENT_YEARS년 낙찰이 많은 수요기관 [이름, 건수, 낙찰금액 합(원)] (최대 AGENCY_TOP곳) */
  agencies: [string, number, number][];
  /** agencies 기관마다 최근 RECENT_YEARS년 이 업종에서 낙찰받은 업체 (키: 수요기관 이름). firms = 서로 다른 업체 수, top = [업체명, 건수, 낙찰금액 합(원), 최근 낙찰일] (최대 AGENCY_WINNERS곳) */
  agencyWinners?: Record<string, { firms: number; top: [string, number, number, string][] }>;
  /** 최근 RECENT_YEARS년 낙찰한 업체 수 (서로 다른 업체) */
  firms: number;
  /** recent[i]의 수요기관 */
  recentAgency: string[];
}

/** 업종 → 파일 id (CATEGORIES 순서 번호, 두 자리) */
export const industryId = (name: string) => String(CATEGORIES.indexOf(name as ServiceCategory)).padStart(2, "0");
export const industryOf = (id: string): ServiceCategory | undefined => CATEGORIES[Number(id)];

/** 주요 발주기관 수, 기관마다 보여 줄 낙찰 업체 수 */
export const AGENCY_TOP = 30;
/** 발주기관별 낙찰 업체: 건수 상위·금액 상위 이만큼씩 담는다 (topWinners). 화면은 TOP_WINNERS곳 뒤 더 보기 */
export const AGENCY_WINNERS = 30;
/** 기간마다 따로 내는 낙찰 업체 목록(/industry-period/{id}-{기간}-firms.json): 건수 상위·금액 상위 이만큼씩 */
export const FIRM_LIST = 1000;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 업종 하나의 분석. rows는 그 업종의 낙찰(공고 1건당 1줄), ags는 rows와 같은 순서의 수요기관 이름.
 * 기본 통계는 발주처 분석(agencySummary)과 같은 방식으로 만든다
 */
export function industrySummary(name: ServiceCategory, rows: AgencyRow[], ags: string[], today: string): IndustrySummary | undefined {
  const base = agencySummary(name, rows, today);
  if (!base) return undefined;
  const from4 = recentFrom(today);

  const ys = new Map<number, { rates: number[]; bids: number[] }>();
  const ag = new Map<string, [number, number]>();
  const firms = new Set<string>();
  rows.forEach((r, i) => {
    const y = Number(r[2].slice(0, 4));
    const v = ys.get(y) ?? ys.set(y, { rates: [], bids: [] }).get(y)!;
    if (r[7] === "Q" && r[5] > 50 && r[5] <= 110) v.rates.push(r[5]);
    if (r[6] > 0) v.bids.push(r[6]);
    if (r[2] >= from4) {
      const a = ags[i];
      if (a && !isVagueAgency(a)) { const x = ag.get(a) ?? [0, 0]; x[0]++; x[1] += r[4] > 100 ? r[4] : 0; ag.set(a, x); }
      if (r[12]) firms.add(r[12]);
    }
  });
  const trend = [...ys.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => {
    const rs = v.rates.sort((a, b) => a - b);
    const bs = v.bids.sort((a, b) => a - b);
    return [y, rs.length >= 5 ? r3(quantile(rs, 0.5)) : 0, bs.length ? Math.round(quantile(bs, 0.5)) : 0, rs.length] as [number, number, number, number];
  });
  const agencies = [...ag.entries()].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, AGENCY_TOP).map(([n, [c, a]]) => [n, c, Math.round(a)] as [string, number, number]);

  // 주요 발주기관마다 이 업종에서 낙찰받은 업체
  const topAg = new Set(agencies.map((a) => a[0]));
  const aw = new Map<string, Map<string, [number, number, string]>>();
  rows.forEach((r, i) => {
    if (r[2] < from4 || !r[12] || !topAg.has(ags[i])) return;
    const m = aw.get(ags[i]) ?? aw.set(ags[i], new Map()).get(ags[i])!;
    const x = m.get(r[12]) ?? [0, 0, ""];
    x[0]++; x[1] += r[4] > 100 ? r[4] : 0; if (r[2] > x[2]) x[2] = r[2];
    m.set(r[12], x);
  });
  const agencyWinners: NonNullable<IndustrySummary["agencyWinners"]> = {};
  for (const [a, m] of aw) {
    agencyWinners[a] = {
      firms: m.size,
      top: topWinners([...m.entries()].map(([n, [c, amt, d]]) => [n, c, Math.round(amt), d] as [string, number, number, string]), AGENCY_WINNERS),
    };
  }

  // base.recent 는 같은 공고번호를 한 번만 남긴 최근 20건 (agencySummary와 같은 순서로 다시 골라 수요기관을 붙인다)
  const want = new Set(base.recent.map((x) => x[0]));
  const byNo = new Map<string, string>();
  rows.forEach((r, i) => { if (want.has(r[0]) && !byNo.has(r[0])) byNo.set(r[0], ags[i]); });
  return { ...base, v: 1, name, trend, agencies, agencyWinners, firms: firms.size, recentAgency: base.recent.map((x) => byNo.get(x[0]) ?? "") };
}

/* ---------- 기간별 낙찰 업체·발주기관 (최근 RECENT_YEARS년·전체·연도별) ---------- */

/** 기간: RECENT("3y") 최근 RECENT_YEARS년, "all" 저장 기간 전체, "2024" 같은 연도 */
export type IndustryPeriod = string;
/** 최근 기간 키 */
export const RECENT = `${RECENT_YEARS}y`;
/** [업체명, 낙찰 건수, 낙찰금액 합(원), 최근 낙찰일] */
export type FirmStat = [string, number, number, string];
/** 업종 안 발주기관 한 줄 (검색용): [수요기관, 낙찰 건수, 낙찰금액 합(원), 낙찰받은 업체 수, 많이 낙찰받은 업체 SEARCH_WINNERS곳] */
export type IndustryAgencyRow = [string, number, number, number, FirmStat[]];

/** 한 업종·한 기간 요약 (/industry-period/{id}-{기간}.json) */
export interface IndustryPeriodData {
  period: IndustryPeriod;
  /** 기간 안 낙찰 건수·낙찰금액 합·서로 다른 낙찰 업체 수·낙찰이 있는 발주기관 수 */
  n: number;
  amount: number;
  firms: number;
  agencyCount: number;
  /** 자주 낙찰받은 업체 (건수 상위·금액 상위 TOP_WINNERS곳씩 합친 것, 건수 순) */
  winners: FirmStat[];
  /** 낙찰이 많은 발주기관 [이름, 건수, 낙찰금액] (최대 AGENCY_TOP곳) */
  agencies: [string, number, number][];
  /** agencies 기관마다 낙찰받은 업체 */
  agencyWinners: Record<string, { firms: number; top: FirmStat[] }>;
}
/** 업종 하나의 기간별 자료 (R2 stats/industry-period/{id}.json.gz). list는 검색용 모든 발주기관 (/industry-period/{id}-{기간}-ag.json) */
export interface IndustryPeriodFile { v: 1; builtAt: string; name: string; periods: Record<IndustryPeriod, IndustryPeriodData & { list: IndustryAgencyRow[]; firmList?: FirmStat[] }> }

/** 검색 목록의 기관마다 담는 낙찰 업체 수 */
export const SEARCH_WINNERS = 5;

export function periodLabel(p: IndustryPeriod): string {
  const m = /^(\d+)y$/.exec(p);
  return m ? `최근 ${m[1]}년` : p === "all" ? "전체 기간" : `${p}년`;
}

type Acc = { n: number; amt: number; w: Map<string, [number, number, string]> };
const addFirm = (w: Map<string, [number, number, string]>, f: string, c: number, amt: number, d: string) => {
  const x = w.get(f) ?? [0, 0, ""];
  x[0] += c; x[1] += amt; if (d > x[2]) x[2] = d;
  w.set(f, x);
};
const topFirms = (w: Map<string, [number, number, string]>, k: number): FirmStat[] =>
  [...w.entries()].sort((x, y) => y[1][0] - x[1][0] || y[1][1] - x[1][1]).slice(0, k).map(([n, [c, a, d]]) => [n, c, Math.round(a), d]);

const VAGUE = "\u0000vague";

/** 업종 하나의 기간별 낙찰 업체·발주기관. rows·ags는 industrySummary와 같다 */
export function industryPeriods(name: ServiceCategory, rows: AgencyRow[], ags: string[], today: string): IndustryPeriodFile {
  const from4 = recentFrom(today);
  // 연도 → 기관 → 집계, 그리고 최근 RECENT_YEARS년 → 기관 → 집계
  const byYear = new Map<string, Map<string, Acc>>();
  const recent = new Map<string, Acc>();
  const add = (m: Map<string, Acc>, a: string, r: AgencyRow) => {
    const v = m.get(a) ?? m.set(a, { n: 0, amt: 0, w: new Map() }).get(a)!;
    const amt = r[4] > 100 ? r[4] : 0;
    v.n++; v.amt += amt;
    if (r[12]) addFirm(v.w, r[12], 1, amt, r[2]);
  };
  rows.forEach((r, i) => {
    // '각 수요기관' 같은 뭉뚱그린 표기는 합계·업체 집계에는 넣고 기관 목록에서만 뺀다
    const a = ags[i] && isVagueAgency(ags[i]) ? VAGUE : ags[i];
    if (!a) return;
    const y = r[2].slice(0, 4);
    add(byYear.get(y) ?? byYear.set(y, new Map()).get(y)!, a, r);
    if (r[2] >= from4) add(recent, a, r);
  });
  const merge = (ms: Map<string, Acc>[]) => {
    const out = new Map<string, Acc>();
    for (const m of ms) for (const [a, v] of m) {
      const o = out.get(a) ?? out.set(a, { n: 0, amt: 0, w: new Map() }).get(a)!;
      o.n += v.n; o.amt += v.amt;
      for (const [f, [c, amt, d]] of v.w) addFirm(o.w, f, c, amt, d);
    }
    return out;
  };
  const build = (period: string, m: Map<string, Acc>) => {
    const firmsAll = new Map<string, [number, number, string]>();
    let n = 0, amount = 0;
    for (const v of m.values()) { n += v.n; amount += v.amt; for (const [f, [c, a, d]] of v.w) addFirm(firmsAll, f, c, a, d); }
    const sorted = [...m.entries()].filter(([a]) => a !== VAGUE).sort((a, b) => b[1].n - a[1].n || b[1].amt - a[1].amt);
    const agencies = sorted.slice(0, AGENCY_TOP).map(([a, v]) => [a, v.n, Math.round(v.amt)] as [string, number, number]);
    const agencyWinners: IndustryPeriodData["agencyWinners"] = {};
    for (const [a, v] of sorted.slice(0, AGENCY_TOP)) agencyWinners[a] = { firms: v.w.size, top: topWinners(topFirms(v.w, v.w.size), AGENCY_WINNERS) };
    return {
      period, n, amount: Math.round(amount), firms: firmsAll.size, agencyCount: sorted.length,
      winners: topWinners(topFirms(firmsAll, firmsAll.size), STORE_WINNERS), agencies, agencyWinners,
      firmList: topWinners(topFirms(firmsAll, firmsAll.size), FIRM_LIST),
      list: sorted.map(([a, v]) => [a, v.n, Math.round(v.amt), v.w.size, topFirms(v.w, SEARCH_WINNERS)] as IndustryAgencyRow),
    };
  };
  const periods: IndustryPeriodFile["periods"] = {};
  periods[RECENT] = build(RECENT, recent);
  periods.all = build("all", merge([...byYear.values()]));
  for (const [y, m] of [...byYear.entries()].sort()) periods[y] = build(y, m);
  return { v: 1, builtAt: new Date().toISOString(), name, periods };
}

/** 업종 목록(/industry-data/index.json) 한 줄: [업종, id, 10년 낙찰 건수, 최근 RECENT_YEARS년 낙찰금액, 최근 해 적격심사 낙찰률 가운데 값, 최근 해 참가업체 가운데 값] */
export type IndustryIndexRow = [string, string, number, number, number, number];

export function industryIndexRow(s: IndustrySummary): IndustryIndexRow {
  const last = [...s.trend].reverse().find((t) => t[1] > 0 || t[2] > 0);
  return [s.name, industryId(s.name), s.n, s.groups.reduce((a, g) => a + g.amount, 0), last?.[1] ?? 0, last?.[2] ?? 0];
}
