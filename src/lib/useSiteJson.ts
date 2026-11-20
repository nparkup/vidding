"use client";

import { useEffect, useState } from "react";
import type { NoticeChangesFile } from "./noticeChanges";
import type { RateTable } from "./rateTable";

const cache = new Map<string, Promise<unknown>>();

/** 빌드 때 만든 공용 JSON 파일을 한 번만 받는다 (정적·서버 배포 공용) */
export function loadSiteJson<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(file, fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${file}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .catch((e) => { cache.delete(file); throw e; }));
  }
  return cache.get(file) as Promise<T>;
}

function useSiteJson<T>(file: string): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadSiteJson<T>(file).then((d) => alive && setData(d)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [file]);
  return { data, error };
}

/** 최근 정정·취소 공고 */
export const useNoticeChanges = () => useSiteJson<NoticeChangesFile>("notice-changes.json");
/** 발주 기준·금액 구간별 낙찰하한율 집계 (없으면 null) */
export const useRateTable = () => useSiteJson<RateTable | null>("rate-table.json");

/** 관심공고 서류함(localStorage "bidmate.mybox.v1")에 담긴 공고번호. 서류함이 없거나 읽을 수 없으면 빈 집합 */
export function useMyBoxNos(): Set<string> {
  const [nos, setNos] = useState<Set<string>>(new Set());
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("bidmate.mybox.v1");
        const items = raw ? (JSON.parse(raw) as { items?: { no?: string; id?: string }[] }).items ?? [] : [];
        setNos(new Set(items.map((i) => i.no ?? i.id?.split("-")[0] ?? "").filter(Boolean)));
      } catch {
        setNos(new Set());
      }
    };
    read();
    window.addEventListener("bidmate:mybox", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("bidmate:mybox", read); window.removeEventListener("storage", read); };
  }, []);
  return nos;
}
