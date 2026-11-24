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

  const awardTotal = (awardRows ?? 0) + aptAwards;
  const items: [string, number][] = [
    ...(noticeRows ? [["누적입찰공고", noticeRows + aptNotices] as [string, number]] : []),
    ...(awardTotal ? [["누적낙찰정보", awardTotal] as [string, number]] : []),
  ];
  // 칸 수에 맞춘 넓은 화면 열 (모르는 값은 칸째 뺀다)
  const cols = ["sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3"][items.length];

  // 휴대폰: 날짜 한 줄 + 누적 두 칸, 넓은 화면: 세 칸 한 줄
  return (
    <div className={`mx-auto mt-8 grid max-w-3xl grid-cols-2 overflow-hidden rounded-2xl border border-mint-100 bg-white shadow-card ${cols}`} aria-live="polite">
      <div className={`flex flex-col justify-center px-4 py-3.5 sm:px-6 sm:py-5 ${items.length ? "col-span-2 border-b border-ink-100 sm:col-span-1 sm:border-b-0 sm:border-r" : "col-span-2 sm:col-span-1"}`}>
        <p className="text-xs font-semibold text-ink-400">금일기준</p>
        <p className="mt-1 text-base font-bold tabular-nums text-ink-800 sm:text-xl">{kstToday(now)}</p>
      </div>
      {items.map(([k, v], i) => (
        <div key={k} className={`min-w-0 px-4 py-3.5 sm:px-6 sm:py-5 ${i < items.length - 1 ? "border-r border-ink-100" : ""}`}>
          <p className="text-xs font-semibold text-mint-600">{k}</p>
          <p className="mt-1 whitespace-nowrap text-[clamp(1.25rem,5.6vw,1.75rem)] font-extrabold tracking-tight tabular-nums text-mint-700 sm:text-[28px]">
            {v.toLocaleString("ko-KR")}<span className="ml-0.5 text-sm font-bold text-ink-400">건</span>
          </p>
        </div>
      ))}
    </div>
  );
}
