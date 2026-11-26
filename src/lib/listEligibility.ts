/**
 * 공고 목록 단계의 참가 가능 판정 (입찰점수 예측 2단계 '입찰 공고 선택').
 *
 * 공고 목록(bids-data.json)에 있는 값만으로 조회한 기업이 참가할 수 있는 공고를 거른다:
 * 계약방식(지정 업체만 참가), 사업자 상태·부정당제재, 나라장터 조달업체 등록, 투찰가능업종, 참가가능지역(시·도).
 * 공고서 본문 요건·업종 그룹(모두 보유)·시·군·구 제한처럼 목록에 없는 조건은 공고를 고른 뒤
 * 3단계에서 첨부 자료로 다시 판정한다 (lib/eligibility judgeEligibility).
 * 확실히 맞지 않는 공고만 '불가'로 빼고, 자료가 모자라 판단할 수 없으면 '확인 필요'로 남긴다.
 */
import type { CorpLookup } from "./corpLookup";
import type { Verdict } from "./eligibility";
import type { Bid } from "./types";
import { closedLabel } from "./bidMethod";
import { licenseMatches, normalizeLicense } from "./licenses";
import { mapRegions } from "./regions";

export interface ListVerdict { verdict: Verdict; reasons: string[] }

/** 조달청 업종 기준에서 다른 업종을 포함하는 업종 (자주 나오는 것만. 나머지는 3단계에서 포함면허 자료로 판정) */
const INCLUDES: Record<string, string[]> = {
  "토목건축공사업": ["토목공사업", "건축공사업"],
  "산업·환경설비공사업": ["기계설비·가스공사업"],
};

/** 기업 전체에 걸리는 사유 (모든 공고가 불가). 없으면 null */
export function corpBlocker(corp: CorpLookup): string | null {
  const { nts } = corp;
  if (nts && !nts.registered) return "국세청에 등록되지 않은 사업자등록번호입니다.";
  if (nts?.state === "폐업자") return "폐업한 사업자는 입찰에 참가할 수 없습니다.";
  const act = corp.sanctions?.filter((x) => x.active) ?? [];
  if (act.length) return `부정당제재(입찰참가자격 제한) 기간입니다${act[0].end ? ` (~${act[0].end})` : ""}. 제재 기간에는 입찰에 참가할 수 없습니다.`;
  if (!corp.nara && !corp.errors.nara) return "나라장터 조달업체(경쟁입찰참가자격)로 등록되어 있지 않습니다. 나라장터에 등록해야 공고에 참가할 수 있습니다.";
  return null;
}

export function makeListJudge(corp: CorpLookup, now = new Date()): (bid: Bid) => ListVerdict {
  const blocker = corpBlocker(corp);
  const today = now.toISOString().slice(0, 10);
  const nara = corp.nara;
  const inds = (nara?.industries ?? []).filter((i) => !i.expiresAt || i.expiresAt >= today);
  const held = new Set<string>();
  for (const i of inds) if (i.name) {
    const n = normalizeLicense(i.name);
    held.add(n);
    for (const x of INCLUDES[n] ?? []) held.add(x);
  }
  const heldList = [...held];
  // 이름 없이 코드만 온 예전 업종이 있으면 이름으로 대조할 수 없다
  const nameless = inds.some((i) => !i.name);
  const corpRegions = mapRegions(nara?.region ?? "");
  const cache = new Map<string, ListVerdict>();

  return (bid) => {
    const hit = cache.get(bid.id);
    if (hit) return hit;
    const no: string[] = [];
    const check: string[] = [];
    const closed = closedLabel(bid);
    if (closed) no.push(closed);
    if (blocker) no.push(blocker);

    // 투찰가능업종 (목록 값은 '또는')
    const need = bid.licenses.length ? bid.licenses : bid.licenseRaw ? [bid.licenseRaw] : [];
    if (need.length) {
      if (!nara) check.push("등록 업종을 조회하지 못했습니다");
      else if (need.some((n) => heldList.some((h) => licenseMatches(h, n)))) { /* 가능 */ }
      else if (nameless || !inds.length) check.push(`필요 업종 ${need.slice(0, 3).join(", ")}`);
      else no.push("등록 업종이 공고의 투찰가능업종과 맞지 않습니다");
    }
    // 참여 분야 (용역·공사·물품)
    const biz = bid.bizType ?? "용역";
    if (nara?.bizDivisions.length && !nara.bizDivisions.some((d) => d.includes(biz))) check.push(`참여 분야에 ${biz} 등록 확인`);
    // 참가가능지역 (시·도)
    if (bid.region !== "전국") {
      const allow = bid.regions ?? [bid.region];
      if (!corpRegions.length) check.push(`${allow.join("·")} 지역 제한, 소재지 확인`);
      else if (!allow.some((r) => corpRegions.includes(r))) no.push(`${allow.join("·")} 지역 제한 공고입니다`);
    }

    const v: ListVerdict = no.length ? { verdict: "불가", reasons: no } : check.length ? { verdict: "확인 필요", reasons: check } : { verdict: "가능", reasons: [] };
    cache.set(bid.id, v);
    return v;
  };
}
