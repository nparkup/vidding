import { Box, Cyl, Flat, Person, iso, type Faces } from "./iso";

/** 공사·IT·물품 업종 아이소메트릭 장면 (밝은 배경용, 직접 그린 SVG) */

const TILE: Faces = { top: "#FFFFFF", left: "#DCE3EC", right: "#EBF0F5" };
const W: Faces = { top: "#FFFFFF", left: "#D3DBE6", right: "#E8EDF3" };
const VB = "-150 -110 300 266";

function Base({ tint }: { tint: string }) {
  return (
    <>
      <ellipse cx="0" cy="146" rx="120" ry="10" fill="#0B1426" opacity="0.07" />
      <Box x={0} y={0} z={-10} w={140} d={140} h={10} c={TILE} />
      <Flat p={[[6, 6], [134, 6], [134, 134], [6, 134]]} fill={tint} />
    </>
  );
}

const CONCRETE: Faces = { top: "#F3F5F9", left: "#BCC6D6", right: "#D7DEE9" };
const STEEL: Faces = { top: "#FDF0DA", left: "#D68A1E", right: "#F0A63A" };

/** 공사: 골조가 올라가는 건물과 타워크레인 */
export function ConstructionArt({ className = "" }: { className?: string }) {
  const cols: [number, number][] = [[20, 20], [76, 20], [20, 76], [76, 76]];
  const [hx, hy] = iso(58, 18, 130);
  const [lx, ly] = iso(58, 18, 92);
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="건축·토목 공사 일러스트">
      <Base tint="#FFF4E0" />
      {/* 크레인 마스트 */}
      <Box x={112} y={14} w={8} d={8} h={130} c={STEEL} rightDeco={(q) => [20, 44, 68, 92, 116].map((v) => <polygon key={v} points={q(1, v, 7, v + 2)} fill="#FFFFFF" opacity={0.5} />)} />
      {/* 골조: 1층 슬래브, 기둥, 2층 슬래브 */}
      <Box x={14} y={14} w={70} d={70} h={6} c={CONCRETE} />
      {cols.map(([x, y]) => <Box key={`a${x}${y}`} x={x} y={y} z={6} w={6} d={6} h={30} c={CONCRETE} />)}
      <Box x={14} y={14} z={36} w={70} d={70} h={6} c={CONCRETE} leftDeco={(q) => <polygon points={q(0, 0, 70, 2)} fill="#98A1B4" />} />
      {cols.map(([x, y]) => <Box key={`b${x}${y}`} x={x} y={y} z={42} w={6} d={6} h={22} c={{ top: "#FFFFFF", left: "#CBD2DE", right: "#E5E9F0" }} />)}
      {/* 철근 */}
      {[30, 44, 58].map((x) => <Box key={x} x={x} y={20} z={42} w={2} d={2} h={14} c={STEEL} />)}
      {/* 크레인 지브 */}
      <Box x={30} y={16} z={130} w={104} d={4} h={4} c={STEEL} />
      <Box x={124} y={12} z={120} w={12} d={12} h={10} c={{ top: "#4D586F", left: "#24304A", right: "#3A4F78" }} />
      <Box x={110} y={12} z={134} w={12} d={12} h={10} c={{ top: "#DBEAFE", left: "#2563EB", right: "#3B82F6" }} />
      <line x1={hx} y1={hy} x2={lx} y2={ly} stroke="#4D586F" strokeWidth="1.4" />
      <Box x={48} y={10} z={84} w={22} d={14} h={8} c={{ top: "#93C5FD", left: "#2563EB", right: "#3B82F6" }} />
      {/* 라바콘 */}
      {[[100, 116], [118, 104]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <Cyl x={x} y={y} r={4.5} h={3} side="#E5E9F0" top="#FFFFFF" />
          <path d={`M${iso(x, y, 3)[0] - 4},${iso(x, y, 3)[1]} L${iso(x, y, 3)[0]},${iso(x, y, 3)[1] - 15} L${iso(x, y, 3)[0] + 4},${iso(x, y, 3)[1]} Z`} fill="#F0A63A" />
        </g>
      ))}
      <Person x={96} y={86} body="#3B82F6" hat="#F0A63A" />
    </svg>
  );
}

/** IT·소프트웨어: 서버 랙과 관제 모니터 */
export function ITArt({ className = "" }: { className?: string }) {
  const RACK: Faces = { top: "#3A4F78", left: "#121D33", right: "#1D2B49" };
  const leds = (q: (a: number, b: number, c: number, d: number) => string) =>
    [12, 26, 40, 54, 68].map((v, i) => (
      <g key={v}>
        <polygon points={q(4, v, 24, v + 8)} fill="#24304A" />
        <polygon points={q(6, v + 2, 9, v + 6)} fill={i % 3 === 1 ? "#F0A63A" : "#3DD6A3"} />
        <polygon points={q(12, v + 3, 22, v + 5)} fill="#60A5FA" opacity={0.7} />
      </g>
    ));
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="IT·소프트웨어 용역 일러스트">
      <Base tint="#E8F1FF" />
      {/* 바닥 케이블 트레이 */}
      <Flat p={[[20, 60], [128, 60], [128, 66], [20, 66]]} fill="#BFD3FF" />
      {/* 서버 랙 2개 */}
      <Box x={16} y={14} w={28} d={30} h={86} c={RACK} leftDeco={leds} />
      <Box x={52} y={14} w={28} d={30} h={86} c={RACK} leftDeco={leds} />
      {/* 데스크 + 모니터 */}
      <Box x={76} y={82} w={52} d={30} h={20} c={W} />
      <Box x={86} y={86} z={20} w={36} d={4} h={26} c={{ top: "#24304A", left: "#0B1426", right: "#121D33" }} leftDeco={(q) => (
        <>
          <polygon points={q(2, 3, 34, 24)} fill="#ECFBF5" />
          <polygon points={q(5, 6, 16, 21)} fill="#12B886" opacity={0.85} />
          <polygon points={q(19, 15, 31, 21)} fill="#93C5FD" />
          <polygon points={q(19, 8, 28, 12)} fill="#CBD2DE" />
        </>
      )} />
      <Box x={92} y={98} z={20} w={22} d={8} h={1.5} c={{ top: "#E5E9F0", left: "#98A1B4", right: "#CBD2DE" }} />
      <Person x={100} y={128} body="#24304A" />
    </svg>
  );
}

/** 물품: 팔레트에 쌓인 납품 박스와 배송 차량 */
export function SupplyArt({ className = "" }: { className?: string }) {
  const KRAFT: Faces = { top: "#F6DDB4", left: "#D9A35F", right: "#E8C38E" };
  const tape = (w: number, d: number) => (q: (a: number, b: number, c: number, d: number) => string) => <polygon points={q(w / 2 - 2, 0, w / 2 + 2, d)} fill="#FFFFFF" opacity={0.75} />;
  const box = (x: number, y: number, z: number, s = 22) => <Box key={`${x}${y}${z}`} x={x} y={y} z={z} w={s} d={s} h={s * 0.8} c={KRAFT} topDeco={tape(s, s)} />;
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="물품 구매·납품 일러스트">
      <Base tint="#EEF8F3" />
      {/* 팔레트 */}
      <Box x={14} y={14} w={56} d={56} h={5} c={{ top: "#E8C38E", left: "#B98545", right: "#D9A35F" }} />
      {box(16, 16, 5)}
      {box(42, 16, 5)}
      {box(16, 42, 5)}
      {box(42, 42, 5)}
      {box(20, 20, 22.6)}
      {box(44, 22, 22.6, 20)}
      {box(28, 28, 40.2, 20)}
      {/* 배송 차량 */}
      <Box x={70} y={86} w={56} d={30} h={30} c={{ top: "#FFFFFF", left: "#CBD2DE", right: "#E5E9F0" }} leftDeco={(q) => <polygon points={q(0, 10, 56, 14)} fill="#12B886" />} />
      <Box x={126} y={88} w={14} d={26} h={20} c={{ top: "#60A5FA", left: "#2563EB", right: "#3B82F6" }} rightDeco={(q) => <polygon points={q(4, 10, 22, 18)} fill="#DBEAFE" />} />
      {[[80, 116], [118, 116], [134, 116]].map(([x, y]) => (
        <ellipse key={x} cx={iso(x, y, 0)[0]} cy={iso(x, y, 0)[1] - 1} rx="5" ry="5.5" fill="#24304A" />
      ))}
      <Person x={84} y={66} body="#12B886" hat="#077A59" />
    </svg>
  );
}
