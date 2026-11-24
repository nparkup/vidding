/**
 * 입찰 참가자격 1차 판정: 공고의 업종(면허)·참가지역 제한과 기업의 나라장터 등록 정보를 대조한다.
 *
 * 공고 쪽: 조달청 입찰공고정보서비스의 면허제한·참가가능지역 (빌드 때 수집, src/lib/nara/qualification.ts)
 *  - 면허제한은 그룹으로 온다. 나라장터 공고 상세의 "[토목공사업] 업종 또는 [지반조성·포장공사업과 철근·콘크리트공사업] 업종"처럼
 *    같은 그룹 안은 모두 보유해야 하고, 그룹끼리는 '또는'이다. 각 업종에는 대신 인정되는 허용업종이 붙는다.
 * 기업 쪽: 나라장터 사용자정보서비스의 등록 업종(코드)·소재지·부정당제재, 국세청 사업자 상태 (src/lib/corpLookup.ts)
 *
 * 원칙: 자동 판단이 틀리면 안 되므로 자료로 확실한 것만 '가능'·'불가'로 판정하고, 나머지는 '확인 필요'로 둔다.
 * 직접생산확인은 물품 공고의 세부품명과 공공구매종합정보망 직접생산확인증명을 대조해, 없으면 '확인 필요'로만 둔다
 * (그 품명이 중소기업자간 경쟁제품인지는 공고서로 확인해야 한다). 중소기업·실적·등급 제한처럼 공고서 본문에만 있는 조건은 판단하지 않는다.
 */
import type { EvalBasis } from "./criteria";
import type { CorpLookup } from "./corpLookup";
import type { NoticeInfo } from "./noticeInfo";
import type { NoticeCriteria } from "./noticeCriteria";
import { REQ_TITLE } from "./noticeReqs";

/** 업종의 근거법령 (조달청 업종 및 근거법규서비스) */
export interface IndustryLaw {
  /** 근거법령명 (예: 건설산업기본법) */
  law?: string;
  /** 조항 (예: 제9조) */
  clause?: string;
}

export interface LicenseReq {
  name: string;
  code: string;
  /**
   * 이 업종 대신 인정되는 업종. 공고가 적은 허용업종과,
   * 조달청 업종 기준에서 이 업종을 포함하는 업종(via: "포함", 예: 토목건축공사업은 건축공사업을 포함)
   */
  alt: { name: string; code: string; via?: "포함" }[];
  /** 근거법령 (빌드 때 lib/nara/industryLaw 가 붙인다) */
  law?: IndustryLaw;
}

/** 법령명·조항 → 국가법령정보센터 주소 */
export function lawUrl(l: IndustryLaw): string | undefined {
  if (!l.law) return undefined;
  return `https://www.law.go.kr/법령/${encodeURIComponent(l.law.replace(/\s+/g, ""))}${l.clause && /^제\d+조(의\d+)?$/.test(l.clause) ? `/${encodeURIComponent(l.clause)}` : ""}`;
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
  /** 공고 상세 '핵심 요약'용 공고 항목 (입찰방식·금액·담당자 등, lib/noticeInfo) */
  info?: NoticeInfo;
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
  return satisfiedBy(req, held)?.held;
}

/** 어떤 등록 업종으로 충족하는지: 같은 업종, 공고의 허용업종, 이 업종을 포함하는 업종 순으로 찾는다 */
function satisfiedBy(req: LicenseReq, held: Map<string, HeldIndustry>): { held: HeldIndustry; via?: "허용" | "포함"; name?: string } | undefined {
  if (req.code && held.has(req.code)) return { held: held.get(req.code)! };
  for (const a of req.alt) if (!a.via && a.code && held.has(a.code)) return { held: held.get(a.code)!, via: "허용", name: a.name };
  for (const a of req.alt) if (a.via === "포함" && a.code && held.has(a.code)) return { held: held.get(a.code)!, via: "포함", name: a.name };
  return undefined;
}

/* ---------- 판정 ---------- */

const worst = (vs: Verdict[]): Verdict => (vs.includes("불가") ? "불가" : vs.includes("확인 필요") ? "확인 필요" : "가능");

/** 물품 공고의 세부품명 (직접생산확인 대조용) */
export interface GoodsInfo {
  itemNo?: string;
  itemName?: string;
  /** 중소기업 제한 공고 */
  smallBizOnly?: boolean;
}

export function judgeEligibility(q: BidQual | undefined, corp: CorpLookup, bizType?: string, now = new Date(), goods?: GoodsInfo, notice?: Pick<NoticeCriteria, "reqs" | "smeExempt">): Eligibility {
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

  // 1-2. 부정당제재 (나라장터 사용자정보서비스): 제재 기간에는 입찰에 참가할 수 없다
  if (corp.sanctions) {
    const act = corp.sanctions.filter((x) => x.active);
    const soon = corp.sanctions.filter((x) => x.upcoming);
    const past = corp.sanctions.filter((x) => !x.active && !x.upcoming);
    const line = (x: NonNullable<CorpLookup["sanctions"]>[number]) => `${x.agency} ${x.begin ?? ""}~${x.end ?? ""}${x.reason ? ` (${x.reason})` : ""}`;
    if (act.length) checks.push({ label: "부정당제재", verdict: "불가", detail: `입찰참가자격 제한 기간입니다: ${act.map(line).join("; ")}. 제재 기간에는 입찰에 참가할 수 없습니다.` });
    else if (soon.length) checks.push({ label: "부정당제재", verdict: "확인 필요", detail: `곧 시작되는 제재가 있습니다: ${soon.map(line).join("; ")}. 개찰일이 제재 기간에 들면 참가할 수 없으니 일정을 확인하세요.` });
    else checks.push({ label: "부정당제재", verdict: "가능", detail: past.length ? `현재 제재 중이 아닙니다. 지난 제재 ${past.length}건: ${past.slice(0, 3).map(line).join("; ")}.` : "나라장터 부정당제재 이력이 없습니다." });
  } else if (errors.sanction) {
    checks.push({ label: "부정당제재", verdict: "확인 필요", detail: "나라장터 부정당제재 정보를 조회하지 못했습니다. 입찰참가자격 제한 중인지 나라장터에서 확인하세요." });
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
    checks.push({ label: "업종 제한", verdict: "가능", detail: notice?.reqs?.some((r) => r.kind === "permit") ? "나라장터 업종 제한은 없습니다. 공고서가 적은 허가·지정 요건은 위 항목을 보세요." : "업종 제한이 없는 공고입니다." });
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
      const used = okGroup.map((r) => {
        const s = satisfiedBy(r, valid)!;
        const name = s.held.name || s.name || s.held.code;
        if (!s.via) return fmtReq(r);
        return s.via === "허용" ? `${name}(${s.held.code}, ${r.name} 허용업종)` : `${name}(${s.held.code}, 조달청 업종 기준상 ${r.name}을 포함하는 업종)`;
      });
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

  // 5. 직접생산확인 (물품): 중소기업자간 경쟁제품은 그 세부품명의 직접생산확인증명이 있어야 참가할 수 있다
  const itemNo = goods?.itemNo?.replace(/\D/g, "");
  if (bizType === "물품" && itemNo && itemNo.length === 10) {
    const name = `세부품명 ${goods?.itemName ? `${goods.itemName}(${itemNo})` : itemNo}`;
    const rec = corp.directProduction?.find((d) => d.itemNo === itemNo);
    if (!corp.directProduction) {
      if (goods?.smallBizOnly) checks.push({ label: "직접생산확인", verdict: "확인 필요", detail: `${name}의 직접생산확인증명을 조회하지 못했습니다. 중소기업자간 경쟁제품이면 공공구매종합정보망에서 확인하세요.` });
    } else if (rec?.valid) {
      checks.push({ label: "직접생산확인", verdict: "가능", detail: `${name} 직접생산확인증명이 유효합니다${rec.validTo ? ` (~${rec.validTo})` : ""}.` });
    } else if (rec) {
      checks.push({ label: "직접생산확인", verdict: "확인 필요", detail: `${name} 직접생산확인증명의 유효기간이 지났습니다${rec.validTo ? ` (${rec.validTo})` : ""}. 중소기업자간 경쟁제품이면 갱신해야 참가할 수 있습니다.` });
    } else if (goods?.smallBizOnly) {
      checks.push({ label: "직접생산확인", verdict: "확인 필요", detail: `${name}의 직접생산확인증명이 없습니다. 중소기업자간 경쟁제품이면 직접생산확인을 받아야 참가할 수 있으니 공고서의 참가자격을 확인하세요.` });
    }
  }

  // 6. 공고서 참가자격 본문의 요건 (업종 제한이 없는 공고도 허가·지정·확인서·실적 등을 적는다, noticeReqs.ts)
  const today = now.toISOString().slice(0, 10);
  const held = new Set((nara?.industries ?? []).filter((i) => i.code && (!i.expiresAt || i.expiresAt >= today)).map((i) => i.code));
  const front: Check[] = [];
  for (const r of notice?.reqs ?? []) {
    const label = `공고서 요건: ${REQ_TITLE[r.kind]}`;
    const who = r.who ? ` 참가 대상은 ${r.who}입니다.` : "";
    if (r.kind === "permit") {
      if (r.codes?.length && nara?.industries.length) {
        const have = r.codes.filter((c) => held.has(c));
        if (have.length === r.codes.length || (r.anyCode && have.length)) front.push({ label, verdict: "가능", detail: `공고서가 요구한 ${r.label}(업종코드 ${r.codes.join(", ")})${r.anyCode ? " 중 하나" : ""}이 나라장터 등록 업종에 있습니다.` });
        else if (!have.length) front.push({ label, verdict: "불가", detail: `공고서는 ${r.label}(업종코드 ${r.codes.join(", ")})을 갖춘 업체만 참가할 수 있다고 적었는데, 나라장터 등록 업종에 없습니다.${who}` });
        else front.push({ label, verdict: "확인 필요", detail: `공고서가 요구한 업종코드 ${r.codes.join(", ")} 중 ${have.join(", ")}만 등록되어 있습니다.${who}` });
      } else {
        front.push({ label, verdict: "확인 필요", detail: `공고서는 ${r.label} 업체만 참가할 수 있다고 적었습니다.${who} 조회 자료로는 확인할 수 없어, 이 요건이 없으면 다른 조건을 갖춰도 참가할 수 없습니다.` });
      }
    } else if (r.kind === "direct") {
      const recs = corp.directProduction;
      const items = r.items ?? [];
      const ok = recs && items.length ? recs.find((d) => items.includes(d.itemNo) && d.valid) : undefined;
      if (ok) front.push({ label, verdict: "가능", detail: `공고서가 요구한 ${r.label} 직접생산확인증명이 유효합니다${ok.validTo ? ` (~${ok.validTo})` : ""}.` });
      else if (recs && items.length) front.push({ label, verdict: "불가", detail: `공고서는 ${r.label}(세부품명번호 ${items.join(", ")}) 직접생산확인증명을 가진 업체만 참가할 수 있다고 적었는데, 공공구매종합정보망에 유효한 증명이 없습니다.` });
      else front.push({ label, verdict: "확인 필요", detail: `공고서는 ${r.label}을 가진 업체만 참가할 수 있다고 적었습니다. 공공구매종합정보망에서 확인하세요.` });
    } else if (r.kind === "social" && r.cert) {
      const c = corp.certs?.[r.cert];
      if (c?.valid) front.push({ label, verdict: "가능", detail: `${r.label}이 유효합니다.` });
      else if (c === null) front.push({ label, verdict: "불가", detail: `공고서는 ${r.label}을 가진 업체만 참가할 수 있다고 적었는데, 조회된 확인서가 없습니다.` });
      else front.push({ label, verdict: "확인 필요", detail: `공고서는 ${r.label}을 가진 업체만 참가할 수 있다고 적었습니다.` });
    } else {
      const what: Record<string, string> = {
        sme: `공고서는 ${r.label}를 가진 업체만 참가할 수 있다고 적었습니다. 공공구매종합정보망에서 확인서 발급과 유효기간을 확인하세요.`,
        social: `공고서는 ${r.label}만 참가할 수 있다고 적었습니다.`,
        record: "공고서가 참가자격으로 실적을 요구합니다. 실적증명서로 조건을 갖췄는지 확인하세요.",
        staff: "공고서가 참가자격으로 인력·장비·시설 보유를 요구합니다.",
        product: "공고서가 납품 제품의 인증이나 제조사 공급 확약을 요구합니다.",
        bizscope: "공고서가 사업자등록 종목이나 법인 목적에 해당 사업이 있어야 한다고 적었습니다.",
        insurance: "공고서가 배상책임보험 가입을 요구합니다.",
      };
      front.push({ label, verdict: "확인 필요", detail: `${what[r.kind] ?? "공고서의 참가자격을 확인하세요."} 원문: ${r.quote.length > 140 ? `${r.quote.slice(0, 139)}…` : r.quote}` });
    }
  }
  // 허가·지정처럼 참가 대상을 가르는 요건은 맨 앞에 보인다
  checks.unshift(...front);
  // 7. 중소기업 우선조달 예외 공고는 기업 규모로 제한하지 않는다
  if (notice?.smeExempt && !notice.reqs?.some((r) => r.kind === "sme")) checks.push({ label: "기업 규모", verdict: "가능", detail: "중소기업 우선조달의 예외 공고라 중소기업이 아니어도 참가할 수 있습니다. 대형 기관과 함께 경쟁합니다." });

  return { verdict: worst(checks.map((c) => c.verdict)), checks };
}
