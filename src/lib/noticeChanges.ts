/**
 * 정정·취소공고 감지.
 *
 * 나라장터 개방표준 공고 목록은 공고 한 건의 차수(000, 001, …)를 따로따로 준다. 정정되면 차수가 올라간 행이
 * "정정공고"로, 취소되면 "취소공고"로 새로 올라온다. 수집 기간(60일) 안에 같은 공고번호의 이전 차수가 있으면
 * 두 차수를 비교해 금액·마감·개찰·참가 자격(지역·업종)·낙찰방법 중 바뀐 항목과 전후 값을 남긴다.
 *
 * 관심공고(서류함, ClientProfile.watchlist)는 차수가 바뀌면 공고 id 가 달라지므로 공고번호(no)로 맞춘다.
 */
import type { Bid } from "./types";

/** 정정·취소 내역을 남기는 기간 (정정·취소 공고 게시일 기준, 일) */
export const CHANGE_DAYS = 14;

export type ChangeField = "금액" | "입찰 마감" | "개찰" | "참가 지역" | "투찰 가능 업종" | "낙찰방법" | "공고명" | "현장설명";

export interface FieldChange {
  field: ChangeField;
  before: string;
  after: string;
}

export interface NoticeChange {
  /** 공고번호 */
  no: string;
  /** 새 차수 */
  ord: string;
  /** 비교한 이전 차수 (수집 기간 안에 없으면 없음) */
  prevOrd?: string;
  kind: "정정" | "취소";
  /** 정정·취소 공고 게시 시각 (ISO) */
  at: string;
  title: string;
  agency: string;
  demandAgency: string;
  bizType?: Bid["bizType"];
  category?: Bid["category"];
  /** 지금 진행 중인 공고 id (취소면 없음) */
  bidId?: string;
  closeAt?: string;
  baseAmount?: number;
  /** 바뀐 항목. 이전 차수가 없거나 공고서 본문만 바뀐 정정은 빈 배열 */
  fields: FieldChange[];
  detailUrl?: string;
}

export interface NoticeChangesFile {
  builtAt: string;
  /** 며칠 동안의 정정·취소를 담았는지 */
  days: number;
  items: NoticeChange[];
}

const tz = { timeZone: "Asia/Seoul" } as const;
const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString("ko-KR", { ...tz, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");
const amt = (n?: number) => (n ? `${n.toLocaleString("ko-KR")}원` : "-");
const list = (a?: string[]) => (a && a.length ? [...a].sort().join(", ") : "제한 없음");

/** 두 차수 공고를 비교해 바뀐 항목 */
export function diffBids(prev: Bid, next: Bid): FieldChange[] {
  const out: FieldChange[] = [];
  const push = (field: ChangeField, before: string, after: string) => { if (before !== after) out.push({ field, before, after }); };
  // 금액 칸에 1원·0원 같은 자리표시 값이 들어오는 공고가 있어 1만 원 미만은 비교하지 않는다
  if (prev.baseAmount !== next.baseAmount && prev.baseAmount >= 10_000 && next.baseAmount >= 10_000) push("금액", amt(prev.baseAmount), amt(next.baseAmount));
  push("입찰 마감", dt(prev.closeAt), dt(next.closeAt));
  push("개찰", dt(prev.openAt), dt(next.openAt));
  push("참가 지역", list(prev.regions ?? (prev.region === "전국" ? [] : [prev.region])), list(next.regions ?? (next.region === "전국" ? [] : [next.region])));
  push("투찰 가능 업종", list(prev.licenses), list(next.licenses));
  push("낙찰방법", prev.awardRaw ?? prev.contractMethod, next.awardRaw ?? next.contractMethod);
  if (prev.briefingAt || next.briefingAt) push("현장설명", prev.briefingAt ? dt(prev.briefingAt) : "없음", next.briefingAt ? dt(next.briefingAt) : "없음");
  push("공고명", prev.title.trim(), next.title.trim());
  return out;
}

/** 알림에서 눈여겨볼 항목 (금액·마감·자격) */
export const KEY_FIELDS: ChangeField[] = ["금액", "입찰 마감", "개찰", "참가 지역", "투찰 가능 업종", "낙찰방법"];

/** 한 줄 요약: "금액 5.2억 → 4.9억, 입찰 마감 11.25 → 12.02" 처럼 */
export function changeSummary(c: NoticeChange): string {
  if (c.kind === "취소") return "공고가 취소되었습니다";
  if (!c.fields.length) return c.prevOrd ? "공고서 내용 정정 (목록 항목 변동 없음)" : "정정공고 (이전 차수가 수집 기간 밖이라 비교 못 함)";
  return c.fields.map((f) => `${f.field} ${f.before} → ${f.after}`).join(" · ");
}

/** 공고번호로 찾기 쉽게 */
export function changesByNo(items: NoticeChange[]): Map<string, NoticeChange[]> {
  const m = new Map<string, NoticeChange[]>();
  for (const c of items) (m.get(c.no) ?? m.set(c.no, []).get(c.no)!).push(c);
  for (const v of m.values()) v.sort((a, b) => b.ord.localeCompare(a.ord));
  return m;
}
