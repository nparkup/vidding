"use client";

/** 관리자 화면이 중계 서버(worker/corp-lookup/admin.ts)를 부르는 공통 함수와 자료형 */

import type { LimitInfo, LimitOverride } from "@/lib/usagePeriod";

export type MemberQuota = LimitInfo & { used: number };

export interface TrialUse { k: string; t: number }
export interface Payment { id: string; date: string; kind: "pay" | "refund"; amount: number; method: string; memo: string }
export interface Billing {
  /** 이용권 (lite·standard). unlimited·monthly·annual은 예전 요금제로 남은 기록 */
  plan: "" | "lite" | "standard" | "unlimited" | "monthly" | "annual";
  status: "none" | "active" | "cancelled" | "expired" | "refunded";
  start: string;
  end: string;
  memo: string;
  payments: Payment[];
  updatedAt?: string;
}
export interface Member {
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
  plan?: string;
  joinedAt?: string;
  updatedAt?: string;
  status?: "active" | "suspended";
  memo?: string;
  trial: TrialUse[];
  billing?: Billing | null;
  /** 로그인 계정 (비밀번호를 정했으면). 비밀번호 해시는 서버가 보내지 않는다 */
  login?: { email: string; setAt: string; lastLogin: string | null; temp: boolean } | null;
  /** 관리자가 정한 회원별 개별 이용 한도 (없으면 요금제 기본 한도) */
  limit?: LimitOverride | null;
  /** 지금 요금제·적용 한도·이번 기간 공고 예측 사용 건수 (무료 체험은 누적). 예전 중계 서버 응답에는 없다 */
  quota?: MemberQuota | null;
  /** 사업자번호를 넣은 조회가 마지막으로 온 때(ms)와 누적 횟수 (지표 수집 시작 뒤부터) */
  seen?: { last: number; n: number } | null;
}

export class AuthError extends Error {}

export type AdminCall = <T = unknown>(action: string, opts?: { params?: Record<string, string>; body?: unknown }) => Promise<T>;

export function makeCall(api: string, token: string): AdminCall {
  return async <T,>(action: string, opts: { params?: Record<string, string>; body?: unknown } = {}) => {
    if (!api) throw new Error("중계 서버 주소가 없습니다.");
    const q = new URLSearchParams({ admin: action, ...(opts.params ?? {}) });
    let r: Response;
    try {
      r = await fetch(`${api}?${q}`, {
        method: opts.body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: "no-store",
      });
    } catch {
      throw new Error("중계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (r.status === 401) throw new AuthError("로그인 시간이 지났습니다. 다시 로그인해 주세요.");
    if (!r.ok) throw new Error(j.error ?? `요청이 실패했습니다 (${r.status})`);
    return j;
  };
}

export const SIZE_LABEL: Record<string, string> = {
  "0-100000000": "1억 이하",
  "50000000-500000000": "5천만 ~ 5억",
  "300000000-2000000000": "3억 ~ 20억",
  "1000000000-10000000000": "10억 이상",
};
export const bizFmt = (b: string) => (b.length === 10 ? `${b.slice(0, 3)}-${b.slice(3, 5)}-${b.slice(5)}` : b);
export const dt = (iso?: string | number | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 엑셀에서 한글이 깨지지 않게 BOM을 붙여 CSV를 내려받는다 */
export function downloadCsv(name: string, head: string[], rows: (string | number)[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = [head, ...rows].map((r) => r.map((v) => esc(String(v ?? ""))).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
