"use client";

import { useEffect, useState } from "react";
import { RELAY_API, usePresence } from "@/lib/presence";

/** 마감 시각 목록을 분 단위로 묶은 것: 마감 시각(분, base 기준) 오름차순과 그때 마감하는 공고 수 */
export interface CloseMarks { base: number; at: number[]; n: number[] }

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국 시간 기준 YYYY-MM-DD (요일) */
function kstToday(now: number): string {
  const d = new Date(now + 9 * 3600e3);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} (${WEEK[d.getUTCDay()]})`;
}

/** 지금 마감 전인 공고 수 */
function openCount(m: CloseMarks, now: number): number {
  const min = Math.floor(now / 60_000) - m.base;
  let s = 0;
  for (let i = m.at.length - 1; i >= 0 && m.at[i] > min; i--) s += m.n[i];
  return s;
}

/**
 * 메인 상단 현황 줄. 날짜와 입찰공고 수는 화면을 연 시각 기준으로 1분마다 다시 센다(빌드 때 받은 공고의 마감 시각으로).
 * 낙찰정보는 낙찰 저장소 누적 건수(빌드 값, 중계 서버가 있으면 최신 값), 이용자 수는 중계 서버가 센 값이다. 모르는 값은 빼고 보여 준다.
 */
export function HeroStats({ marks, builtAt, awards }: { marks: CloseMarks; builtAt: number; awards: number | null }) {
  const [now, setNow] = useState(builtAt);
  const [awardRows, setAwardRows] = useState(awards);
  const users = usePresence();

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!RELAY_API) return;
    fetch(`${RELAY_API}?awardmeta=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const n = j?.meta?.rows; if (typeof n === "number" && n > 0) setAwardRows(n); })
      .catch(() => {});
  }, []);

  const items: [string, string][] = [
    ["입찰공고", `${openCount(marks, now).toLocaleString("ko-KR")}건`],
    ...(awardRows ? [["낙찰정보", `${awardRows.toLocaleString("ko-KR")}건`] as [string, string]] : []),
    ...(users !== null ? [["실시간 이용자수", `${users.toLocaleString("ko-KR")}명`] as [string, string]] : []),
  ];

  return (
    <p className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] text-ink-500 sm:text-sm" aria-live="polite">
      <span className="whitespace-nowrap">
        금일기준 <b className="font-semibold text-ink-700 tabular-nums">{kstToday(now)}</b>,
      </span>
      {items.map(([k, v], i) => (
        <span key={k} className="whitespace-nowrap">
          {k} <b className="font-bold text-mint-700 tabular-nums">{v}</b>{i < items.length - 1 ? "," : ""}
        </span>
      ))}
    </p>
  );
}
