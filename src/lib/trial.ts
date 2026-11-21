"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * 무료 체험: 유료 분석(평가점수 예측 나라장터·아파트, 배점표 판독, 낙찰 결과로 본 예측)을 입찰공고 3건까지 무료로 쓴다.
 * - 로그인이 아직 없어서 브라우저(localStorage)에 분석한 공고를 적어 둔다. 이미 분석한 공고는 다시 열어도 차감하지 않는다.
 * - 나라장터 예측에서 사업자번호를 조회하면 중계 서버(?trial=)에도 그 사업자번호로 쓴 공고를 남겨,
 *   다른 브라우저에서 같은 사업자번호로 3건을 넘게 쓰지 못하게 한다.
 * - 키는 bidmate. 접두어가 아니어서 새로고침 초기화(resetOnReload)에 지워지지 않는다.
 * - 로그인·결제가 생기면 유료 회원은 이 제한을 건너뛰게 바꾼다.
 */
export const TRIAL_LIMIT = 3;
export const TRIAL_KEY = "bm-trial.v1";
const EVENT = "bm-trial";

export interface TrialEntry {
  /** "nara:공고ID" 또는 "apt:입찰번호" */
  k: string;
  /** 처음 분석한 시각 (ms) */
  t: number;
  /** 화면에 보여 줄 공고명 */
  title?: string;
}

export type TrialState =
  | { status: "ok"; used: TrialEntry[]; left: number; fresh: boolean }
  | { status: "locked"; used: TrialEntry[] };

export function readTrial(): TrialEntry[] {
  try {
    const j = JSON.parse(localStorage.getItem(TRIAL_KEY) ?? "null") as { v: 1; bids: TrialEntry[] } | null;
    return Array.isArray(j?.bids) ? j.bids.filter((b) => typeof b?.k === "string" && typeof b?.t === "number") : [];
  } catch {
    return [];
  }
}

function writeTrial(bids: TrialEntry[]) {
  try {
    localStorage.setItem(TRIAL_KEY, JSON.stringify({ v: 1, bids }));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* 저장하지 못해도 화면은 그대로 */ }
}

/** 먼저 분석한 순서로 3건까지가 체험으로 쓸 수 있는 공고 */
export function allowedTrial(list: TrialEntry[]): TrialEntry[] {
  return [...list].sort((a, b) => a.t - b.t).slice(0, TRIAL_LIMIT);
}

export function judgeTrial(list: TrialEntry[], key: string): TrialState & { add?: boolean } {
  const allowed = allowedTrial(list);
  if (allowed.some((e) => e.k === key)) return { status: "ok", used: allowed, left: TRIAL_LIMIT - allowed.length, fresh: false };
  if (!list.some((e) => e.k === key) && allowed.length < TRIAL_LIMIT) {
    return { status: "ok", used: allowed, left: TRIAL_LIMIT - allowed.length - 1, fresh: true, add: true };
  }
  return { status: "locked", used: allowed };
}

/** 서버가 알려 준 사용 목록을 브라우저 목록에 합친다 (같은 공고는 먼저 쓴 시각으로) */
export function mergeTrial(server: TrialEntry[]) {
  const map = new Map(readTrial().map((e) => [e.k, e]));
  for (const s of server) {
    const cur = map.get(s.k);
    if (!cur || s.t < cur.t) map.set(s.k, { ...s, title: cur?.title ?? s.title });
  }
  writeTrial([...map.values()]);
}

/**
 * 공고 하나를 체험으로 열 수 있는지. key가 없으면(공고를 고르기 전) null.
 * 새 공고를 열면 그 자리에서 1건을 차감한다.
 */
export function useTrial(key: string | null, title?: string): TrialState | null {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    const on = () => setVer((v) => v + 1);
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  // 공고 목록은 브라우저에서 받은 뒤에야 key가 생기므로 여기서 localStorage를 읽어도 서버 렌더와 어긋나지 않는다
  const judged = useMemo(() => (key && typeof window !== "undefined" ? judgeTrial(readTrial(), key) : null), [key, ver]);
  useEffect(() => {
    if (!key || !judged?.add) return;
    writeTrial([...readTrial(), { k: key, t: Date.now(), title }]);
  }, [key, judged, title]);
  if (!judged) return null;
  return judged.status === "ok" ? { status: "ok", used: judged.used, left: judged.left, fresh: judged.fresh } : { status: "locked", used: judged.used };
}

/**
 * 사업자번호 기준 사용 건수를 중계 서버에 맞춘다. 서버가 없거나 실패하면 브라우저 기준만 쓴다.
 * 보내는 값은 사업자번호와 공고 키(공고번호)뿐이다.
 */
export async function syncTrialServer(api: string, bizno: string, key: string): Promise<void> {
  if (!api || !/^\d{10}$/.test(bizno)) return;
  const mine = allowedTrial(readTrial()).map((e) => e.k);
  const keys = [...new Set([...mine, key])];
  try {
    const r = await fetch(`${api}?${new URLSearchParams({ trial: bizno, bids: keys.join(",") })}`);
    if (!r.ok) return;
    const j = (await r.json()) as { used?: { k: string; t: number }[] };
    if (Array.isArray(j.used)) mergeTrial(j.used.filter((e) => typeof e?.k === "string" && typeof e?.t === "number"));
  } catch { /* 서버 확인이 안 되면 브라우저 기준으로 둔다 */ }
}
