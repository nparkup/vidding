"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 페이지 조회 수 (관리자 화면 트래픽). 화면을 옮길 때마다 중계 서버에 경로 하나만 보낸다.
 * 쿠키·브라우저 ID를 만들지 않고, 처음 들어온 화면에서만 유입 사이트 주소를 함께 보낸다(서버는 호스트 이름만 남긴다).
 */
export function PageBeacon() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_CORP_API;
    if (!api || !path || path.startsWith("/admin")) return;
    const q = new URLSearchParams({ pv: "1", p: path });
    if (first.current && document.referrer) {
      try { if (new URL(document.referrer).host !== location.host) q.set("r", document.referrer); } catch { /* 무시 */ }
    }
    first.current = false;
    try {
      if (!navigator.sendBeacon?.(`${api}?${q}`)) fetch(`${api}?${q}`, { method: "POST", keepalive: true, mode: "cors" }).catch(() => undefined);
    } catch { /* 무시 */ }
  }, [path]);
  return null;
}
