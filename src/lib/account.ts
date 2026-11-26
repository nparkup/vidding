"use client";

/**
 * 회원 로그인 (중계 서버 worker/corp-lookup/account.ts, ?account=).
 * - 로그인하면 30일 토큰을 이 브라우저(localStorage bm-auth.v1)에 둔다. bidmate. 접두어가 아니어서 새로고침 초기화에 지워지지 않는다.
 * - 비밀번호는 서버로만 보내고 브라우저에 저장하지 않는다.
 * - 로그인하면 사업자번호를 bm-member.v1 에도 적어(member.ts) 기존 화면(입찰점수 예측의 사업자번호 칸)이 그대로 쓰게 한다.
 * - 정적 배포(GitHub Pages)에서만 동작한다. 중계 서버 주소가 없으면 로그인 화면이 안내만 보여 준다.
 */
import { useEffect, useSyncExternalStore } from "react";
import { saveMember } from "./member";
import { loadMyBox, MYBOX_EVENT, MYBOX_KEY, type MyBoxItem } from "./mybox";
import type { PaidPlanId, WithdrawInfo } from "./usagePeriod";

export const ACCOUNT_API = process.env.NEXT_PUBLIC_STATIC_SITE === "1" ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";
export const AUTH_KEY = "bm-auth.v1";
const EVENT = "bm-auth";

export interface UseEntry { k: string; t: number; title?: string }

export interface AccountMember {
  company: string;
  bizno: string;
  name: string;
  email: string;
  phone: string;
  licenses?: string[];
  regions?: string[];
  size?: string;
  keywords?: string;
  agreeMail?: boolean;
  joinedAt?: string;
  status?: "active" | "suspended";
  /** 탈퇴 예약 (이용권 마지막 날까지 쓰고 다음 날 지운다) */
  withdraw?: WithdrawInfo;
  login: { email: string; lastLogin: string | null; temp: boolean } | null;
}

export type Usage =
  | { mode: "paid"; plan: PaidPlanId; quota: number | null; base?: number | null; custom?: boolean; admin?: boolean; period: { from: string; to: string }; end: string; used: UseEntry[] }
  | { mode: "trial"; quota: number | null; base?: number | null; custom?: boolean; admin?: boolean; used: UseEntry[] };

interface Saved { token: string; exp: number; bizno: string; company: string }

export type AccountState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; bizno: string; company: string; member?: AccountMember; usage?: Usage };

const LOADING: AccountState = { status: "loading" };
let state: AccountState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(s: AccountState) {
  state = s;
  listeners.forEach((l) => l());
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* 서버 렌더링 */ }
}

function readSaved(): Saved | null {
  try {
    const j = JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null") as Saved | null;
    return j && typeof j.token === "string" && j.exp > Date.now() ? j : null;
  } catch { return null; }
}

export const authToken = () => readSaved()?.token ?? "";

/** 서버 호출. 토큰이 맞지 않으면(비밀번호 변경·탈퇴) 로그아웃한다 */
export async function accountCall<T = Record<string, unknown>>(action: string, body?: unknown): Promise<T> {
  if (!ACCOUNT_API) throw new Error("로그인 서버에 연결할 수 없습니다.");
  const token = authToken();
  let r: Response;
  try {
    r = await fetch(`${ACCOUNT_API}?account=${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (r.status === 401 && token && !["login", "claim", "signup"].includes(action)) { logout(); }
  if (!r.ok) { const e = new Error(j.error || "요청을 처리하지 못했습니다.") as Error & { code?: string; status?: number }; e.code = j.code; e.status = r.status; throw e; }
  return j;
}

/** 로그인·가입·비밀번호 변경이 돌려준 토큰을 저장한다 */
export function saveSession(r: { token: string; exp: number; member: AccountMember }) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify({ token: r.token, exp: r.exp, bizno: r.member.bizno, company: r.member.company } satisfies Saved)); } catch { /* 저장 못 하면 이 화면에서만 로그인 */ }
  saveMember({ bizno: r.member.bizno, company: r.member.company, at: Date.now() });
  set({ status: "in", bizno: r.member.bizno, company: r.member.company, member: r.member });
  refreshAccount();
  pullMyBox(true);
}

export function logout() {
  try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(MYBOX_SYNC_KEY); } catch { /* 무시 */ }
  set({ status: "out" });
}

/** 가입 정보·사용 건수 다시 받기 */
export async function refreshAccount() {
  const saved = readSaved();
  if (!saved || !ACCOUNT_API) { if (state.status !== "out") set({ status: "out" }); return; }
  try {
    const j = await accountCall<{ member: AccountMember; usage: Usage }>("me");
    set({ status: "in", bizno: j.member.bizno, company: j.member.company, member: j.member, usage: j.usage });
  } catch {
    // 연결이 안 되면 저장된 정보로 로그인 상태만 둔다
    const s = readSaved();
    if (s && state.status !== "in") set({ status: "in", bizno: s.bizno, company: s.company });
    else if (!s) set({ status: "out" });
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener(MYBOX_EVENT, onMyBoxChange);
  window.addEventListener("storage", (e) => { if (e.key === AUTH_KEY) { const s = readSaved(); set(s ? { status: "in", bizno: s.bizno, company: s.company } : { status: "out" }); } });
  const saved = readSaved();
  if (!saved) { set({ status: "out" }); return; }
  set({ status: "in", bizno: saved.bizno, company: saved.company });
  refreshAccount();
  pullMyBox(false);
}

function subscribe(l: () => void) {
  listeners.add(l);
  queueMicrotask(start);
  return () => listeners.delete(l);
}

/** 로그인 상태. 서버 렌더와 첫 그리기는 loading */
export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** 이 화면이 열릴 때 사용 건수를 다시 받는다 (내 정보·입찰점수 예측) */
export function useAccountRefresh() {
  useEffect(() => { if (readSaved()) refreshAccount(); }, []);
}

/* ---------- 내 서류함 동기화: 로그인하면 서류함을 서버에도 두어 다른 기기에서 이어 쓴다 ---------- */

const MYBOX_SYNC_KEY = "bm-mybox-sync.v1";
let pushing: ReturnType<typeof setTimeout> | null = null;
let applying = false;

function onMyBoxChange() {
  if (applying || !readSaved()) return;
  if (pushing) clearTimeout(pushing);
  pushing = setTimeout(() => {
    pushing = null;
    accountCall<{ at: number }>("mybox", { items: loadMyBox() })
      .then((r) => { try { localStorage.setItem(MYBOX_SYNC_KEY, String(r.at)); } catch { /* 무시 */ } })
      .catch(() => undefined);
  }, 800);
}

/** 서버 서류함 받기. 로그인 직후(merge)는 이 브라우저에 담아 둔 공고와 합친다 */
async function pullMyBox(merge: boolean) {
  if (!readSaved() || !ACCOUNT_API) return;
  try {
    const j = await accountCall<{ items: MyBoxItem[]; at: number }>("mybox");
    const local = loadMyBox();
    let items = j.items ?? [];
    if (merge) {
      const seen = new Set(items.map((x) => x.no));
      items = [...items, ...local.filter((x) => !seen.has(x.no))];
    } else {
      const last = Number(localStorage.getItem(MYBOX_SYNC_KEY) ?? 0);
      // 이 브라우저가 마지막으로 올린 뒤 서버가 바뀌지 않았으면 그대로 둔다
      if (j.at && j.at <= last) return;
      if (!j.at) items = local;
    }
    applying = true;
    try {
      localStorage.setItem(MYBOX_KEY, JSON.stringify({ v: 1, items }));
      window.dispatchEvent(new Event(MYBOX_EVENT));
    } finally { applying = false; }
    if (merge || !j.at) onMyBoxChange();
    else localStorage.setItem(MYBOX_SYNC_KEY, String(j.at));
  } catch { /* 서버에 못 가면 이 브라우저 서류함만 쓴다 */ }
}
