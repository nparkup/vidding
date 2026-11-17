/**
 * 입찰 참가자격 1차 판정: 공고의 업종(면허)·참가지역 제한과 기업의 나라장터 등록 정보를 대조한다.
 *
 * 공고 쪽: 조달청 입찰공고정보서비스의 면허제한·참가가능지역 (빌드 때 수집, src/lib/nara/qualification.ts)
 *  - 면허제한은 그룹으로 온다. 나라장터 공고 상세의 "[토목공사업] 업종 또는 [지반조성·포장공사업과 철근·콘크리트공사업] 업종"처럼
 *    같은 그룹 안은 모두 보유해야 하고, 그룹끼리는 '또는'이다. 각 업종에는 대신 인정되는 허용업종이 붙는다.
 * 기업 쪽: 나라장터 사용자정보서비스의 등록 업종(코드)·소재지, 국세청 사업자 상태 (src/lib/corpLookup.ts)
 *
 * 원칙: 자동 판단이 틀리면 안 되므로 자료로 확실한 것만 '가능'·'불가'로 판정하고, 나머지는 '확인 필요'로 둔다.
 * 중소기업·직접생산·실적·등급 제한처럼 공고서 본문에만 있는 조건은 여기서 판단하지 않는다.
 */
import type { EvalBasis } from "./criteria";
import type { CorpLookup } from "./corpLookup";

export interface LicenseReq {
  name: string;
  code: string;
  /** 이 업종 대신 인정되는 허용업종 */
  alt: { name: string; code: string }[];
}

export interface BidQual {
  /** 업종 제한 여부. null 이면 자료가 없어 모른다 */
  licenseLimited: boolean | null;
  /** 면허제한: 바깥 배열은 '또는', 안쪽 배열은 '모두 보유' */
  licenseGroups: LicenseReq[][];
  /** 참가지역 제한 여부. null 이면 자료가 없어 모른다 */
  regionLimited: boolean | null;
  /** 참가가능지역 원문 (시·도 또는 시·군·구) */
  regions: string[];
  /** 지역제한 판단 기준: 본사소재지 / 본사또는참여지사소재지 */
  regionBasis?: string;
  /** 입찰참가자격 등록 마감 (원문, 예: 2026-11-18 18:00) */
  registerBy?: string;
  /** 평가 기준을 고르는 공고 값 (낙찰방법 세부, 낙찰하한율, 추정가격, 협상 배점 비율) */
  basis?: EvalBasis;
}

export type Verdict = "가능" | "불가" | "확인 필요";

export interface Check {
  label: string;
  verdict: Verdict;
  detail: string;
}

export interface Eligibility {
  verdict: Verdict;
  checks: Check[];
}

/* ---------- 지역 ---------- */

/** 예전 시·도 이름 → 현재 나라장터 표기 */
const SIDO_ALIASES: [RegExp, string][] = [
  [/^(전라북도|전북)$/, "전북특별자치도"],
  [/^(강원도|강원)$/, "강원특별자치도"],
  [/^(제주도|제주|제주특별자치도)$/, "제주특별자치도"],
  [/^(광주광역시|광주|전라남도|전남)$/, "전남광주통합특별시"],
];

/** "전북특별자치도 전주시 완산구" → ["전북특별자치도", "전주시", "완산구"] */
export function regionTokens(s: string): string[] {
  const t = s.replace(/[[\]]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return [];
  const hit = SIDO_ALIASES.find(([re]) => re.test(t[0]));
  if (hit) t[0] = hit[1];
  return t;
}

type RegionMatch = "match" | "partial" | "none";

/** 기업 소재지가 참가가능지역 하나에 들어가는지. partial = 시·도는 같지만 공고 지역이 기업 소재지보다 좁아 판단할 수 없음 */
export function matchRegion(corpRegion: string, bidRegion: string): RegionMatch {
  const c = regionTokens(corpRegion);
  const b = regionTokens(bidRegion);
  if (!c.length || !b.length) return "none";
  for (let i = 0; i < b.length; i++) {
    if (i >= c.length) return "partial";
    if (c[i] !== b[i]) return "none";
  }
  return "match";
}

/* ---------- 업종 ---------- */

const fmtReq = (r: LicenseReq) => `${r.name}${r.code ? `(${r.code})` : ""}`;

/** "[토목공사업(0001)] 또는 [지반조성·포장공사업(4989)과 철근·콘크리트공사업(4994)]" */
export function describeGroups(groups: LicenseReq[][]): string {
  return groups.map((g) => `[${g.map(fmtReq).join("과 ")}]`).join(" 또는 ");
}

interface HeldIndustry { name: string; code: string; expiresAt?: string }

function satisfies(req: LicenseReq, held: Map<string, HeldIndustry>): HeldIndustry | undefined {
  if (req.code && held.has(req.code)) return held.get(req.code);
  for (const a of req.alt) if (a.code && held.has(a.code)) return held.get(a.code);
  return undefined;
}

/* ---------- 판정 ---------- */

const worst = (vs: Verdict[]): Verdict => (vs.includes("불가") ? "불가" : vs.includes("확인 필요") ? "확인 필요" : "가능");

export function judgeEligibility(q: BidQual | undefined, corp: CorpLookup, bizType?: string, now = new Date()): Eligibility {
  const checks: Check[] = [];
  const { nts, nara, errors } = corp;
  const by = q?.registerBy ? ` 입찰참가자격 등록 마감(${q.registerBy})까지` : " 입찰참가자격 등록 마감 전까지";

  // 1. 사업자 상태 (국세청)
  if (nts) {
    if (!nts.registered) checks.push({ label: "사업자 상태", verdict: "불가", detail: "국세청에 등록되지 않은 사업자등록번호입니다." });
    else if (nts.state === "폐업자") checks.push({ label: "사업자 상태", verdict: "불가", detail: `폐업한 사업자입니다${nts.closedAt ? ` (폐업일 ${nts.closedAt})` : ""}.` });
    else if (nts.state === "계속사업자") checks.push({ label: "사업자 상태", verdict: "가능", detail: "계속사업자입니다." });
    else checks.push({ label: "사업자 상태", verdict: "확인 필요", detail: `국세청 상태가 '${nts.state || "확인 불가"}'입니다. 휴업 중에는 입찰에 참가할 수 없으니 재개 여부를 확인하세요.` });
  } else {
    checks.push({ label: "사업자 상태", verdict: "확인 필요", detail: "국세청 사업자 상태를 조회하지 못했습니다." });
  }

  // 2. 나라장터 조달업체 등록과 참여 분야
  if (!nara) {
    if (errors.nara) checks.push({ label: "조달업체 등록", verdict: "확인 필요", detail: "나라장터 조달업체 정보를 조회하지 못했습니다." });
    else checks.push({ label: "조달업체 등록", verdict: "불가", detail: `나라장터 조달업체로 등록되어 있지 않습니다.${by} 경쟁입찰참가자격을 등록해야 참가할 수 있습니다.` });
  } else if (bizType && nara.bizDivisions.length && !nara.bizDivisions.some((d) => d.includes(bizType))) {
    checks.push({ label: "조달업체 등록", verdict: "확인 필요", detail: `등록된 참여 분야(${nara.bizDivisions.join(", ")})에 '${bizType}'가 없습니다.${by} 참여 분야를 추가 등록해야 하는지 확인하세요.` });
  } else {
    checks.push({ label: "조달업체 등록", verdict: "가능", detail: `나라장터 조달업체로 등록되어 있습니다${nara.bizDivisions.length ? ` (참여 분야 ${nara.bizDivisions.join(", ")})` : ""}.` });
  }

  // 3. 업종(면허) 제한
  if (!q || q.licenseLimited === null) {
    checks.push({ label: "업종 제한", verdict: "확인 필요", detail: "이 공고의 업종 제한 자료를 받지 못했습니다. 공고서의 참가자격을 확인하세요." });
  } else if (!q.licenseLimited) {
    checks.push({ label: "업종 제한", verdict: "가능", detail: "업종 제한이 없는 공고입니다." });
  } else if (!q.licenseGroups.length) {
    checks.push({ label: "업종 제한", verdict: "확인 필요", detail: "업종 제한이 있는 공고인데 제한 업종 목록이 비어 있습니다. 공고서에서 업종을 확인하세요." });
  } else if (!nara) {
    checks.push({ label: "업종 제한", verdict: "확인 필요", detail: `필요 업종: ${describeGroups(q.licenseGroups)}. 기업의 등록 업종을 조회하지 못했습니다.` });
  } else {
    const today = now.toISOString().slice(0, 10);
    const all = nara.industries.filter((i) => i.code);
    const valid = new Map(all.filter((i) => !i.expiresAt || i.expiresAt >= today).map((i) => [i.code, i]));
    const any = new Map(all.map((i) => [i.code, i]));
    const okGroup = q.licenseGroups.find((g) => g.every((r) => satisfies(r, valid)));
    if (okGroup) {
      const used = okGroup.map((r) => { const h = satisfies(r, valid)!; return h.code === r.code ? fmtReq(r) : `${h.name || h.code}(${h.code}, ${r.name} 허용업종)`; });
      checks.push({ label: "업종 제한", verdict: "가능", detail: `등록 업종 ${used.join(", ")}으로 충족합니다. 필요 업종: ${describeGroups(q.licenseGroups)}.` });
    } else if (q.licenseGroups.some((g) => g.every((r) => satisfies(r, any)))) {
      checks.push({ label: "업종 제한", verdict: "확인 필요", detail: `필요 업종: ${describeGroups(q.licenseGroups)}. 해당 업종이 등록되어 있지만 유효기간이 지났습니다. 갱신 여부를 확인하세요.` });
    } else if (!all.length) {
      checks.push({ label: "업종 제한", verdict: "확인 필요", detail: `필요 업종: ${describeGroups(q.licenseGroups)}. 나라장터에서 기업의 등록 업종을 받지 못했습니다.` });
    } else {
      checks.push({ label: "업종 제한", verdict: "불가", detail: `필요 업종: ${describeGroups(q.licenseGroups)}. 나라장터 등록 업종에 없습니다.${by} 업종을 추가 등록하면 참가할 수 있습니다.` });
    }
  }

  // 4. 참가지역 제한
  const corpRegion = nara?.region;
  if (!q || q.regionLimited === null) {
    checks.push({ label: "참가 지역", verdict: "확인 필요", detail: "이 공고의 참가지역 자료를 받지 못했습니다. 공고서의 참가자격을 확인하세요." });
  } else if (!q.regionLimited || !q.regions.length) {
    checks.push({ label: "참가 지역", verdict: "가능", detail: "지역 제한이 없는 공고입니다." });
  } else if (!corpRegion) {
    checks.push({ label: "참가 지역", verdict: "확인 필요", detail: `참가가능지역: ${q.regions.join(", ")}. 기업 소재지를 조회하지 못했습니다.` });
  } else {
    const results = q.regions.map((r) => matchRegion(corpRegion, r));
    const where = `참가가능지역: ${q.regions.join(", ")}. 기업 소재지: ${corpRegion}`;
    const branch = q.regionBasis?.includes("지사");
    if (results.includes("match")) {
      checks.push({ label: "참가 지역", verdict: "가능", detail: `${where}. 소재지가 참가가능지역 안에 있습니다. 공고일 전부터 계속 소재해야 하는 공고가 많으니, 최근에 본사를 옮겼다면 공고서의 기준일을 확인하세요.` });
    } else if (results.includes("partial")) {
      checks.push({ label: "참가 지역", verdict: "확인 필요", detail: `${where}. 공고 지역이 조회된 소재지보다 좁게 지정되어 있어 상세 주소로 확인해야 합니다.` });
    } else if (branch) {
      checks.push({ label: "참가 지역", verdict: "확인 필요", detail: `${where}. 본사 기준으로는 지역 밖입니다. 지사로도 참여할 수 있는 공고라, 참가가능지역에 나라장터에 등록한 지사가 있을 때만 참가할 수 있습니다.` });
    } else if (q.regionBasis?.includes("본사")) {
      checks.push({ label: "참가 지역", verdict: "불가", detail: `${where}. 본사 소재지 기준 지역제한 공고인데 본사가 참가가능지역 밖에 있습니다.` });
    } else {
      checks.push({ label: "참가 지역", verdict: "확인 필요", detail: `${where}. 소재지가 지역 밖입니다. 공고에 판단 기준(본사·지사)이 없어 공고서로 확인하세요.` });
    }
  }

  return { verdict: worst(checks.map((c) => c.verdict)), checks };
}
