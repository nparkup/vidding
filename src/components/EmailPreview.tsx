import type { Digest } from "@/lib/digest";
import { date, dday, won } from "@/lib/format";
import { changeSummary } from "@/lib/noticeChanges";

/** 영업일 아침 맞춤 공고 요약 이메일 미리보기 */
export function EmailPreview({ digest, compact = false }: { digest: Digest; compact?: boolean }) {
  const { client, recommended, closingSoon, newToday, keywords = [], changes = [] } = digest;
  const today = date(new Date().toISOString());
  return (
    <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lift">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-paper px-4 py-2.5 text-xs text-ink-500">
        <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-mint/70" />
        <span className="ml-2 truncate">받은편지함 · 오전 7:00</span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="text-xs text-ink-300">보낸사람 입찰메이트LAB &lt;daily@ipchalmatelab.kr&gt;</p>
        <p className="mt-1 font-bold">[입찰메이트LAB] {today} {client.company} 맞춤 공고 {recommended.length}건</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-mint-50 p-3">
            <p className="text-xl font-extrabold text-mint-600">{newToday}</p>
            <p className="text-[11px] text-ink-500">신규 적합 공고</p>
          </div>
          <div className="rounded-xl bg-coral-100/60 p-3">
            <p className="text-xl font-extrabold text-coral">{closingSoon.length}</p>
            <p className="text-[11px] text-ink-500">3일 내 마감</p>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold">오늘의 추천 공고</p>
        <ol className="mt-2 divide-y divide-ink-100">
          {recommended.slice(0, compact ? 3 : 5).map((r, i) => (
            <li key={r.bid.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.bid.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {r.bid.demandAgency} · {won(r.bid.baseAmount)} · {r.bid.contractMethod}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    <span className="font-semibold text-mint-600">가능성 {r.grade}등급({r.score}점)</span> · 마감 {dday(r.daysLeft)} ·{" "}
                    {r.bid.region === "전국" ? "지역제한 없음" : `${r.bid.region} 제한`}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {recommended.length === 0 && <li className="py-3 text-sm text-ink-500">오늘은 조건에 맞는 신규 공고가 없습니다.</li>}
        </ol>
        {!compact && changes.length > 0 && (
          <>
            <p className="mt-5 text-sm font-semibold">관심·추천 공고 정정·취소 {changes.length}건</p>
            <ul className="mt-2 divide-y divide-ink-100">
              {changes.slice(0, 3).map((w) => (
                <li key={`${w.change.no}-${w.change.ord}`} className="py-2.5">
                  <p className="text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${w.change.kind === "취소" ? "bg-coral-100 text-coral" : "bg-amber-100 text-ink"}`}>{w.change.kind === "취소" ? "취소" : `정정 ${Number(w.change.ord)}차`}</span>
                    <span className="ml-1.5 text-ink-300">{w.reason}</span>
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold">{w.change.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{changeSummary(w.change)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {!compact && keywords.length > 0 && (
          <>
            <p className="mt-5 text-sm font-semibold">관심 키워드 공고</p>
            <ul className="mt-2 space-y-2">
              {keywords.map((k) => (
                <li key={k.keyword} className="rounded-xl border border-ink-100 p-3">
                  <p className="text-xs"><b className="text-sm text-ink">{k.keyword}</b> <span className="text-ink-500">새 공고 {k.fresh}건 · 진행 중 {k.total}건</span></p>
                  {k.items.slice(0, 2).map((r) => (
                    <p key={r.bid.id} className="mt-1.5 truncate text-xs text-ink-500">
                      <span className="font-semibold text-ink">{r.bid.title}</span> · {won(r.bid.baseAmount)} · {r.eligible ? <span className="text-mint-600">참가 가능</span> : <span className="text-coral">조건 확인</span>}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
        {!compact && (
          <p className="mt-4 rounded-xl bg-paper p-3 text-xs leading-relaxed text-ink-500">
            각 공고의 참가조건과 제출서류 체크리스트는 공고명을 누르면 확인할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}
