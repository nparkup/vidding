"use client";

/**
 * 관리자 화면(/admin)에 로그인한 브라우저인지. 관리자는 공고 예측을 한도 없이, 건수 차감 없이 쓴다 (사용자 요청 2026-11-26).
 * 관리자 토큰(앞부분이 만료 시각, 12시간)은 AdminConsole 이 localStorage bm-admin-token 에 둔다.
 * 저장 값만 믿지 않고 중계 서버에 한 번 확인한다 (?admin=settings 가 200이면 진짜 관리자 토큰).
 */
import { useEffect, useState } from "react";

export const ADMIN_TOKEN_KEY = "bm-admin-token";

const api = () => process.env.NEXT_PUBLIC_CORP_API ?? "";

export function savedAdminToken(): string {
  let t = "";
  try { t = localStorage.getItem(ADMIN_TOKEN_KEY) ?? sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ""; } catch { /* 무시 */ }
  return t && Number(t.split(".")[0]) > Date.now() ? t : "";
}

let checked: { token: string; ok: boolean } | null = null;
let pending: Promise<boolean> | null = null;

async function verify(token: string): Promise<boolean> {
  if (checked?.token === token) return checked.ok;
  if (!api()) return false;
  pending ??= fetch(`${api()}?admin=settings`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
    .then((r) => r.ok)
    .catch(() => false)
    .then((ok) => { checked = { token, ok }; pending = null; return ok; });
  return pending;
}

/** null = 확인 중, true = 관리자, false = 아님 */
export function useIsAdmin(): boolean | null {
  const [v, setV] = useState<boolean | null>(() => (checked && checked.token === savedAdminToken() ? checked.ok : null));
  useEffect(() => {
    const t = savedAdminToken();
    if (!t) { setV(false); return; }
    let alive = true;
    verify(t).then((ok) => { if (alive) setV(ok); });
    return () => { alive = false; };
  }, []);
  return v;
}
