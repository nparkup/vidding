/**
 * 업종별 분석: 나라장터 10년치 낙찰을 공고 검색과 같은 업종(src/lib/types.ts CATEGORY_GROUPS)으로 나눠
 * 연도별 발주 규모, 낙찰률·참가업체 수 추이, 업무·계약방법별 낙찰률, 자주 낙찰받은 업체, 주요 발주기관, 사정율 분포, 최근 낙찰을 만든다.
 * 낙찰 수집(scripts/awards/collect.ts buildIndexes)이 만들어 R2 stats/industry.json.gz 로 올리고,
 * 빌드(scripts/awards/forBuild.ts)가 받아 /industry-data/{id}.json 으로 낸다. 화면은 /analysis/industry.
 * 이 파일은 Node 전용 모듈을 쓰지 않는다.
 */
import { CATEGORIES, type ServiceCategory } from "../types";
import { quantile, type AgencyRow } from "./analysis";
import { agencySummary, type AgencySummary } from "./agency";

export interface IndustrySummary extends Omit<AgencySummary, "v"> {
  v: 1;
  name: ServiceCategory;
  /** 연도별 [연도, 적격심사 낙찰률 가운데 값(%, 없으면 0), 참가업체 수 가운데 값, 적격심사 표본 수] (오래된 순) */
  trend: [number, number, number, number][];
  /** 최근 4년 낙찰이 많은 수요기관 [이름, 건수, 낙찰금액 합(원)] (최대 15곳) */
  agencies: [string, number, number][];
  /** 최근 4년 낙찰한 업체 수 (서로 다른 업체) */
  firms: number;
  /** recent[i]의 수요기관 */
  recentAgency: string[];
}

/** 업종 → 파일 id (CATEGORIES 순서 번호, 두 자리) */
export const industryId = (name: string) => String(CATEGORIES.indexOf(name as ServiceCategory)).padStart(2, "0");
export const industryOf = (id: string): ServiceCategory | undefined => CATEGORIES[Number(id)];

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * 업종 하나의 분석. rows는 그 업종의 낙찰(공고 1건당 1줄), ags는 rows와 같은 순서의 수요기관 이름.
 * 기본 통계는 발주처 분석(agencySummary)과 같은 방식으로 만든다
 */
export function industrySummary(name: ServiceCategory, rows: AgencyRow[], ags: string[], today: string): IndustrySummary | undefined {
  const base = agencySummary(name, rows, today);
  if (!base) return undefined;
  const from4 = `${Number(today.slice(0, 4)) - 4}${today.slice(4)}`;

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
      if (a) { const x = ag.get(a) ?? [0, 0]; x[0]++; x[1] += r[4] > 100 ? r[4] : 0; ag.set(a, x); }
      if (r[12]) firms.add(r[12]);
    }
  });
  const trend = [...ys.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => {
    const rs = v.rates.sort((a, b) => a - b);
    const bs = v.bids.sort((a, b) => a - b);
    return [y, rs.length >= 5 ? r3(quantile(rs, 0.5)) : 0, bs.length ? Math.round(quantile(bs, 0.5)) : 0, rs.length] as [number, number, number, number];
  });
  const agencies = [...ag.entries()].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1]).slice(0, 15).map(([n, [c, a]]) => [n, c, Math.round(a)] as [string, number, number]);

  // base.recent 는 같은 공고번호를 한 번만 남긴 최근 20건 (agencySummary와 같은 순서로 다시 골라 수요기관을 붙인다)
  const want = new Set(base.recent.map((x) => x[0]));
  const byNo = new Map<string, string>();
  rows.forEach((r, i) => { if (want.has(r[0]) && !byNo.has(r[0])) byNo.set(r[0], ags[i]); });
  return { ...base, v: 1, name, trend, agencies, firms: firms.size, recentAgency: base.recent.map((x) => byNo.get(x[0]) ?? "") };
}

/** 업종 목록(/industry-data/index.json) 한 줄: [업종, id, 10년 낙찰 건수, 최근 4년 낙찰금액, 최근 해 적격심사 낙찰률 가운데 값, 최근 해 참가업체 가운데 값] */
export type IndustryIndexRow = [string, string, number, number, number, number];

export function industryIndexRow(s: IndustrySummary): IndustryIndexRow {
  const last = [...s.trend].reverse().find((t) => t[1] > 0 || t[2] > 0);
  return [s.name, industryId(s.name), s.n, s.groups.reduce((a, g) => a + g.amount, 0), last?.[1] ?? 0, last?.[2] ?? 0];
}
