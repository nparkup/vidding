/**
 * 관심공고 서류함: 담은 공고를 이 브라우저(localStorage)에 둔다. 서버에 보내지 않는다.
 * 키 "bidmate.mybox.v1", 값 { v: 1, items: MyBoxItem[] }. 공고는 공고번호(no) 기준으로 하나만 (정정으로 차수가 바뀌어도 같은 공고).
 * 바뀔 때마다 window 이벤트 "bidmate:mybox" 를 낸다 (다른 화면·정정 알림이 다시 읽게).
 */
import type { Bid } from "./types";

export const MYBOX_KEY = "bidmate.mybox.v1";
export const MYBOX_EVENT = "bidmate:mybox";
/** 서류함을 화면에 보일지. 로그인 기능이 완료되면 true로 바꿔 메뉴·담기 버튼·정정 알림 "관심공고만"을 다시 연다 (/mybox 페이지는 그대로 있음) */
export const MYBOX_ENABLED = false;

export interface MyBoxItem {
  /** 공고번호 (bidNtceNo) */
  no: string;
  /** 담을 때의 공고 id (공고번호-차수) */
  id: string;
  title: string;
  agency: string;
  closeAt: string;
  openAt?: string;
  label?: string;
  memo?: string;
  addedAt: string;
}

export function loadMyBox(): MyBoxItem[] {
  try {
    const j = JSON.parse(localStorage.getItem(MYBOX_KEY) ?? "null") as { v: 1; items: MyBoxItem[] } | null;
    return Array.isArray(j?.items) ? j!.items : [];
  } catch { return []; }
}

export function saveMyBox(items: MyBoxItem[]) {
  try { localStorage.setItem(MYBOX_KEY, JSON.stringify({ v: 1, items })); } catch { /* 저장 못 해도 화면은 그대로 */ }
  try { window.dispatchEvent(new Event(MYBOX_EVENT)); } catch { /* 서버 렌더링 */ }
}

export function inMyBox(no: string) {
  return loadMyBox().some((x) => x.no === no);
}

export function addToMyBox(bid: Pick<Bid, "id" | "bidNtceNo" | "title" | "demandAgency" | "agency" | "closeAt" | "openAt">) {
  const items = loadMyBox().filter((x) => x.no !== bid.bidNtceNo);
  items.unshift({ no: bid.bidNtceNo, id: bid.id, title: bid.title, agency: bid.demandAgency || bid.agency, closeAt: bid.closeAt, openAt: bid.openAt, addedAt: new Date().toISOString() });
  saveMyBox(items);
}

export function removeFromMyBox(no: string) {
  saveMyBox(loadMyBox().filter((x) => x.no !== no));
}

export function updateMyBox(no: string, patch: Partial<Pick<MyBoxItem, "label" | "memo">>) {
  saveMyBox(loadMyBox().map((x) => (x.no === no ? { ...x, ...patch } : x)));
}

/** 제출서류 체크리스트 진행 (Checklist 가 "checklist:{공고 id}" 에 둔다): [체크한 수] */
export function checklistDone(id: string): number {
  try { return Object.values(JSON.parse(localStorage.getItem(`checklist:${id}`) ?? "{}") as Record<string, boolean>).filter(Boolean).length; } catch { return 0; }
}
