import { Box, Cyl, Flat, Person, Sparkle, Tree, iso, type Faces } from "./iso";

/** 업종별 작은 아이소메트릭 장면 (밝은 카드 배경용) */

const TILE: Faces = { top: "#FFFFFF", left: "#DCE3EC", right: "#EBF0F5" };
const W: Faces = { top: "#FFFFFF", left: "#D3DBE6", right: "#E8EDF3" };
const VB = "-150 -84 300 240";

function Base({ tint }: { tint: string }) {
  return (
    <>
      <ellipse cx="0" cy="146" rx="120" ry="10" fill="#0B1426" opacity="0.07" />
      <Box x={0} y={0} z={-10} w={140} d={140} h={10} c={TILE} />
      <Flat p={[[6, 6], [134, 6], [134, 134], [6, 134]]} fill={tint} />
    </>
  );
}

export function CleaningArt({ className = "" }: { className?: string }) {
  const tiles = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      if ((i + j) % 2 === 0) tiles.push(<Flat key={`${i}${j}`} p={[[6 + i * 32, 6 + j * 32], [38 + i * 32, 6 + j * 32], [38 + i * 32, 38 + j * 32], [6 + i * 32, 38 + j * 32]]} fill="#C9F2E2" />);
  const [mx, my] = iso(70, 82, 0);
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="청소·미화 일러스트">
      <Base tint="#E3F8F0" />
      {tiles}
      {/* 젖은 바닥 반사 */}
      <Flat p={[[44, 58], [96, 58], [96, 104], [44, 104]]} fill="#86EBC8" opacity={0.5} />
      {/* 미화 카트 */}
      <Box x={14} y={20} w={34} d={22} h={26} c={{ top: "#7CEBC6", left: "#0B9A70", right: "#12B886" }} />
      <Box x={18} y={24} z={26} w={26} d={14} h={4} c={W} />
      <Cyl x={24} y={30} z={30} r={5} h={10} side="#3B82F6" top="#93C5FD" dark="#2563EB" />
      <Cyl x={38} y={30} z={30} r={4} h={13} side="#F0A63A" top="#FDF0DA" dark="#D68A1E" />
      {/* 물통 */}
      <Cyl x={98} y={40} r={11} h={16} side="#3B82F6" top="#BFD3FF" dark="#2563EB" />
      <ellipse cx={iso(98, 40, 16)[0]} cy={iso(98, 40, 16)[1]} rx="9" ry="5" fill="#60A5FA" />
      {/* 밀대 */}
      <line x1={mx} y1={my - 4} x2={mx + 26} y2={my - 64} stroke="#6C778D" strokeWidth="3" strokeLinecap="round" />
      <path d={`M${mx - 16},${my - 4} l16,-8 l16,8 l-16,8 Z`} fill="#12B886" />
      {/* 주의 표지판 */}
      <path d={`M${iso(112, 100, 0)[0] - 10},${iso(112, 100, 0)[1]} l10,-34 l10,34 Z`} fill="#F0A63A" />
      <path d={`M${iso(112, 100, 0)[0] - 4},${iso(112, 100, 0)[1] - 8} l4,-14 l4,14 Z`} fill="#FFFFFF" opacity="0.8" />
      <Person x={60} y={76} body="#12B886" hat="#077A59" />
      <Sparkle cx={-60} cy={-20} r={9} fill="#3DD6A3" />
      <Sparkle cx={50} cy={-48} r={7} fill="#93C5FD" />
      <Sparkle cx={-6} cy={-62} r={5} fill="#F0A63A" />
    </svg>
  );
}

export function FacilityArt({ className = "" }: { className?: string }) {
  const fan = (x: number, y: number, z: number) => {
    const [cx, cy] = iso(x, y, z);
    return (
      <g>
        <ellipse cx={cx} cy={cy} rx="13" ry="7.5" fill="#24304A" />
        <ellipse cx={cx} cy={cy} rx="10" ry="5.8" fill="#4D586F" />
        <path d={`M${cx - 9},${cy} L${cx + 9},${cy} M${cx},${cy - 5} L${cx},${cy + 5}`} stroke="#98A1B4" strokeWidth="1.6" />
      </g>
    );
  };
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="시설·설비 유지관리 일러스트">
      <Base tint="#E8EEF7" />
      {/* 배관 */}
      <Box x={20} y={92} z={8} w={110} d={6} h={6} c={{ top: "#93C5FD", left: "#3B82F6", right: "#60A5FA" }} />
      <Box x={20} y={20} z={8} w={6} d={78} h={6} c={{ top: "#FDF0DA", left: "#F0A63A", right: "#F6C26E" }} />
      {/* 공조 실외기 2대 */}
      <Box x={36} y={22} w={44} d={34} h={30} c={W} rightDeco={(q) => [6, 12, 18, 24].map((v) => <polygon key={v} points={q(4, v, 30, v + 2)} fill="#CBD2DE" />)} />
      {fan(58, 39, 30)}
      <Box x={88} y={22} w={40} d={34} h={30} c={W} rightDeco={(q) => [6, 12, 18, 24].map((v) => <polygon key={v} points={q(4, v, 30, v + 2)} fill="#CBD2DE" />)} />
      {fan(108, 39, 30)}
      {/* 수조(저수조) */}
      <Cyl x={34} y={110} r={14} h={34} side="#E5E9F0" top="#FFFFFF" dark="#CBD2DE" />
      <rect x={iso(34, 110, 0)[0] - 17} y={iso(34, 110, 22)[1]} width="34" height="3" fill="#12B886" />
      {/* 제어반 */}
      <Box x={78} y={104} w={30} d={12} h={40} c={{ top: "#24304A", left: "#121D33", right: "#24304A" }} leftDeco={(q) => (
        <>
          <polygon points={q(5, 26, 25, 34)} fill="#3DD6A3" />
          <polygon points={q(5, 16, 12, 22)} fill="#F0A63A" />
          <polygon points={q(16, 16, 25, 22)} fill="#60A5FA" />
        </>
      )} />
      <Person x={112} y={120} body="#3B82F6" hat="#F0A63A" />
      <Sparkle cx={70} cy={-60} r={7} fill="#3DD6A3" />
    </svg>
  );
}

export function SecurityArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="경비·주차관리 일러스트">
      <Base tint="#EAF0FB" />
      {/* 주차선 */}
      {[10, 42, 74].map((x) => (
        <Flat key={x} p={[[x, 12], [x + 3, 12], [x + 3, 56], [x, 56]]} fill="#FFFFFF" />
      ))}
      <Box x={16} y={16} w={22} d={36} h={10} c={{ top: "#60A5FA", left: "#2563EB", right: "#3B82F6" }} />
      <Box x={19} y={24} z={10} w={16} d={18} h={7} c={{ top: "#DBEAFE", left: "#1D4ED8", right: "#60A5FA" }} />
      <Box x={48} y={16} w={22} d={36} h={10} c={{ top: "#FFFFFF", left: "#CBD2DE", right: "#E5E9F0" }} />
      <Box x={51} y={24} z={10} w={16} d={18} h={7} c={{ top: "#F3F5F9", left: "#4D586F", right: "#98A1B4" }} />
      {/* 초소 */}
      <Box x={96} y={70} w={30} d={28} h={36} c={W} leftDeco={(q) => <polygon points={q(6, 16, 28, 32)} fill="#93C5FD" />} rightDeco={(q) => <polygon points={q(6, 16, 24, 32)} fill="#BFD3FF" />} />
      <Box x={92} y={66} z={36} w={38} d={36} h={5} c={{ top: "#12B886", left: "#0B9A70", right: "#077A59" }} />
      {/* 차단기 */}
      <Box x={20} y={112} w={10} d={8} h={16} c={{ top: "#F0A63A", left: "#D68A1E", right: "#F6C26E" }} />
      <Box x={30} y={115} z={12} w={58} d={2.4} h={3} c={{ top: "#FFFFFF", left: "#EF5A43", right: "#FFFFFF" }} leftDeco={(q) => [8, 24, 40].map((u) => <polygon key={u} points={q(u, 0, u + 8, 3)} fill="#FFFFFF" />)} />
      <Person x={80} y={100} body="#24304A" hat="#121D33" />
      {/* 방패 */}
      <path d="M-94,-44 l16,-6 l16,6 v12 c0,10 -8,16 -16,20 c-8,-4 -16,-10 -16,-20 Z" fill="#12B886" />
      <path d="M-84,-32 l5,5 l10,-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PestArt({ className = "" }: { className?: string }) {
  const [tx, ty] = iso(60, 70, 34);
  return (
    <svg viewBox={VB} className={className} role="img" aria-label="방역·소독 일러스트">
      <Base tint="#FDF3E3" />
      <Tree x={112} y={24} s={0.9} />
      <Tree x={124} y={58} s={0.75} />
      {/* 화단 */}
      <Box x={16} y={18} w={60} d={20} h={8} c={{ top: "#86EBC8", left: "#D3DBE6", right: "#E8EDF3" }} />
      {/* 분무기 탱크 */}
      <Cyl x={58} y={66} r={12} h={34} side="#F0A63A" top="#FDF0DA" dark="#D68A1E" />
      <rect x={iso(58, 66, 0)[0] - 15} y={iso(58, 66, 20)[1]} width="30" height="4" fill="#FFFFFF" opacity="0.7" />
      <path d={`M${tx + 8},${ty} C ${tx + 30},${ty - 20} ${tx + 44},${ty + 10} ${tx + 54},${ty - 10}`} stroke="#24304A" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      {/* 분무 */}
      {[[0, 0, 5], [10, -8, 4], [14, 6, 3.5], [22, -2, 4.5], [26, -14, 3], [32, 8, 3], [36, -6, 2.6]].map(([dx, dy, r2], i) => (
        <circle key={i} cx={tx + 60 + dx} cy={ty - 14 + dy} r={r2} fill="#93C5FD" opacity={0.75 - i * 0.06} />
      ))}
      <Person x={40} y={104} body="#DBEAFE" head="#F6C9A8" hat="#3B82F6" />
      <Box x={84} y={104} w={24} d={18} h={14} c={W} leftDeco={(q) => <polygon points={q(8, 3, 16, 11)} fill="#EF5A43" />} />
      <path d="M-96,-36 l22,0 M-85,-47 l0,22" stroke="#12B886" strokeWidth="6" strokeLinecap="round" />
      <Sparkle cx={60} cy={-66} r={6} fill="#3DD6A3" />
    </svg>
  );
}
