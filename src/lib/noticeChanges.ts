/**
 * 정정·취소공고 감지.
 *
 * 나라장터 개방표준 공고 목록은 공고 한 건의 차수(000, 001, …)를 따로따로 준다. 정정되면 차수가 올라간 행이
 * "정정공고"로, 취소되면 "취소공고"로 새로 올라온다. 수집 기간(60일) 안에 같은 공고번호의 이전 차수가 있으면
 * 두 차수를 비교해 금액·마감·개찰·참가 자격(지역·업종)·낙찰방법 중 바뀐 항목과 전후 값을 남긴다.
 *
 * 관심공고(서류함, ClientProfile.watchlist)는 차수가 바뀌면 공고 id 가 달라지므로 공고번호(no)로 맞춘다.
 *
 * 누리장터(src/lib/nara/nuri.ts)도 나라장터처럼 차수가 올라간 행이 "변경공고"·"취소공고"로 올라와 같은 방식으로 비교한다.
 * 공동주택 K-apt(src/lib/kapt/changes.ts)는 차수가 없고 정정이 새 공고번호의 "수정공고"로 올라오므로,
 * 공고명에 수정·정정 표시가 있는 공고를 같은 단지·같은 분야의 앞선 공고와 맞춰 비교하고,
 * 같은 공고번호의 내용이 지난 빌드와 달라진 것도 정정으로 남긴다.
 */
import type { Bid } from "./types";

/** 정정·취소 내역을 남기는 기간 (정정·취소 공고 게시일 기준, 일) */
export const CHANGE_DAYS = 14;

export type ChangeField = "금액" | "입찰 마감" | "개찰" | "참가 지역" | "투찰 가능 업종" | "낙찰방법" | "공고명" | "현장설명" | "서류 마감" | "계약방법";

/** 정정·취소 공고의 출처. 없으면 나라장터 */
export type ChangeSource = "나라장터" | "누리장터" | "공동주택";
export const CHANGE_SOURCES: ChangeSource[] = ["나라장터", "누리장터", "공동주택"];
export const changeSource = (c: { source?: ChangeSource }): ChangeSource => c.source ?? "나라장터";

export interface FieldChange {
  field: ChangeField;
  before: string;
  after: string;
}

export interface NoticeChange {
  /** 출처 (없으면 나라장터) */
  source?: ChangeSource;
  /** 공고번호 */
  no: string;
  /** 새 차수 (공동주택은 차수가 없어 빈 문자열) */
  ord: string;
  /** 비교한 이전 차수 (수집 기간 안에 없으면 없음). 공동주택은 비교한 앞선 공고번호 */
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
  /** 사이트 안 공고 상세 주소 (누리장터·공동주택 진행 중 공고) */
  href?: string;
  /** 공동주택: 같은 공고번호 내용이 지난 수집과 달라져 찾은 정정 (게시 시각 대신 찾은 시각) */
  detected?: boolean;
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

/** 출처와 관계없이 비교하는 공고 항목. 값이 없는(undefined) 항목은 비교하지 않는다 */
export interface ChangeSnapshot {
  title: string;
  amount?: number;
  closeAt?: string;
  openAt?: string;
  regions?: string[];
  licenses?: string[];
  award?: string;
  contract?: string;
  briefingAt?: string | null;
  docsBy?: string | null;
}

/** 두 공고(차수)를 비교해 바뀐 항목 */
export function diffSnapshots(prev: ChangeSnapshot, next: ChangeSnapshot): FieldChange[] {
  const out: FieldChange[] = [];
  const push = (field: ChangeField, before: string, after: string) => { if (before !== after) out.push({ field, before, after }); };
  // 금액 칸에 1원·0원 같은 자리표시 값이 들어오는 공고가 있어 1만 원 미만은 비교하지 않는다
  if (prev.amount !== next.amount && (prev.amount ?? 0) >= 10_000 && (next.amount ?? 0) >= 10_000) push("금액", amt(prev.amount), amt(next.amount));
  if (prev.closeAt && next.closeAt) push("입찰 마감", dt(prev.closeAt), dt(next.closeAt));
  if (prev.openAt && next.openAt) push("개찰", dt(prev.openAt), dt(next.openAt));
  if (prev.regions && next.regions) push("참가 지역", list(prev.regions), list(next.regions));
  if (prev.licenses && next.licenses) push("투찰 가능 업종", list(prev.licenses), list(next.licenses));
  if (prev.award && next.award) push("낙찰방법", prev.award, next.award);
  if (prev.contract && next.contract) push("계약방법", prev.contract, next.contract);
  if (prev.briefingAt !== undefined && next.briefingAt !== undefined && (prev.briefingAt || next.briefingAt)) push("현장설명", prev.briefingAt ? dt(prev.briefingAt) : "없음", next.briefingAt ? dt(next.briefingAt) : "없음");
  if (prev.docsBy !== undefined && next.docsBy !== undefined && (prev.docsBy || next.docsBy)) push("서류 마감", prev.docsBy ? dt(prev.docsBy) : "없음", next.docsBy ? dt(next.docsBy) : "없음");
  push("공고명", prev.title.replace(/\s+/g, " ").trim(), next.title.replace(/\s+/g, " ").trim());
  return out;
}

/** 두 차수 나라장터 공고를 비교해 바뀐 항목 */
export function diffBids(prev: Bid, next: Bid): FieldChange[] {
  const snap = (b: Bid): ChangeSnapshot => ({
    title: b.title, amount: b.baseAmount, closeAt: b.closeAt, openAt: b.openAt,
    regions: b.regions ?? (b.region === "전국" ? [] : [b.region]), licenses: b.licenses ?? [],
    award: b.awardRaw ?? b.contractMethod, briefingAt: b.briefingAt ?? null,
  });
  return diffSnapshots(snap(prev), snap(next));
}

/** 알림에서 눈여겨볼 항목 (금액·마감·자격) */
export const KEY_FIELDS: ChangeField[] = ["금액", "입찰 마감", "개찰", "참가 지역", "투찰 가능 업종", "낙찰방법"];

/** "정정 2차" · "취소" · 차수가 없는 공동주택은 "정정" */
export const changeLabel = (c: NoticeChange) => (c.kind === "취소" ? "취소" : Number(c.ord) > 0 ? `정정 ${Number(c.ord)}차` : "정정");

/** 공고번호 표기 (차수가 있으면 붙인다) */
export const changeNo = (c: NoticeChange) => (c.ord ? `${c.no}-${c.ord}` : c.no);

/** 한 줄 요약: "금액 5.2억 → 4.9억, 입찰 마감 11.25 → 12.02" 처럼 */
export function changeSummary(c: NoticeChange): string {
  if (c.kind === "취소") return "공고가 취소되었습니다";
  if (!c.fields.length) {
    if (c.source === "공동주택") return c.prevOrd ? `앞선 공고(${c.prevOrd})와 비교한 목록 항목은 같습니다. 공고문에서 바뀐 내용을 확인하세요` : "수정공고 (같은 단지의 앞선 공고를 찾지 못해 비교 못 함)";
    return c.prevOrd ? "공고서 내용 정정 (목록 항목 변동 없음)" : "정정공고 (이전 차수가 수집 기간 밖이라 비교 못 함)";
  }
  return c.fields.map((f) => `${f.field} ${f.before} → ${f.after}`).join(" · ");
}

/** 공고번호로 찾기 쉽게 */
export function changesByNo(items: NoticeChange[]): Map<string, NoticeChange[]> {
  const m = new Map<string, NoticeChange[]>();
  for (const c of items) (m.get(c.no) ?? m.set(c.no, []).get(c.no)!).push(c);
  for (const v of m.values()) v.sort((a, b) => b.ord.localeCompare(a.ord) || b.at.localeCompare(a.at));
  return m;
}
