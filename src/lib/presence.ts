"use client";

import { useEffect, useState } from "react";

/**
 * 실시간 이용자 수: 사이트를 연 브라우저가 1분마다 중계 서버(worker/corp-lookup ?presence=)에 신호를 보내고,
 * 서버는 최근 2분 30초 안에 신호를 보낸 브라우저 수를 돌려준다. 탭을 가려 두면 신호를 멈춘다.
 * 정적 사이트에 중계 서버 주소가 없으면(로컬·서버 배포) 끄고 null 을 돌려준다.
 */
export const RELAY_API = process.env.NEXT_PUBLIC_STATIC_SITE === "1" ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";

const BEAT_MS = 60_000;
let count: number | null = null;
let started = false;
const subs = new Set<(n: number | null) => void>();

/** 브라우저마다 하나인 임의 ID (개인정보 없음). 저장소를 못 쓰면 이 탭에서만 쓰는 ID */
function browserId(): string {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
  try {
    let id = localStorage.getItem("bm-presence");
    if (!id || !/^[a-z0-9]{8,40}$/.test(id)) {
      id = fresh();
      localStorage.setItem("bm-presence", id);
    }
    return id;
  } catch {
    return fresh();
  }
}

export function startPresence() {
  if (started || !RELAY_API || typeof window === "undefined") return;
  started = true;
  const id = browserId();
  const beat = async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const r = await fetch(`${RELAY_API}?presence=${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const n = (await r.json()).count;
      if (typeof n === "number") {
        count = Math.max(1, n);
        subs.forEach((f) => f(count));
      }
    } catch {
      /* 신호 실패는 무시: 다음 차례에 다시 보낸다 */
    }
  };
  void beat();
  setInterval(beat, BEAT_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void beat(); });
}

/** 사이트 어느 화면에서든 신호를 보낸다 (레이아웃에 한 번) */
export function PresenceBeacon() {
  useEffect(() => startPresence(), []);
  return null;
}

/** 지금 이용자 수. 아직 모르거나 꺼져 있으면 null */
export function usePresence(): number | null {
  const [n, setN] = useState<number | null>(count);
  useEffect(() => {
    startPresence();
    subs.add(setN);
    setN(count);
    return () => { subs.delete(setN); };
  }, []);
  return n;
}
