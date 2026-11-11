import type { Digest } from "@/lib/digest";
import type { MatchResult } from "@/lib/analysis";
import { dday, won } from "@/lib/format";
import { GradeBadge, ScoreBar } from "../Badges";

/** 히어로 아래 큰 제품 화면 미리보기 (실제 공고 데이터로 채움) */
export function ProductMockup({ digest, top }: { digest: Digest; top?: MatchResult }) {
  const menu = [
    { t: "오늘의 공고", on: true, n: digest.recommended.length },
    { t: "관심 공고" },
    { t: "서류 체크리스트" },
    { t: "주간 보고서" },
    { t: "알림 설정" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white text-left shadow-lift sm:rounded-3xl">
      {/* 브라우저 바 */}
      <div className="flex items-center gap-2 border-b border-ink-100 bg-paper px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="mx-auto hidden w-1/2 truncate rounded-lg bg-white px-3 py-1 text-center text-xs text-ink-400 ring-1 ring-ink-100 sm:block">
          입찰파트너 · {digest.client.company} 전용 공고함
        </span>
      </div>

      <div className="grid md:grid-cols-[200px_1fr] lg:grid-cols-[200px_1fr_280px]">
        {/* 사이드바 */}
        <aside className="hidden border-r border-ink-100 p-4 md:block">
          <p className="px-2 text-[11px] font-semibold text-ink-300">메뉴</p>
          <ul className="mt-2 space-y-1 text-sm">
            {menu.map(({ t, on, n }) => (
              <li key={t} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${on ? "bg-mint-50 font-semibold text-mint-700" : "text-ink-500"}`}>
                <span className="flex-1">{t}</span>
                {n !== undefined && <span className="rounded-full bg-mint px-1.5 text-[11px] font-bold text-white">{n}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl bg-ink p-3 text-white">
            <p className="text-[11px] text-ink-300">담당 매니저</p>
            <p className="mt-0.5 text-sm font-semibold">입찰파트너 매니저</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-200">관심 공고 서류를 마감 전 함께 확인해 드려요.</p>
          </div>
        </aside>

        {/* 본문 */}
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ink-400">오전 7:00 업데이트</p>
              <p className="font-bold">오늘의 맞춤 공고</p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-xl border border-ink-100 px-3 py-1.5 text-xs text-ink-400 sm:flex">
              공고명·기관 검색
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["신규 적합", digest.newToday, "text-mint-600 bg-mint-50"],
              ["3일 내 마감", digest.closingSoon.length, "text-coral bg-coral-100/60"],
              ["조건 불일치 제외", digest.excluded, "text-ink-500 bg-paper"],
            ].map(([k, v, c]) => (
              <div key={String(k)} className={`rounded-xl p-3 ${c}`}>
                <p className="text-xl font-extrabold tabular-nums sm:text-2xl">{v}</p>
                <p className="text-[11px] text-ink-500">{k}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-100">
            {digest.recommended.slice(0, 4).map((r, i) => (
              <li key={r.bid.id} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${i === 0 ? "bg-mint-50/50" : ""}`}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.bid.title}</span>
                  <span className="block truncate text-xs text-ink-400">{r.bid.demandAgency} · {won(r.bid.baseAmount)} · 마감 {dday(r.daysLeft)}</span>
                </span>
                <GradeBadge grade={r.grade} />
              </li>
            ))}
          </ul>
        </div>

        {/* 우측 분석 패널 */}
        {top && (
          <div className="hidden border-l border-ink-100 bg-paper/60 p-5 lg:block">
            <p className="text-xs text-ink-400">입찰 가능성</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-5xl font-extrabold leading-none tracking-tight text-mint-600">{top.score}</p>
              <GradeBadge grade={top.grade} />
            </div>
            <p className="mt-3 line-clamp-2 text-sm font-semibold">{top.bid.title}</p>
            <ul className="mt-4 space-y-3">
              {top.factors.slice(0, 5).map((f) => (
                <li key={f.label}>
                  <p className="mb-1 text-xs font-semibold text-ink-500">{f.label}</p>
                  <ScoreBar value={f.score} max={f.max} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
