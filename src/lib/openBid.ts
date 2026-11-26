import type { AptBid } from "./apt";
import type { NuriBid } from "./nuri";

/**
 * 누리장터 공고 중 일반 업체가 참가할 수 없는 공고의 까닭.
 * 입찰방식 '전자시담'·낙찰방법 '수의시담'은 계약상대자를 정해 둔 건, 계약방법 '지명경쟁'은 지명받은 업체만 참가한다.
 * 나라장터 공고는 bidMethod.ts closedLabel 로 같은 판정을 한다.
 */
export function nuriClosedLabel(b: Pick<NuriBid, "method" | "contract" | "award">): string | undefined {
  if (/시담/.test(`${b.method ?? ""} ${b.contract ?? ""} ${b.award ?? ""}`)) return "수의시담 · 지정 업체만 참가";
  if (/지명/.test(b.contract ?? "")) return "지명경쟁 · 지명 업체만 참가";
  return undefined;
}

/** 공동주택(K-apt) 공고 중 지명경쟁(관리주체가 지명한 업체만 참가)이면 그 표시 */
export function aptClosedLabel(b: Pick<AptBid, "kind">): string | undefined {
  return b.kind?.includes("지명") ? "지명경쟁 · 지명 업체만 참가" : undefined;
}

/** 검색 조건의 체크박스 이름 (세 공고 검색 공통, 기본 선택) */
export const EXCLUDE_CLOSED_LABEL = "참가 불가 / 지정 업체만 참가 제외";
