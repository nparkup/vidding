import type { Digest } from "@/lib/digest";
import { date, dday, won } from "@/lib/format";

/** 영업일 아침 맞춤 공고 요약 이메일 미리보기 */
export function EmailPreview({ digest, compact = false }: { digest: Digest; compact?: boolean }) {
  const { client, recommended, closingSoon, newToday, excluded } = digest;
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
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-mint-50 p-3">
            <p className="text-xl font-extrabold text-mint-600">{newToday}</p>
            <p className="text-[11px] text-ink-500">신규 적합 공고</p>
          </div>
          <div className="rounded-xl bg-coral-100/60 p-3">
            <p className="text-xl font-extrabold text-coral">{closingSoon.length}</p>
            <p className="text-[11px] text-ink-500">3일 내 마감</p>
          </div>
          <div className="rounded-xl bg-paper p-3">
            <p className="text-xl font-extrabold text-ink-500">{excluded}</p>
            <p className="text-[11px] text-ink-500">조건 불일치 제외</p>
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
        {!compact && (
          <p className="mt-4 rounded-xl bg-paper p-3 text-xs leading-relaxed text-ink-500">
            각 공고의 참가조건과 제출서류 체크리스트는 공고명을 누르면 확인할 수 있습니다. 관심 공고로 표시하시면 담당 매니저가 서류 준비를 도와드립니다.
          </p>
        )}
      </div>
    </div>
  );
}
