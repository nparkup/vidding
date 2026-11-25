/**
 * 발주처 분석의 업종·기간 선택용 자료: 수요기관 한 곳의 낙찰을 줄마다 몇 개 숫자로 줄여 /agency-cut/{agencyId}.json 으로 낸다.
 * 배포 때 정적 빌드 뒤 scripts/awards/agencyCuts.ts 가 R2 수요기관 색인(idx/agency)에서 만들고,
 * 화면(src/components/analysis/AgencyExplorer.tsx)이 고른 업종·기간으로 다시 센다.
 * 이 파일은 Node 전용 모듈을 쓰지 않는다.
 */
import { quantile, type AgencyRow, type MethodCode } from "./analysis";
import { recentFrom, type AgencyGroupStat } from "./agency";
import type { FirmStat } from "./industry";

const BIZ = ["공사", "용역", "물품", "외자"] as const;
const METHODS: MethodCode[] = ["Q", "N", "L", "O"];

/** 한 줄: [낙찰일 YYYYMMDD, 업종 순번(-1 모름), 업무 순번, 계약방법 순번, 낙찰금액(원), 낙찰률×1000, 참가업체 수, 낙찰업체 순번(-1 없음), 낙찰하한율×1000] */
export type CutRow = [number, number, number, number, number, number, number, number, number];
export interface AgencyCutFile { v: 1; firms: string[]; rows: CutRow[] }

/** 수요기관 색인 줄 → 화면용 줄 (같은 공고번호는 최근 것만) */
export function agencyCut(rows: AgencyRow[]): AgencyCutFile {
  const seen = new Set<string>();
  const firms: string[] = [];
  const fi = new Map<string, number>();
  const out: CutRow[] = [];
  for (const r of [...rows].sort((a, b) => b[2].localeCompare(a[2]))) {
    if (seen.has(r[0])) continue;
    seen.add(r[0]);
    let w = -1;
    if (r[12]) { w = fi.get(r[12]) ?? -1; if (w < 0) { w = firms.length; firms.push(r[12]); fi.set(r[12], w); } }
    out.push([Number(r[2].replace(/-/g, "")), r[15] ?? -1, Math.max(0, BIZ.indexOf(r[3] as (typeof BIZ)[number])), Math.max(0, METHODS.indexOf(r[7])), Math.round(r[4]), Math.round(r[5] * 1000), r[6], w, Math.round(r[11] * 1000)]);
  }
  return { v: 1, firms, rows: out };
}

export interface CutStats {
  n: number;
  amount: number;
  firms: number;
  /** 참가 1곳 낙찰 비율 0~1 */
  single: number;
  winners: FirmStat[];
  groups: AgencyGroupStat[];
  /** 연도별 [연도, 건수, 낙찰금액, 평균 참가업체] (업종만 거른 값, 기간과 무관) */
  years: [number, number, number, number][];
}

const ymd = (d: number) => `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** cat: 업종 순번(-1이면 전체), period: 최근 기간("3y") | "all" | 연도 */
export function cutStats(f: AgencyCutFile, cat: number, period: string, today: string): CutStats {
  const from4 = Number(recentFrom(today).replace(/-/g, ""));
  const byCat = f.rows.filter((r) => cat < 0 || r[1] === cat);
  const inPeriod = (d: number) => (/^\d+y$/.test(period) ? d >= from4 : period === "all" ? true : Math.floor(d / 10000) === Number(period));
  const xs = byCat.filter((r) => inPeriod(r[0]));

  const ys = new Map<number, [number, number, number, number]>();
  for (const r of byCat) {
    const y = Math.floor(r[0] / 10000);
    const v = ys.get(y) ?? [0, 0, 0, 0];
    v[0]++; v[1] += r[4] > 100 ? r[4] : 0;
    if (r[6] > 0) { v[2] += r[6]; v[3]++; }
    ys.set(y, v);
  }
  const years = [...ys.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => [y, v[0], Math.round(v[1]), v[3] ? Math.round((v[2] / v[3]) * 10) / 10 : 0] as [number, number, number, number]);

  const win = new Map<number, [number, number, number]>();
  let amount = 0, withB = 0, single = 0;
  const g = new Map<string, CutRow[]>();
  for (const r of xs) {
    const amt = r[4] > 100 ? r[4] : 0;
    amount += amt;
    if (r[6] > 0) { withB++; if (r[6] === 1) single++; }
    if (r[7] >= 0) { const v = win.get(r[7]) ?? [0, 0, 0]; v[0]++; v[1] += amt; if (r[0] > v[2]) v[2] = r[0]; win.set(r[7], v); }
    const k = `${r[2]}|${r[3]}`;
    (g.get(k) ?? g.set(k, []).get(k)!).push(r);
  }
  const sorted = (v: number[]) => v.sort((a, b) => a - b);
  const groups: AgencyGroupStat[] = [...g.entries()].map(([k, rs]) => {
    const [bi, mi] = k.split("|").map(Number);
    const biz = BIZ[bi], method = METHODS[mi];
    const rates = sorted(rs.map((r) => r[5] / 1000).filter((v) => v > 0 && v <= 110));
    const gaps = sorted(rs.filter((r) => r[5] > 0 && r[8] > 0).map((r) => (r[5] - r[8]) / 1000));
    const bids = sorted(rs.map((r) => r[6]).filter((v) => v > 0));
    return {
      biz, method, label: `${biz} ${method}`, n: rs.length,
      rate: rates.length >= 3 ? [r3(quantile(rates, 0.25)), r3(quantile(rates, 0.5)), r3(quantile(rates, 0.75))] as [number, number, number] : undefined,
      gap: gaps.length >= 3 ? r3(quantile(gaps, 0.5)) : undefined,
      bidders: bids.length ? Math.round(quantile(bids, 0.5)) : 0,
      amount: Math.round(rs.reduce((a, r) => a + (r[4] > 100 ? r[4] : 0), 0)),
    };
  }).sort((a, b) => b.n - a.n);
  // 화면이 더 보기·검색을 하도록 낙찰받은 업체 전부 (건수 순)
  const winners = [...win.entries()].map(([i, [c, a, d]]) => [f.firms[i], c, Math.round(a), ymd(d)] as FirmStat).sort((a, b) => b[1] - a[1] || b[2] - a[2]);
  return { n: xs.length, amount: Math.round(amount), firms: win.size, single: withB ? single / withB : 0, winners, groups, years };
}

/** 이 기관 낙찰에 있는 업종 순번과 건수 (많은 순) */
export function cutCats(f: AgencyCutFile): [number, number][] {
  const c = new Map<number, number>();
  for (const r of f.rows) if (r[1] >= 0) c.set(r[1], (c.get(r[1]) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}
