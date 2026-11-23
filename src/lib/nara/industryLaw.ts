import "server-only";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";
import { call } from "./client";
import type { BidQual, IndustryLaw } from "../eligibility";

/**
 * 조달청_나라장터 업종 및 근거법규서비스 (IndstrytyBaseLawrgltInfoService, getIndstrytyBaseLawrgltInfoList).
 * 조건 없이 부르면 지금 유효한 업종 전체(2026-11-23 실측 2,916개)가 온다. 항목: 업종코드·업종명·업종분류·근거법령명·조항·포함면허.
 * 포함면허(inclsnLcns)는 "[순번^포함되는 업종코드^이름^포함하는 업종코드^이름],..." 꼴이다.
 *   예) 토목건축공사업(0003): [1^0002^건축공사업^0003^토목건축공사업],[2^0001^토목공사업^0003^토목건축공사업]
 *   → 토목건축공사업을 가진 업체는 건축공사업·토목공사업 제한 공고에도 참가할 수 있다.
 * 같은 쌍이 양쪽 업종 행에 모두 실리므로 한 번만 센다. 근거법령 URL·관련규정 칸은 실제 응답에서 비어 있다.
 * 법령 개정이 드물어 하루 한 번만 새로 받는다 (.cache/nuri/industry-law.json).
 */
const PATH = "/ao/IndstrytyBaseLawrgltInfoService";
const OP = "getIndstrytyBaseLawrgltInfoList";
const ROWS = 999;
const CACHE = ".cache/nuri/industry-law.json";

export interface IndustryLawTable {
  /** 업종코드 → 업종명·근거법령 */
  laws: Record<string, IndustryLaw & { industry: string; group?: string }>;
  /** 포함되는 업종코드 → 그 업종을 포함하는 업종 목록 */
  includedBy: Record<string, { code: string; name: string }[]>;
}

type Item = Record<string, string | undefined>;

/** "[1^0002^건축공사업^0003^토목건축공사업],[...]" → [{ inner, outer }] */
export function parseInclusions(s?: string): { inner: { code: string; name: string }; outer: { code: string; name: string } }[] {
  if (!s?.trim()) return [];
  return (s.match(/\[[^\]]+\]/g) ?? []).flatMap((part) => {
    const f = part.slice(1, -1).split("^");
    if (f.length < 5 || !/^\d{4}$/.test(f[1]) || !/^\d{4}$/.test(f[3]) || f[1] === f[3]) return [];
    return [{ inner: { code: f[1], name: f[2].trim() }, outer: { code: f[3], name: f[4].trim() } }];
  });
}

export function buildLawTable(items: Item[]): IndustryLawTable {
  const laws: IndustryLawTable["laws"] = {};
  const includedBy: IndustryLawTable["includedBy"] = {};
  for (const it of items) {
    const code = it.indstrytyCd?.trim();
    if (!code || it.indstrytyUseYn === "N") continue;
    laws[code] = {
      industry: it.indstrytyNm?.trim() ?? "",
      group: it.indstrytyClsfcNm?.trim() || undefined,
      law: it.baseLawordNm?.trim() || undefined,
      clause: it.baseLawordArtclClauseNm?.trim() || undefined,
    };
    for (const { inner, outer } of parseInclusions(it.inclsnLcns)) {
      const xs = (includedBy[inner.code] ??= []);
      if (!xs.some((x) => x.code === outer.code)) xs.push(outer);
    }
  }
  return { laws, includedBy };
}

export async function fetchIndustryLaws(): Promise<IndustryLawTable> {
  try {
    if (existsSync(CACHE) && Date.now() - statSync(CACHE).mtimeMs < 20 * 3600e3) return JSON.parse(readFileSync(CACHE, "utf8"));
  } catch { /* 캐시가 깨졌으면 새로 받는다 */ }
  const first = await call(PATH, OP, { numOfRows: String(ROWS), pageNo: "1" });
  const items = [...first.items] as Item[];
  for (let p = 2; p <= Math.ceil(first.total / ROWS); p++) items.push(...((await call(PATH, OP, { numOfRows: String(ROWS), pageNo: String(p) })).items as Item[]));
  const table = buildLawTable(items);
  if (Object.keys(table.laws).length < 500) throw new Error(`업종이 ${Object.keys(table.laws).length}개뿐입니다`);
  try { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify(table)); } catch { /* 캐시는 없어도 된다 */ }
  return table;
}

/**
 * 공고 참가자격의 제한 업종마다 근거법령을 붙이고, 그 업종을 포함하는 업종(포함면허)을 허용업종에 더한다.
 * 공고가 직접 적은 허용업종은 그대로 두고, 더한 것은 via: "포함" 으로 표시해 판정 문구에서 구분한다.
 */
export function applyIndustryLaws(quals: Record<string, BidQual>, t: IndustryLawTable): { reqs: number; withLaw: number; added: number } {
  let reqs = 0, withLaw = 0, added = 0;
  for (const q of Object.values(quals)) {
    for (const g of q.licenseGroups ?? []) {
      for (const r of g) {
        reqs++;
        const law = r.code ? t.laws[r.code] : undefined;
        if (law?.law) { r.law = { law: law.law, clause: law.clause }; withLaw++; }
        if (!r.name && law?.industry) r.name = law.industry;
        for (const o of r.code ? t.includedBy[r.code] ?? [] : []) {
          if (o.code === r.code || r.alt.some((a) => a.code === o.code)) continue;
          r.alt.push({ ...o, via: "포함" });
          added++;
        }
      }
    }
  }
  return { reqs, withLaw, added };
}
