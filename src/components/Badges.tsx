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
