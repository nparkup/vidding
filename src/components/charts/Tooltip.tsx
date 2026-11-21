/** 차트 위 말풍선. 첫 줄은 굵게 */
export function Tooltip({ x, y, lines, width }: { x: number; y: number; lines: string[]; width: number }) {
  if (!lines.length) return null;
  const left = Math.max(4, Math.min(width - 184, x - 90));
  return (
    <div className="pointer-events-none absolute z-10 w-[180px] rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lift" style={{ left, top: Math.max(0, y) }}>
      {lines.map((l, i) => <p key={i} className={i === 0 ? "font-semibold" : "text-ink-200"}>{l}</p>)}
    </div>
  );
}
