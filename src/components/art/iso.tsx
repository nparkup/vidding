/**
 * 아이소메트릭 일러스트용 작은 도형 라이브러리.
 * 모든 그림은 이 저장소에서 직접 그린 SVG라 라이선스 걱정 없이 쓸 수 있다.
 *
 * 좌표계: x는 화면 오른쪽 아래, y는 왼쪽 아래, z는 위쪽.
 */
import type { ReactNode, SVGProps } from "react";

const C = Math.cos(Math.PI / 6);

export function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * C, (x + y) * 0.5 - z];
}

const pts = (p: [number, number, number][]) =>
  p.map(([x, y, z]) => iso(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

export interface Faces {
  top: string;
  left: string;
  right: string;
}

type BoxProps = {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  c: Faces;
  /** 왼쪽 면(앞쪽 y면) 위에 그릴 것: (u, v) 면 좌표 → 화면 좌표 변환기를 받는다 */
  leftDeco?: (q: FaceFn) => ReactNode;
  rightDeco?: (q: FaceFn) => ReactNode;
  topDeco?: (q: FaceFn) => ReactNode;
  edge?: string;
};

/** 면 위의 사각형(u0,v0)-(u1,v1)을 polygon points 문자열로 */
export type FaceFn = (u0: number, v0: number, u1: number, v1: number) => string;

export function Box({ x, y, z = 0, w, d, h, c, leftDeco, rightDeco, topDeco, edge }: BoxProps) {
  const left: FaceFn = (u0, v0, u1, v1) =>
    pts([[x + u0, y + d, z + v0], [x + u1, y + d, z + v0], [x + u1, y + d, z + v1], [x + u0, y + d, z + v1]]);
  const right: FaceFn = (u0, v0, u1, v1) =>
    pts([[x + w, y + u0, z + v0], [x + w, y + u1, z + v0], [x + w, y + u1, z + v1], [x + w, y + u0, z + v1]]);
  const top: FaceFn = (u0, v0, u1, v1) =>
    pts([[x + u0, y + v0, z + h], [x + u1, y + v0, z + h], [x + u1, y + v1, z + h], [x + u0, y + v1, z + h]]);
  return (
    <g strokeLinejoin="round">
      <polygon points={left(0, 0, w, h)} fill={c.left} stroke={edge} strokeWidth={edge ? 0.6 : 0} />
      <polygon points={right(0, 0, d, h)} fill={c.right} stroke={edge} strokeWidth={edge ? 0.6 : 0} />
      <polygon points={top(0, 0, w, d)} fill={c.top} stroke={edge} strokeWidth={edge ? 0.6 : 0} />
      {leftDeco?.(left)}
      {rightDeco?.(right)}
      {topDeco?.(top)}
    </g>
  );
}

/** 바닥(xy 평면)에 놓인 원기둥 */
export function Cyl({ x, y, z = 0, r, h, side, top, dark }: { x: number; y: number; z?: number; r: number; h: number; side: string; top: string; dark?: string }) {
  const rx = r * Math.SQRT2 * C;
  const ry = r * Math.SQRT2 * 0.5;
  const [cx, cy0] = iso(x, y, z);
  const cy1 = cy0 - h;
  return (
    <g>
      <path d={`M${cx - rx},${cy1} L${cx - rx},${cy0} A${rx},${ry} 0 0 0 ${cx + rx},${cy0} L${cx + rx},${cy1} Z`} fill={side} />
      {dark && <path d={`M${cx},${cy0 + ry} A${rx},${ry} 0 0 0 ${cx + rx},${cy0} L${cx + rx},${cy1} L${cx},${cy1 + ry} Z`} fill={dark} />}
      <ellipse cx={cx} cy={cy1} rx={rx} ry={ry} fill={top} />
    </g>
  );
}

/** 바닥 위 평면 다각형 */
export function Flat({ p, fill, z = 0, ...rest }: { p: [number, number][]; fill: string; z?: number } & SVGProps<SVGPolygonElement>) {
  return <polygon points={pts(p.map(([a, b]) => [a, b, z]))} fill={fill} {...rest} />;
}

/** 둥근 나무 */
export function Tree({ x, y, z = 0, s = 1, leaf = "#3DD6A3", shade = "#0B9A70", trunk = "#6B4F3A" }: { x: number; y: number; z?: number; s?: number; leaf?: string; shade?: string; trunk?: string }) {
  const [cx, cy] = iso(x, y, z);
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={9 * s} ry={4.5 * s} fill="#000" opacity={0.18} />
      <rect x={cx - 1.6 * s} y={cy - 16 * s} width={3.2 * s} height={16 * s} rx={1.2 * s} fill={trunk} />
      <circle cx={cx} cy={cy - 24 * s} r={12 * s} fill={leaf} />
      <path d={`M${cx + 12 * s},${cy - 24 * s} A${12 * s},${12 * s} 0 0 1 ${cx - 8 * s},${cy - 15 * s} A${12 * s},${12 * s} 0 0 0 ${cx + 12 * s},${cy - 24 * s}Z`} fill={shade} opacity={0.55} />
      <circle cx={cx - 4 * s} cy={cy - 29 * s} r={3.4 * s} fill="#fff" opacity={0.28} />
    </g>
  );
}

/** 작은 사람(작업복) */
export function Person({ x, y, z = 0, s = 1, body = "#12B886", head = "#F6C9A8", hat }: { x: number; y: number; z?: number; s?: number; body?: string; head?: string; hat?: string }) {
  const [cx, cy] = iso(x, y, z);
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={5 * s} ry={2.5 * s} fill="#000" opacity={0.2} />
      <rect x={cx - 4 * s} y={cy - 18 * s} width={8 * s} height={17 * s} rx={4 * s} fill={body} />
      <circle cx={cx} cy={cy - 22.5 * s} r={4 * s} fill={head} />
      {hat && <path d={`M${cx - 4.4 * s},${cy - 23 * s} A${4.4 * s},${4.4 * s} 0 0 1 ${cx + 4.4 * s},${cy - 23 * s} Z`} fill={hat} />}
    </g>
  );
}

/** 반짝임(청결 표현) */
export function Sparkle({ cx, cy, r = 6, fill = "#fff" }: { cx: number; cy: number; r?: number; fill?: string }) {
  const k = r * 0.22;
  return <path d={`M${cx},${cy - r} Q${cx + k},${cy - k} ${cx + r},${cy} Q${cx + k},${cy + k} ${cx},${cy + r} Q${cx - k},${cy + k} ${cx - r},${cy} Q${cx - k},${cy - k} ${cx},${cy - r}Z`} fill={fill} />;
}

/** 면에 창문 격자 */
export function windows(q: FaceFn, opt: { cols: number; rows: number; w: number; h: number; pad?: number; gapX?: number; gapY?: number; color: (r: number, c: number) => string }) {
  const { cols, rows, w, h, pad = 8 } = opt;
  const gx = opt.gapX ?? 4;
  const gy = opt.gapY ?? 6;
  const cw = (w - pad * 2 - gx * (cols - 1)) / cols;
  const ch = (h - pad * 2 - gy * (rows - 1)) / rows;
  const out: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const u0 = pad + c * (cw + gx);
      const v0 = pad + r * (ch + gy);
      out.push(<polygon key={`${r}-${c}`} points={q(u0, v0, u0 + cw, v0 + ch)} fill={opt.color(r, c)} />);
    }
  return out;
}

/** 결정적 의사난수 (렌더할 때마다 같은 그림이 나오도록) */
export function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
