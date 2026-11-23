import { MYBOX_ENABLED, MYBOX_KEY } from "@/lib/mybox";
/** src/lib/siteConfig.ts CACHE_KEY 와 같게 (그 파일은 "use client" 라 여기서 가져오지 않는다) */
const SITE_CONFIG_KEY = "bm-site-config.v1";
/** src/lib/account.ts AUTH_KEY 와 같게: 로그인한 회원은 서류함이 켜지므로 체크 표시도 남긴다 */
const AUTH_KEY = "bm-auth.v1";

/**
 * 새로고침하면 화면에서 고르거나 조회했던 것을 모두 처음 상태로 돌린다.
 * - 공고 검색 조건·정렬, 평가점수 예측에서 고른 공고, 발주처·경쟁사 조회 같은 주소(?…, #…) 값을 지운다.
 *   단 공고 상세(/bids/view?id=, /apt-bids/view?no=)는 그 값이 있어야 화면이 뜨므로 공고번호만 남긴다.
 * - 화면마다 브라우저에 저장해 두던 마지막 조회 조건(bidmate.* , 제출서류 체크 표시)을 지운다.
 *   관심공고 서류함(MYBOX_KEY)은 사용자가 담은 자료라 남기고, 서류함이 켜져 있으면 체크 표시도 남긴다.
 * - 링크를 눌러 들어온 첫 화면(예: 공고 카드에서 점수 예측으로)은 그대로 둔다. 새로고침(reload)일 때만 동작한다.
 * - 관리자 화면(/admin)은 건드리지 않는다.
 * React가 주소를 읽기 전에 돌아야 하므로 <head>의 인라인 스크립트로 넣는다.
 */
const KEEP_PARAMS: Record<string, string[]> = { "/bids/view": ["id"], "/apt-bids/view": ["no"], "/contracts/view": ["no"] };

/**
 * mode
 * - "reload": 새로고침일 때만 저장 값과 주소 값을 지운다 (<head> 인라인 스크립트)
 * - "all": 언제든 저장 값과 주소 값을 지운다 (헤더 로고·같은 메뉴를 다시 눌렀을 때)
 * - "storage": 저장 값만 지운다 (다른 화면으로 이동할 때, src/components/PageReset.tsx)
 */
function run(keep: Record<string, string[]>, keepMybox: string, clearChecklist: boolean, configKey: string, authKey: string, mode: "reload" | "all" | "storage") {
  try {
    if (mode === "reload") {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const legacy = (performance as unknown as { navigation?: { type: number } }).navigation;
      const isReload = nav ? nav.type === "reload" : legacy?.type === 1;
      if (!isReload) return;
    }
    const path = location.pathname.replace(/\/+$/, "");
    if (/\/admin(\/|$)/.test(path)) return;

    const ls = window.localStorage;
    // 관리자 화면 페이지 설정에서 서류함을 켰으면 체크도 남긴다 (마지막으로 받은 설정)
    try { if ((JSON.parse(ls.getItem(configKey) ?? "null") as { features?: { mybox?: boolean } } | null)?.features?.mybox) clearChecklist = false; } catch { /* 무시 */ }
    if (ls.getItem(authKey)) clearChecklist = false;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (!k || k === keepMybox) continue;
      if (k.startsWith("bidmate.") || (clearChecklist && k.startsWith("checklist:"))) ls.removeItem(k);
    }

    if (mode !== "storage" && (location.search || location.hash)) {
      const page = Object.keys(keep).find((p) => path.endsWith(p));
      const src = new URLSearchParams(location.search);
      const out = new URLSearchParams();
      for (const name of page ? keep[page] : []) {
        const v = src.get(name);
        if (v !== null) out.set(name, v);
      }
      const qs = out.toString();
      history.replaceState(history.state, "", location.pathname + (qs ? `?${qs}` : ""));
    }
  } catch {
    /* 초기화에 실패해도 화면은 그대로 뜬다 */
  }
}

const args = [KEEP_PARAMS, MYBOX_KEY, !MYBOX_ENABLED, SITE_CONFIG_KEY, AUTH_KEY] as const;

export const resetOnReloadScript = `(${run.toString()})(${args.map((a) => JSON.stringify(a)).join(",")},"reload");`;

/** 화면마다 저장해 둔 마지막 조회 조건을 지운다 (서류함·로그인은 남김). 다른 화면으로 이동할 때 쓴다 */
export function clearSavedState() {
  run(...args, "storage");
}

/** 저장 값과 주소 값(공고 상세 번호만 남김)을 모두 지운다 */
export function clearAllState() {
  run(...args, "all");
}

/** 주소에서 지우지 않고 남길 값 (공고 상세 번호). 주소 문자열을 받아 정리한 주소를 돌려준다 */
export function keptUrl(pathname: string, search: string): string {
  const path = pathname.replace(/\/+$/, "");
  const page = Object.keys(KEEP_PARAMS).find((p) => path.endsWith(p));
  const src = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const name of page ? KEEP_PARAMS[page] : []) {
    const v = src.get(name);
    if (v !== null) out.set(name, v);
  }
  const qs = out.toString();
  return pathname + (qs ? `?${qs}` : "");
}
