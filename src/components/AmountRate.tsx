import { rateText, won } from "@/lib/format";

/**
 * 금액을 기준(굵게)으로 쓰고, 비율은 그 금액의 보조값으로 옆에 작게 쓴다.
 * 예: 1,234,000,000원 (낙찰률 87.745%). stack 이면 비율을 금액 아래 줄에 쓴다 (휴대폰 좁은 줄).
 * 금액이 없으면 비율만 굵게 쓴다.
 */
export function AmountRate({ amount, rate, label = "", stack = false, className = "" }: { amount?: number; rate?: number; label?: string; stack?: boolean; className?: string }) {
  const hasA = !!amount && amount > 0;
  const hasR = !!rate && rate > 0;
  const r = hasR ? `${label ? `${label} ` : ""}${rateText(rate!)}` : "";
  if (!hasA) return <b className={`tabular-nums ${className}`}>{r || "-"}</b>;
  return (
    <span className={`min-w-0 tabular-nums ${className}`}>
      <b className="[overflow-wrap:anywhere]">{won(amount!)}</b>
      {hasR && <span className={stack ? "block text-xs font-semibold text-ink-500" : "ml-1.5 whitespace-nowrap text-xs font-semibold text-ink-500"}>{stack ? r : `(${r})`}</span>}
    </span>
  );
}
