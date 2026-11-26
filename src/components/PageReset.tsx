"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { clearSavedState, keptUrl } from "@/lib/resetOnReload";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

/**
 * 다른 화면으로 옮기면 떠난 화면을 처음 상태로 돌린다.
 * - 화면 안의 선택·입력(예: 입찰점수 예측에서 고른 공고)은 화면을 옮기면 React가 지운다.
 * - 화면마다 브라우저에 저장해 둔 마지막 조회 조건(bidmate.*)은 여기서 지운다.
 *   새 화면이 저장 값을 읽기 전에 지워야 해서, 화면 내용보다 앞에 두고 그리는 중에 지운다.
 * - 뒤로·앞으로 가기로 다른 화면에 돌아가면 주소에 남아 있던 조건(?…, #…)도 지운다 (공고 상세 번호는 남김).
 *   Next 라우터보다 먼저 주소를 고쳐야 해서 popstate 를 캡처 단계에서 받는다.
 * - 같은 화면 안에서 조건을 바꾸며 생긴 뒤로 가기(예: 공고 검색 조건)는 그대로 둔다.
 */
export function PageReset({ children }: { children: React.ReactNode }) {
  const path = clean(usePathname() || "/");
  const prev = useRef(path);
  if (prev.current !== path) {
    prev.current = path;
    if (typeof window !== "undefined") clearSavedState();
  }
  const shown = useRef(path);
  shown.current = path;

  useEffect(() => {
    const onPop = () => {
      const now = location.pathname;
      const rel = clean(base && now.startsWith(base) ? now.slice(base.length) || "/" : now);
      if (rel === shown.current) return;
      if (/\/admin(\/|$)/.test(rel)) return;
      if (!location.search && !location.hash) return;
      history.replaceState(history.state, "", keptUrl(now, location.search));
    };
    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, []);

  return <>{children}</>;
}
