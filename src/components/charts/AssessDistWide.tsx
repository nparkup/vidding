"use client";

import type { AssessStats } from "@/lib/awards/assess";
import { CHART, niceMax, useWidth } from "@/components/charts/useWidth";

const pct = (n: number, d = 2) => `${(Math.round(n * 10 ** d) / 10 ** d).toFixed(d)}%`;

/**
 * 사정율 구간별 분포를 카드 전체 너비로 그린다. 실제 너비(px)로 그려 글자 크기가 화면 폭과 상관없이 같다.
 * 진한 막대 = 낙찰이 많이 몰린 구간, 점선 = 100%, 세로선 = 가운데 값·낙찰자 가운데 값
 */
export function AssessDistWide({ st }: { st: AssessStats }) {
  const [ref, w] = useWidth<HTMLDivElement>(720);
  const narrow = w < 520;
  const H = narrow ? 200 : 260;
  const PL = 36, PR = 8, PT = 22, PB = 26;
  const [lo, hi] = st.range;
  const span = hi - lo;
  const top = niceMax(Math.max(1, ...st.bins));
  const iw = w - PL - PR;
  const x = (v: number) => PL + ((v - lo) / span) * iw;
  const y = (v: number) => PT + (1 - v / top) * (H - PT - PB);
  const bw = iw / st.bins.length;
  const hot = (a: number, b: number) => st.windows.some((wd) => a < wd.hi - 1e-9 && b > wd.lo + 1e-9);
  // 눈금: 넓으면 0.5%p, 좁으면 1%p (범위가 6%p면 1%p·2%p)
  const step = span > 4 ? (narrow ? 2 : 1) : narrow ? 1 : 0.5;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t = Math.round((t + step) * 1000) / 1000) ticks.push(t);
  const showCount = bw >= 22;
  const marks = [
    { v: st.q[2], label: `가운데 ${pct(st.q[2])}`, color: CHART.ink },
    ...(st.winner ? [{ v: st.winner.q[1], label: `낙찰자 가운데 ${pct(st.winner.q[1])}`, color: CHART.cat[1] }] : []),
  ];
  return (
    <div ref={ref} className="mt-3 w-full">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block" role="img" aria-label="사정율 구간별 분포">
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={PL} x2={w - PR} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART.axis : CHART.grid} />
            <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="11" fill={CHART.text}>{t}건</text>
          </g>
        ))}
        {st.bins.map((c, i) => {
          const a = lo + i * st.binWidth, b = a + st.binWidth;
          const t = y(c);
          const h = Math.max(0, H - PB - t);
          return (
            <g key={i}>
              <rect x={PL + i * bw + 1.5} y={t} width={Math.max(1, bw - 3)} height={h} rx={Math.min(4, h / 2)} fill={hot(a, b) ? CHART.barHot : "#86EBC8"}>
                <title>{`${a.toFixed(1)} ~ ${b.toFixed(1)}% · ${c}건`}</title>
              </rect>
              {showCount && c > 0 && <text x={PL + i * bw + bw / 2} y={t - 4} textAnchor="middle" fontSize="10" fill={CHART.text} stroke="#fff" strokeWidth={3} paintOrder="stroke">{c}</text>}
            </g>
          );
        })}
        {100 > lo && 100 < hi && <line x1={x(100)} x2={x(100)} y1={PT - 4} y2={H - PB} stroke={CHART.ref} strokeDasharray="3 3" />}
        {marks.map((m) => m.v > lo && m.v < hi && (
          <line key={m.label} x1={x(m.v)} x2={x(m.v)} y1={PT - 6} y2={H - PB} stroke={m.color} strokeWidth={1.5} />
        ))}
        {ticks.map((t, i) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} fontSize="11" fill={CHART.text}>
            {Number.isInteger(t) ? `${t}%` : `${t.toFixed(1)}%`}
          </text>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.barHot }} />낙찰이 많이 몰린 구간</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#86EBC8" }} />그 밖 구간 ({st.binWidth.toFixed(1)}%p씩)</li>
        {marks.map((m) => <li key={m.label} className="flex items-center gap-1.5"><span className="h-3 w-0.5" style={{ background: m.color }} />{m.label}</li>)}
      </ul>
    </div>
  );
}
