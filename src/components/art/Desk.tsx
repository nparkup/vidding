import { Box, Cyl, iso, type Faces } from "./iso";

/** 공고문·체크리스트·아침 메일이 놓인 책상 (밝은 배경용) */

const PAPER: Faces = { top: "#FFFFFF", left: "#DCE3EC", right: "#EEF2F7" };

function Lines({ x, y, z, w, rows, check }: { x: number; y: number; z: number; w: number; rows: number; check?: number }) {
  const out = [];
  for (let i = 0; i < rows; i++) {
    const yy = y + 14 + i * 13;
    const [ax, ay] = iso(x + (check !== undefined ? 22 : 10), yy, z);
    const [bx, by] = iso(x + w - 10 - (i % 2) * 18, yy, z);
    out.push(<line key={`l${i}`} x1={ax} y1={ay} x2={bx} y2={by} stroke="#CBD2DE" strokeWidth="3" strokeLinecap="round" />);
    if (check !== undefined) {
      const [cx, cy] = iso(x + 12, yy, z);
      out.push(<ellipse key={`c${i}`} cx={cx} cy={cy} rx="5.5" ry="3.2" fill={i < check ? "#12B886" : "#E5E9F0"} />);
    }
  }
  return <>{out}</>;
}

export function DeskArt({ className = "" }: { className?: string }) {
  const [ex, ey] = iso(150, 40, 46);
  return (
    <svg viewBox="-170 -30 340 255" className={className} role="img" aria-label="공고문과 제출서류 체크리스트, 아침 메일 일러스트">
      <ellipse cx="0" cy="214" rx="150" ry="14" fill="#0B1426" opacity="0.07" />
      {/* 책상 */}
      <Box x={0} y={0} z={-12} w={200} d={180} h={12} c={{ top: "#FFFFFF", left: "#C9D3E0", right: "#E1E7EF" }} />
      {/* 서류 더미 */}
      <Box x={20} y={30} w={86} d={110} h={4} c={PAPER} />
      <Box x={24} y={26} z={4} w={86} d={110} h={4} c={PAPER} />
      <Box x={28} y={22} z={8} w={86} d={110} h={4} c={PAPER} topDeco={(q) => <polygon points={q(0, 0, 86, 18)} fill="#12B886" />} />
      <Lines x={28} y={36} z={12} w={86} rows={6} check={4} />
      {/* 노트북 화면 대신 태블릿 */}
      <Box x={124} y={70} w={60} d={84} h={5} c={{ top: "#24304A", left: "#0B1426", right: "#121D33" }} topDeco={(q) => (
        <>
          <polygon points={q(5, 5, 55, 79)} fill="#ECFBF5" />
          <polygon points={q(10, 10, 50, 30)} fill="#12B886" />
          <polygon points={q(10, 36, 50, 44)} fill="#CBD2DE" />
          <polygon points={q(10, 50, 38, 58)} fill="#CBD2DE" />
          <polygon points={q(10, 64, 44, 72)} fill="#93C5FD" />
        </>
      )} />
      {/* 커피 */}
      <Cyl x={150} y={30} r={10} h={18} side="#FFFFFF" top="#F3F5F9" dark="#E5E9F0" />
      <ellipse cx={iso(150, 30, 18)[0]} cy={iso(150, 30, 18)[1]} rx="9" ry="5" fill="#8B5E3C" />
      {/* 떠 있는 메일 */}
      <g transform={`translate(${ex - 10}, ${ey - 40}) rotate(-8)`}>
        <rect x="-34" y="-22" width="68" height="46" rx="8" fill="#12B886" />
        <path d="M-34,-16 L0,6 L34,-16" stroke="#fff" strokeWidth="3" fill="none" strokeLinejoin="round" />
        <circle cx="30" cy="-20" r="9" fill="#EF5A43" />
        <text x="30" y="-16.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">5</text>
      </g>
      {/* 돋보기 */}
      <g transform="translate(-120, 40)">
        <circle cx="0" cy="0" r="20" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="6" />
        <line x1="14" y1="14" x2="32" y2="32" stroke="#24304A" strokeWidth="8" strokeLinecap="round" />
        <circle cx="-6" cy="-6" r="5" fill="#fff" opacity="0.8" />
      </g>
    </svg>
  );
}
