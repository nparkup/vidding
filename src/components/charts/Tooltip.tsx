/** 차트 위 말풍선. 첫 줄은 굵게, "## "로 시작하는 줄은 구분선 아래 소제목 */
/** w: 말풍선 너비(기본 180), above: y를 말풍선 아래 끝으로 보고 위로 띄운다 */
export function Tooltip({ x, y, lines, width, w = 180, above = false }: { x: number; y: number; lines: string[]; width: number; w?: number; above?: boolean }) {
  if (!lines.length) return null;
  const bw = Math.min(w, width - 8);
  const left = Math.max(4, Math.min(width - bw - 4, x - bw / 2));
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lift" style={above ? { left, width: bw, bottom: `calc(100% - ${Math.round(y)}px)` } : { left, width: bw, top: Math.max(0, y) }}>
      {lines.map((l, i) => (l.startsWith("## ")
        ? <p key={i} className="mt-1 border-t border-white/20 pt-1 font-semibold">{l.slice(3)}</p>
        : <p key={i} className={i === 0 ? "font-semibold" : "text-ink-200"}>{l}</p>))}
    </div>
  );
}
