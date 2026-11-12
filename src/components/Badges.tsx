import type { Grade } from "@/lib/analysis";
import { dday } from "@/lib/format";

const GRADE_STYLE: Record<Grade, string> = {
  S: "bg-mint text-white",
  A: "bg-mint-100 text-mint-600",
  B: "bg-amber-100 text-[#9A6412]",
  C: "bg-ink-100 text-ink-500",
  제외: "bg-coral-100 text-coral",
};

export function GradeBadge({ grade, score }: { grade: Grade; score?: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${GRADE_STYLE[grade]}`}>
      {grade === "제외" ? "참가불가" : `${grade}등급`}
      {score !== undefined && grade !== "제외" && <span className="font-semibold opacity-80">{score}점</span>}
    </span>
  );
}

export function DdayBadge({ days }: { days: number }) {
  const urgent = days <= 3;
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${urgent ? "bg-coral-100 text-coral" : "bg-ink-100 text-ink-500"}`}>
      {dday(days)}
    </span>
  );
}

export function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 70 ? "bg-mint" : pct >= 40 ? "bg-amber" : "bg-coral";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const METER_TONE: Record<Exclude<Grade, "제외">, { chip: string; num: string; bar: string; box: string }> = {
  S: { chip: "bg-mint text-white", num: "text-mint-600", bar: "bg-mint", box: "border-mint-100 bg-mint-50" },
  A: { chip: "bg-mint-100 text-mint-700", num: "text-mint-600", bar: "bg-mint-400", box: "border-mint-100 bg-white" },
  B: { chip: "bg-amber-100 text-[#9A6412]", num: "text-[#9A6412]", bar: "bg-amber", box: "border-amber-100 bg-white" },
  C: { chip: "bg-ink-100 text-ink-500", num: "text-ink-500", bar: "bg-ink-300", box: "border-ink-100 bg-white" },
};

/** 입찰 가능성을 크게 보여주는 점수 표시: 등급 + 점수(100점 만점) + 막대 */
export function ScoreMeter({ grade, score }: { grade: Grade; score: number }) {
  if (grade === "제외") {
    return <span className="inline-flex rounded-xl bg-coral-100 px-3 py-2 text-sm font-bold text-coral">참가불가</span>;
  }
  const t = METER_TONE[grade];
  return (
    <span className={`inline-flex w-[150px] items-center gap-2.5 rounded-xl border px-2.5 py-2 ${t.box}`} aria-label={`입찰 가능성 ${grade}등급 ${score}점`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-black ${t.chip}`}>{grade}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-0.5 leading-none">
          <span className={`text-[22px] font-extrabold tracking-tight tabular-nums ${t.num}`}>{score}</span>
          <span className="text-[11px] font-semibold text-ink-300">/100</span>
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-100">
          <span className={`block h-full rounded-full ${t.bar}`} style={{ width: `${score}%` }} />
        </span>
      </span>
    </span>
  );
}
