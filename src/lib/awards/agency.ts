/**
 * 발주처(수요기관) 분석: 같은 수요기관의 10년치 낙찰(idx/agency)로 연도별 발주 규모, 업무·계약방법별 낙찰률·참가업체 수,
 * 자주 낙찰받은 업체, 사정율 분포, 최근 낙찰을 만든다.
 * 빌드(scripts/awards/forBuild.ts)가 지금 공고의 수요기관마다 만들어 /agency-data/{id}.json 으로 낸다. 화면은 /agencies.
 * 이 파일은 Node 전용 모듈을 쓰지 않는다.
 */
import { METHOD_NAME, quantile, type AgencyRow, type MethodCode } from "./analysis";
import { assessSamples, type AssessData } from "./assess";

/** 수요기관 이름 → 파일 id (8자리 16진수) */
export function agencyId(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  let h2 = 5381;
  for (let i = 0; i < name.length; i++) h2 = (Math.imul(h2, 33) ^ name.charCodeAt(i)) >>> 0;
  return ((h >>> 0).toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

export interface AgencyGroupStat {
  biz: string;
  method: MethodCode;
  label: string;
  n: number;
  /** 낙찰률 [25%, 50%, 75%] (있는 건만) */
  rate?: [number, number, number];
  /** 낙찰률 − 낙찰하한율 (%p) 가운데 값 */
  gap?: number;
  /** 참가업체 수 가운데 값 */
  bidders: number;
  /** 낙찰금액 합(원) */
  amount: number;
}

export interface AgencySummary {
  v: 1;
  name: string;
  builtAt: string;
  /** 낙찰일 범위 */
  from: string;
  to: string;
  n: number;
  /** 연도별 [연도, 건수, 낙찰금액 합(원), 참가업체 수 평균] (오래된 순) */
  years: [number, number, number, number][];
  /** 업무·계약방법별 (건수 많은 순, 최근 4년) */
  groups: AgencyGroupStat[];
  /** 최근 4년 자주 낙찰받은 업체 [업체명, 건수, 낙찰금액 합] (건수 상위·금액 상위 TOP_WINNERS곳씩 합친 것, 건수 순) */
  winners: [string, number, number][];
  /** 최근 4년 개찰 1~5위에 자주 든 업체 [업체명, 횟수] (낙찰 제외, 최대 10곳) */
  ranked: [string, number][];
  /** 1곳 단독 낙찰(참가 1곳) 비율 0~1, 최근 4년 */
  single: number;
  /** 사정율 표본 (업무 무관) */
  assess?: AssessData;
  /** 최근 낙찰 20건 [공고번호, 공고명, 낙찰일, 업무, 계약방법, 낙찰금액, 낙찰률, 참가업체 수, 낙찰업체] */
  recent: [string, string, string, string, MethodCode, number, number, number, string][];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** 자주 낙찰받은 업체 목록 길이 (발주처·업종별 분석 공통). 건수 순·금액 순 각각 이만큼 보여 준다 */
export const TOP_WINNERS = 20;

/**
 * 업체 집계 [이름, 건수, 금액, ...]에서 건수 상위 TOP_WINNERS곳과 금액 상위 TOP_WINNERS곳을 합쳐(겹치면 한 번) 건수 순으로 돌려준다.
 * 화면은 이 목록을 건수 순 또는 금액 순으로 다시 정렬해 TOP_WINNERS곳씩 보여 준다.
 */
export function topWinners<T extends [unknown, number, number, ...unknown[]]>(xs: T[], k = TOP_WINNERS): T[] {
  const byCount = [...xs].sort((a, b) => b[1] - a[1] || b[2] - a[2]);
  const keep = new Set(byCount.slice(0, k));
  for (const x of [...xs].sort((a, b) => b[2] - a[2] || b[1] - a[1]).slice(0, k)) keep.add(x);
  return byCount.filter((x) => keep.has(x));
}

export function agencySummary(name: string, rows: AgencyRow[], today: string): AgencySummary | undefined {
  // 같은 공고번호(재입찰 등)는 최근 것만
  const seen = new Set<string>();
  const xs = [...rows].sort((a, b) => b[2].localeCompare(a[2])).filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
  if (!xs.length) return undefined;
  const from4 = `${Number(today.slice(0, 4)) - 4}${today.slice(4)}`;
  const recent4 = xs.filter((r) => r[2] >= from4);

  const byYear = new Map<number, { n: number; amt: number; bid: number; bn: number }>();
  for (const r of xs) {
    const y = Number(r[2].slice(0, 4));
    const v = byYear.get(y) ?? byYear.set(y, { n: 0, amt: 0, bid: 0, bn: 0 }).get(y)!;
    v.n++; v.amt += r[4] > 100 ? r[4] : 0;
    if (r[6] > 0) { v.bid += r[6]; v.bn++; }
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => [y, v.n, Math.round(v.amt), v.bn ? Math.round((v.bid / v.bn) * 10) / 10 : 0] as [number, number, number, number]);

  const g = new Map<string, AgencyRow[]>();
  for (const r of recent4) { const k = `${r[3]}|${r[7]}`; (g.get(k) ?? g.set(k, []).get(k)!).push(r); }
  const sorted = (v: number[]) => v.sort((a, b) => a - b);
  const groups: AgencyGroupStat[] = [...g.entries()].map(([k, rs]) => {
    const [biz, method] = k.split("|") as [string, MethodCode];
    const rates = sorted(rs.map((r) => r[5]).filter((v) => v > 0 && v <= 110));
    const gaps = sorted(rs.filter((r) => r[5] > 0 && r[11] > 0).map((r) => r[5] - r[11]));
    const bids = sorted(rs.map((r) => r[6]).filter((v) => v > 0));
    return {
      biz, method, label: `${biz} ${METHOD_NAME[method]}`, n: rs.length,
      rate: rates.length >= 3 ? [r3(quantile(rates, 0.25)), r3(quantile(rates, 0.5)), r3(quantile(rates, 0.75))] as [number, number, number] : undefined,
      gap: gaps.length >= 3 ? r3(quantile(gaps, 0.5)) : undefined,
      bidders: bids.length ? Math.round(quantile(bids, 0.5)) : 0,
      amount: Math.round(rs.reduce((a, r) => a + (r[4] > 100 ? r[4] : 0), 0)),
    };
  }).sort((a, b) => b.n - a.n);

  const win = new Map<string, [number, number]>();
  const rk = new Map<string, number>();
  for (const r of recent4) {
    if (r[12]) { const v = win.get(r[12]) ?? [0, 0]; v[0]++; v[1] += r[4] > 100 ? r[4] : 0; win.set(r[12], v); }
    for (const [nm] of r[14] ?? []) if (nm && nm !== r[12]) rk.set(nm, (rk.get(nm) ?? 0) + 1);
  }
  const winners = topWinners([...win.entries()].map(([n, [c, a]]) => [n, c, Math.round(a)] as [string, number, number]));
  const ranked = [...rk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const withBidders = recent4.filter((r) => r[6] > 0);

  return {
    v: 1, name, builtAt: new Date().toISOString(), from: xs[xs.length - 1][2], to: xs[0][2], n: xs.length,
    years, groups, winners, ranked,
    single: withBidders.length ? Math.round((withBidders.filter((r) => r[6] === 1).length / withBidders.length) * 1000) / 1000 : 0,
    assess: assessSamples(xs, "", "", today, true),
    recent: xs.slice(0, 20).map((r) => [r[0], r[1], r[2], r[3], r[7], r[4], r[5], r[6], r[12]]),
  };
}
