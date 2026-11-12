"use client";

import { useEffect } from "react";

/**
 * 정적 배포에서 예전 공고 주소(/bids/공고번호-차수/)로 들어오면 /bids/view?id=... 로 옮긴다.
 * GitHub Pages는 없는 주소에 404.html을 보여 주므로 여기서 처리한다.
 */
export function LegacyBidRedirect() {
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const path = location.pathname.slice(base.length);
    const m = path.match(/^\/bids\/([^/]+)\/?$/);
    if (!m || m[1] === "view") return;
    const qs = new URLSearchParams(location.search);
    qs.set("id", decodeURIComponent(m[1]));
    location.replace(`${base}/bids/view/?${qs}`);
  }, []);
  return null;
}
