/**
 * 투찰가능업종(면허) 이름 정규화·매칭.
 * 나라장터 원문은 가운뎃점(ㆍ·.)·공백 표기가 제각각이고, 괄호 안에 쉼표가 들어간 업종명도 있다.
 */

/** 예전 이름·줄임 표기 → 현재 표기 */
const ALIASES: Record<string, string> = {
  "시설경비업무": "시설경비업",
  "조경식재공사업": "조경식재·시설물공사업",
  "소프트웨어사업자(컴퓨터관련서비스사업)": "소프트웨어사업자",
};

export function normalizeLicense(name: string): string {
  const n = name
    .trim()
    .replace(/[ㆍ・･]/g, "·")
    .replace(/(\S)\.(\S)/g, "$1·$2")
    .replace(/\s+/g, " ");
  return ALIASES[n] ?? n;
}

/** "A,B(x,y),C" → ["A", "B(x,y)", "C"] (괄호 안 쉼표는 나누지 않음), 정규화·중복 제거 */
export function splitLicenses(raw?: string): string[] {
  if (!raw) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "(" || ch === "（") depth++;
    if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return [...new Set(out.map(normalizeLicense).filter(Boolean))];
}

/** 고객 면허 have 로 공고 업종 need 에 참가할 수 있는가. 상위 업종명은 괄호 세부분야까지 포함한다 */
export function licenseMatches(have: string, need: string): boolean {
  const h = normalizeLicense(have);
  const n = normalizeLicense(need);
  return n === h || n.startsWith(`${h}(`);
}

export function hasAnyLicense(have: string[], need: string[]): boolean {
  return need.some((n) => have.some((h) => licenseMatches(h, n)));
}
