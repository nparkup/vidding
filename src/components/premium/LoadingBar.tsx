/**
 * 조회 중 로딩바. value(0~100)가 있으면 진행률을, 없거나 0이면 진행 중임을 알리는 움직이는 막대를 보여 준다.
 */
export function LoadingBar({ value, label }: { value?: number; label: string }) {
  const known = value !== undefined && value > 0;
  return (
    <div className="mt-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? Math.round(value) : undefined}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-100">
        {known ? (
          <div className="h-full rounded-full bg-mint transition-[width] duration-500" style={{ width: `${Math.min(100, value)}%` }} />
        ) : (
          <div className="absolute inset-y-0 left-0 w-2/5 animate-loading-slide rounded-full bg-mint" />
        )}
      </div>
      <p className="mt-1.5 flex justify-between gap-3 text-xs text-ink-500">
        <span>{label}</span>
        {known && <span className="shrink-0 font-semibold tabular-nums text-ink">{Math.round(value)}%</span>}
      </p>
    </div>
  );
}
