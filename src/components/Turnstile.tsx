"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile 로봇 확인 위젯. 사이트 키(NEXT_PUBLIC_TURNSTILE_SITE_KEY, 저장소 변수 TURNSTILE_SITE_KEY)가 없으면 아무것도 그리지 않는다.
 * 폼 안에 두면 위젯이 숨은 입력 cf-turnstile-response 를 만든다. 보낼 때 FormData 에서 그 값을 turnstile 로 실어 보낸다.
 * 토큰은 한 번만 쓸 수 있어, 실패한 뒤 다시 보내려면 resetKey 를 바꿔 새 토큰을 받는다.
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const turnstileToken = (f: FormData) => String(f.get("cf-turnstile-response") ?? "");

type TS = { render(el: HTMLElement, o: Record<string, unknown>): string; reset(id?: string): void; remove(id: string): void };
declare global { interface Window { turnstile?: TS } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

export function Turnstile({ resetKey = 0 }: { resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile || id.current) return;
      id.current = window.turnstile.render(box.current, { sitekey: TURNSTILE_SITE_KEY, language: "ko", theme: "light", "response-field-name": "cf-turnstile-response" });
    }).catch(() => undefined);
    return () => {
      gone = true;
      if (id.current && window.turnstile) { try { window.turnstile.remove(id.current); } catch { /* 무시 */ } }
      id.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && id.current && window.turnstile) { try { window.turnstile.reset(id.current); } catch { /* 무시 */ } }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
