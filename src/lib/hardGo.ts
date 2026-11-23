import type { MouseEvent } from "react";
import { clearAllState } from "./resetOnReload";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

/**
 * 링크를 눌렀을 때 화면을 처음부터 새로 연다: 저장해 둔 조회 조건·주소 값을 지우고 페이지를 새로 불러온다.
 * 헤더 로고(모든 화면 초기화)와 지금 보고 있는 화면의 메뉴를 다시 눌렀을 때 쓴다.
 * 새 탭 열기(Ctrl·Cmd·Shift·가운데 클릭)는 브라우저에 맡긴다.
 */
export function hardGo(e: MouseEvent<HTMLAnchorElement>, href: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  clearAllState();
  const path = href === "/" ? "/" : STATIC ? `${href.replace(/\/+$/, "")}/` : href;
  window.location.assign(`${base}${path}`);
}
