"use client";

import { useSyncExternalStore } from "react";

/**
 * 관리자 화면에서 고치는 사이트 설정 (공지 띠, 요금, 무료 체험 건수, 기능 켜고 끄기).
 * 중계 서버 ?config=1 (R2 config/site.json) 에서 받고, 받기 전·실패하면 코드에 적힌 기본값을 쓴다.
 * 화면은 기본값으로 먼저 그리고, 받은 값이 다르면 그 자리만 바꾼다. 마지막으로 받은 값은 이 브라우저에 두어 다음 화면부터 바로 쓴다.
 */
import { DEFAULT_CONFIG, normalizeConfig, type SiteConfig } from "./siteConfigCore";
import type { PlanId } from "./types";
export { DEFAULT_CONFIG, normalizeConfig, type SiteConfig };

const CACHE_KEY = "bm-site-config.v1";
export const CONFIG_EVENT = "bm-config";

let current: SiteConfig = DEFAULT_CONFIG;
let started = false;
const listeners = new Set<() => void>();

function set(c: SiteConfig) {
  if (JSON.stringify(c) === JSON.stringify(current)) return;
  current = c;
  listeners.forEach((l) => l());
  try { window.dispatchEvent(new Event(CONFIG_EVENT)); } catch { /* 무시 */ }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try { const c = localStorage.getItem(CACHE_KEY); if (c) set(normalizeConfig(JSON.parse(c))); } catch { /* 무시 */ }
  const api = process.env.NEXT_PUBLIC_CORP_API;
  if (!api) return;
  fetch(`${api}?config=1`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      const c = normalizeConfig(j);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* 무시 */ }
      set(c);
    })
    .catch(() => undefined);
}

/** 지금 설정값 (훅이 아닌 곳에서). 아직 받기 전이면 기본값 */
export function getSiteConfig(): SiteConfig {
  start();
  return current;
}

function subscribe(l: () => void) {
  listeners.add(l);
  // 첫 화면 그리기(하이드레이션)가 끝난 뒤에 받은 값을 반영한다
  queueMicrotask(start);
  return () => listeners.delete(l);
}

/** 화면에서 쓰는 설정값. 서버 렌더와 첫 그리기는 기본값 */
export function useSiteConfig(): SiteConfig {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_CONFIG);
}

/** 요금 값들 (VAT 포함) */
export function priceOf(c: SiteConfig) {
  const p = c.pricing;
  return { lite: p.lite, standard: p.standard, unlimited: p.unlimited, liteQuota: p.liteQuota, standardQuota: p.standardQuota };
}

/** 이용권별 금액·한 달 공고 예측 건수 (null = 무제한) */
export function plansOf(c: SiteConfig): { id: PlanId; price: number; quota: number | null }[] {
  const p = c.pricing;
  return [
    { id: "lite", price: p.lite, quota: p.liteQuota },
    { id: "standard", price: p.standard, quota: p.standardQuota },
    { id: "unlimited", price: p.unlimited, quota: null },
  ];
}
