/**
 * 실적으로 참가(만점) 가능한 최대 공고 금액.
 * - 목록 거르기(perfCapOf): 적격심사 실적 평가의 흔한 기준을 쓴다. 용역·물품은 최근 3년 유사 실적이 추정가격의 1배 이상이면 만점,
 *   공사는 최근 5년 시공 실적이 추정가격의 1배 이상이면 만점으로 본다. 공고마다 배수·기간이 달라 정확한 값은 평가점수 예측에서 공고별로 계산한다.
 * - 공고별(sheetPerfCap): 그 공고 평가표로 금액을 바꿔 가며 실적 항목이 만점인 최대 금액과, 가격 만점일 때 통과하는 최대 금액을 찾는다.
 */
import { predict, type CompanyInput, type EvalSheet } from "./evalscore";
import type { Bid } from "./types";

export interface PerfInput { y3: number; y5: number }

/** 업무별 기준 실적 (원). 없으면 0 */
export function perfBasis(bizType: string | undefined, p: PerfInput): number {
  return bizType === "공사" ? p.y5 || p.y3 : p.y3 || p.y5;
}

/** 목록 거르기용: 실적 만점을 받을 수 있는 최대 공고 금액 (1배 기준) */
export function perfCapOf(bizType: string | undefined, p: PerfInput): number {
  return perfBasis(bizType, p);
}

/** 금액이 커질수록 점수가 떨어진다고 보고 조건을 만족하는 가장 큰 금액을 찾는다 (100만 원 단위) */
function maxAmount(ok: (amt: number) => boolean, lo = 1e6, hi = 1e12): number {
  if (!ok(lo)) return 0;
  if (ok(hi)) return hi;
  for (let i = 0; i < 40 && hi - lo > 1e6; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1e6) * 1e6;
}

export interface SheetPerfCap {
  /** 실적 항목이 만점인 최대 금액 (원). 실적 항목이 없으면 undefined */
  full?: number;
  /** 가격 만점일 때 통과 점수를 넘는 최대 금액 (원). 통과 기준이 없으면 undefined */
  pass?: number;
  /** 지금 공고 금액 */
  current: number;
}

export function sheetPerfCap(sheet: EvalSheet, bid: Pick<Bid, "baseAmount" | "lowerLimitRate">, co: CompanyInput): SheetPerfCap {
  const perfItems = sheet.items.filter((i) => i.kind === "performance" && i.max > 0);
  const current = sheet.refAmount || bid.baseAmount;
  const at = (amt: number) => predict({ ...sheet, refAmount: amt }, { ...bid, baseAmount: amt }, co);
  const full = perfItems.length && co.pastPerformance > 0
    ? maxAmount((amt) => at(amt).items.filter((i) => i.kind === "performance" && i.max > 0).every((i) => !i.unknown && i.score >= i.max - 1e-6))
    : undefined;
  const priceItem = sheet.items.find((i) => i.kind === "price");
  // 실적 항목이 없는 평가표(경영상태·신인도·가격만)는 금액과 상관없이 통과 여부가 같아 계산하지 않는다
  const pass = perfItems.length && sheet.pass?.kind === "total" && priceItem && co.pastPerformance > 0
    ? maxAmount((amt) => {
        const r = at(amt);
        if (r.pending) return false;
        const priceScore = r.items.find((i) => i.id === priceItem.id)?.score ?? 0;
        return r.total - priceScore + priceItem.max >= (sheet.pass as { score: number }).score - 0.01;
      })
    : undefined;
  // 찾는 범위(1조 원) 끝까지 되면 상한이 없는 것: 보여 주지 않는다
  return { full: full && full < 1e12 ? full : undefined, pass: pass && pass < 1e12 ? pass : undefined, current };
}
