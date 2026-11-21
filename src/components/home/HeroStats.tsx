"use client";

import { useEffect, useState } from "react";
/** 정적 사이트의 중계 서버 주소 (낙찰 저장소 최신 건수). 없으면(로컬·서버 배포) 빌드 값만 쓴다 */
const RELAY_API = process.env.NEXT_PUBLIC_STATIC_SITE === "1" ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국 시간 기준 YYYY-MM-DD (요일) */
function kstToday(now: number): string {
  const d = new Date(now + 9 * 3600e3);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} (${WEEK[d.getUTCDay()]})`;
}

/**
 * 메인 상단 현황 줄. 날짜는 화면을 연 시각 기준으로 1분마다 다시 센다.
 * 누적입찰공고: 낙찰 저장소에 쌓인 나라장터 공고(2016~) + 아파트(K-apt) 공고(겹치는 공고번호는 한 번).
 * 누적낙찰정보: 나라장터 낙찰 저장소 누적 건수 + 아파트 입찰결과 낙찰 누적·수의계약 건수.
 * 나라장터 값은 빌드 값이고 중계 서버가 있으면 최신 값으로 바꾼다. 모르는 값은 빼고 보여 준다.
 */
export function HeroStats({ builtAt, notices, aptNotices = 0, awards, aptAwards = 0 }: {
  builtAt: number; notices: number | null; aptNotices?: number; awards: number | null; aptAwards?: number;
}) {
  const [now, setNow] = useState(builtAt);
  const [awardRows, setAwardRows] = useState(awards);
  const [noticeRows, setNoticeRows] = useState(notices);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!RELAY_API) return;
    fetch(`${RELAY_API}?awardmeta=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const n = j?.meta?.rows;
        if (typeof n === "number" && n > 0) setAwardRows(n);
        const b = j?.meta?.notices;
        if (typeof b === "number" && b > 0) setNoticeRows(b);
      })
      .catch(() => {});
  }, []);

  const fmt = (n: number) => `${n.toLocaleString("ko-KR")}건`;
  const awardTotal = (awardRows ?? 0) + aptAwards;
  const items: [string, string][] = [
    ...(noticeRows ? [["누적입찰공고", fmt(noticeRows + aptNotices)] as [string, string]] : []),
    ...(awardTotal ? [["누적낙찰정보", fmt(awardTotal)] as [string, string]] : []),
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
