import { Box, Cyl, Flat, Person, Tree, iso, rnd, windows, type Faces } from "./iso";

/** 메인 히어로: 아침 7시에 깨어나는 공공기관 거리 (아이소메트릭) */

const SLAB: Faces = { top: "#16223C", left: "#0C1528", right: "#101B33" };
const NAVY: Faces = { top: "#3A4F78", left: "#1D2B49", right: "#28395D" };
const STONE: Faces = { top: "#F3F6FA", left: "#BCC6D6", right: "#D7DEE9" };
const MINT: Faces = { top: "#7CEBC6", left: "#0B9A70", right: "#14B98A" };
const WHITE: Faces = { top: "#FFFFFF", left: "#CFD7E4", right: "#E6EBF2" };
const BOOTH: Faces = { top: "#12B886", left: "#E2E8F0", right: "#F4F7FA" };
const CAR: Faces = { top: "#60A5FA", left: "#2563EB", right: "#3B82F6" };

export function HeroCity({ className = "" }: { className?: string }) {
  const r = rnd(7);
  const lit = () => {
    const v = r();
    return v < 0.28 ? "#FFD58C" : v < 0.5 ? "#7CEBC6" : v < 0.58 ? "#BFD3FF" : "#2C3E63";
  };
  const [glowX, glowY] = iso(150, 150, 60);

  return (
    <svg viewBox="-280 -262 560 580" className={className} role="img" aria-label="아침 7시, 공공기관과 오피스 빌딩이 있는 거리 일러스트">
      <defs>
        <radialGradient id="hc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#12B886" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#12B886" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#12B886" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hc-halo">
          <stop offset="45%" stopColor="#F0A63A" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F0A63A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hc-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE2A8" />
          <stop offset="100%" stopColor="#F0A63A" />
        </linearGradient>
      </defs>

      <ellipse cx={glowX} cy={glowY} rx="280" ry="200" fill="url(#hc-glow)" />
      {/* 아침 해 */}
      <circle cx="190" cy="-190" r="34" fill="url(#hc-sun)" opacity="0.95" />
      <circle cx="190" cy="-190" r="70" fill="url(#hc-halo)" />

      {/* 바닥 */}
      <Box x={0} y={0} z={-14} w={300} d={300} h={14} c={SLAB} />
      {/* 도로 */}
      <Flat p={[[0, 236], [300, 236], [300, 276], [0, 276]]} fill="#0B1426" />
      <Flat p={[[236, 0], [276, 0], [276, 236], [236, 236]]} fill="#0B1426" />
      {[10, 50, 90, 130, 170, 210].map((x) => (
        <Flat key={`dx${x}`} p={[[x, 254.5], [x + 20, 254.5], [x + 20, 257.5], [x, 257.5]]} fill="#3A4F78" />
      ))}
      {[10, 50, 90, 130, 170].map((y) => (
        <Flat key={`dy${y}`} p={[[254.5, y], [257.5, y], [257.5, y + 20], [254.5, y + 20]]} fill="#3A4F78" />
      ))}
      {/* 횡단보도 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Flat key={`cw${i}`} p={[[238 + i * 8, 280], [243 + i * 8, 280], [243 + i * 8, 296], [238 + i * 8, 296]]} fill="#E5E9F0" opacity={0.5} />
      ))}
      {/* 광장 */}
      <Flat p={[[104, 104], [228, 104], [228, 228], [104, 228]]} fill="#1C2A47" />

      <Tree x={230} y={14} s={0.9} />
      <Tree x={286} y={40} s={0.85} />

      {/* 오피스 타워 */}
      <Box
        x={18}
        y={18}
        w={78}
        d={78}
        h={206}
        c={NAVY}
        leftDeco={(q) => windows(q, { cols: 4, rows: 13, w: 78, h: 206, pad: 8, gapX: 5, gapY: 5, color: lit })}
        rightDeco={(q) => windows(q, { cols: 4, rows: 13, w: 78, h: 206, pad: 8, gapX: 5, gapY: 5, color: lit })}
        topDeco={(q) => <polygon points={q(14, 14, 64, 64)} fill="#2C3E63" />}
      />
      <Box x={40} y={40} z={206} w={30} d={30} h={14} c={NAVY} />
      <Cyl x={55} y={55} z={220} r={2} h={26} side="#98A1B4" top="#CBD2DE" />
      <circle cx={iso(55, 55, 248)[0]} cy={iso(55, 55, 248)[1]} r="3.5" fill="#EF5A43" />

      {/* 민트 유리 빌딩 */}
      <Box
        x={124}
        y={8}
        w={62}
        d={62}
        h={136}
        c={MINT}
        leftDeco={(q) => windows(q, { cols: 1, rows: 9, w: 62, h: 136, pad: 6, gapY: 6, color: () => "rgba(255,255,255,.22)" })}
        rightDeco={(q) => windows(q, { cols: 1, rows: 9, w: 62, h: 136, pad: 6, gapY: 6, color: () => "rgba(255,255,255,.3)" })}
      />
      <Box x={136} y={20} z={136} w={24} d={24} h={10} c={WHITE} />

      <Tree x={286} y={100} s={0.9} />

      {/* 작은 공공시설(학교·보건소) */}
      <Box
        x={16}
        y={128}
        w={74}
        d={84}
        h={54}
        c={WHITE}
        leftDeco={(q) => (
          <>
            {windows(q, { cols: 4, rows: 2, w: 74, h: 54, pad: 8, gapX: 6, gapY: 8, color: (rr) => (rr === 1 ? "#93C5FD" : "#BFD3FF") })}
            <polygon points={q(0, 44, 74, 50)} fill="#12B886" />
          </>
        )}
        rightDeco={(q) => (
          <>
            {windows(q, { cols: 5, rows: 2, w: 84, h: 54, pad: 8, gapX: 6, gapY: 8, color: () => "#BFD3FF" })}
            <polygon points={q(0, 44, 84, 50)} fill="#12B886" />
          </>
        )}
      />
      <Box x={36} y={150} z={54} w={22} d={22} h={8} c={MINT} />

      {/* 관공서 본관 */}
      <Box
        x={112}
        y={110}
        w={108}
        d={84}
        h={70}
        c={STONE}
        leftDeco={(q) => (
          <>
            {windows(q, { cols: 7, rows: 2, w: 108, h: 70, pad: 10, gapX: 6, gapY: 8, color: (rr) => (rr === 1 ? "#8EA0BD" : "#7D90AF") })}
            <polygon points={q(44, 0, 64, 20)} fill="#24304A" />
            <polygon points={q(0, 62, 108, 70)} fill="#A9B5C8" />
          </>
        )}
        rightDeco={(q) => (
          <>
            {windows(q, { cols: 5, rows: 2, w: 84, h: 70, pad: 10, gapX: 6, gapY: 8, color: () => "#9AABC5" })}
            <polygon points={q(0, 62, 84, 70)} fill="#BCC6D6" />
          </>
        )}
      />
      <Box x={138} y={128} z={70} w={56} d={48} h={22} c={STONE} leftDeco={(q) => windows(q, { cols: 4, rows: 1, w: 56, h: 22, pad: 6, gapX: 6, color: () => "#8EA0BD" })} />
      <Cyl x={166} y={152} z={92} r={1.4} h={44} side="#CBD2DE" top="#FFFFFF" />
      <path
        d={(() => {
          const [fx, fy] = iso(166, 152, 136);
          return `M${fx},${fy} l22,6 l-2,10 l-20,-6 Z`;
        })()}
        fill="#12B886"
      />
      {/* 계단 */}
      <Box x={152} y={194} w={28} d={6} h={3} c={STONE} />
      <Box x={150} y={200} w={32} d={6} h={1.5} c={STONE} />

      {/* 경비 초소 + 차단기 */}
      <Box x={198} y={206} w={22} d={20} h={26} c={BOOTH} leftDeco={(q) => <polygon points={q(4, 12, 18, 22)} fill="#93C5FD" />} rightDeco={(q) => <polygon points={q(4, 12, 16, 22)} fill="#BFD3FF" />} />
      <Box x={198} y={232} z={10} w={36} d={2.4} h={2.4} c={{ top: "#FFFFFF", left: "#EF5A43", right: "#F7F8FA" }} />

      {/* 사람들 */}
      <Person x={130} y={214} s={1} body="#12B886" hat="#077A59" />
      <Cyl x={140} y={222} r={4} h={7} side="#60A5FA" top="#93C5FD" dark="#3B82F6" />
      <Person x={100} y={222} s={1} body="#3B82F6" />
      <Box x={70} y={216} w={14} d={9} h={10} c={{ top: "#FDF0DA", left: "#F0A63A", right: "#F6C26E" }} />
      <Person x={88} y={214} s={1} body="#12B886" hat="#077A59" />

      <Tree x={24} y={228} />
      <Tree x={292} y={214} s={0.9} />

      {/* 차량 */}
      <Box x={60} y={244} w={36} d={18} h={9} c={CAR} />
      <Box x={70} y={246} z={9} w={18} d={14} h={7} c={{ top: "#DBEAFE", left: "#1D4ED8", right: "#60A5FA" }} />
      <Box x={150} y={258} w={32} d={16} h={8} c={{ top: "#FFFFFF", left: "#CBD2DE", right: "#E5E9F0" }} />
      <Box x={158} y={260} z={8} w={16} d={12} h={6} c={{ top: "#F3F5F9", left: "#4D586F", right: "#98A1B4" }} />

      <Tree x={292} y={292} s={0.8} />
    </svg>
  );
}
