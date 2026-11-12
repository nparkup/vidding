/**
 * 발주기관 표기 (자체 제작). 실제 기관 CI가 아니라 기관 유형별 도형과 이름 첫 글자로 만든 엠블럼이다.
 * 공고 데이터의 기관명만으로 그리므로 매일 바뀌는 기관 목록에도 그대로 동작한다.
 */

type Kind = "local" | "edu" | "corp" | "gov";

const KIND: Record<Kind, { fill: string; ink: string; label: string }> = {
  local: { fill: "#12B886", ink: "#FFFFFF", label: "지자체" },
  edu: { fill: "#3B82F6", ink: "#FFFFFF", label: "교육기관" },
  corp: { fill: "#F0A63A", ink: "#FFFFFF", label: "공기업·공단" },
  gov: { fill: "#24304A", ink: "#FFFFFF", label: "중앙행정기관" },
};

function kindOf(name: string): Kind {
  if (/교육청|학교|대학/.test(name)) return "edu";
  if (/공사|공단|공원|진흥원|재단/.test(name)) return "corp";
  if (/부$|부 |청$|처$|본부|위원회/.test(name) && !/[시군구도]청$/.test(name)) return "gov";
  return "local";
}

/** "경기도 수원시" → ["경기도", "수원시"], "경기도교육청" → ["", "경기도교육청"] */
function split(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return ["", parts[0]];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

function Emblem({ kind, ch }: { kind: Kind; ch: string }) {
  const k = KIND[kind];
  const shape =
    kind === "local" ? <circle cx="18" cy="18" r="17" fill={k.fill} />
    : kind === "edu" ? <rect x="1" y="1" width="34" height="34" rx="9" fill={k.fill} />
    : kind === "corp" ? <path d="M18 1l14.7 8.5v17L18 35 3.3 26.5v-17z" fill={k.fill} />
    : <path d="M18 1l15 5v11c0 9-6.4 15.4-15 18C9.4 32.4 3 26 3 17V6z" fill={k.fill} />;
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0" aria-hidden>
      {shape}
      <path d="M8 25.5h20" stroke={k.ink} strokeOpacity=".35" strokeWidth="1.6" strokeLinecap="round" />
      <text x="18" y="22" textAnchor="middle" fontSize="15" fontWeight="800" fill={k.ink}>{ch}</text>
    </svg>
  );
}

export function AgencyMark({ name }: { name: string }) {
  const [top, main] = split(name);
  const kind = kindOf(main);
  const ch = main.replace(/^(국립|한국)/, "").charAt(0);
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-2xl border border-ink-100 bg-white py-2 pl-2 pr-4" title={`${name} (${KIND[kind].label})`}>
      <Emblem kind={kind} ch={ch} />
      <span className="flex flex-col leading-tight">
        {top && <span className="text-[10px] font-medium text-ink-400">{top}</span>}
        <span className="text-[14px] font-extrabold tracking-[-0.03em] text-ink-700">{main}</span>
      </span>
    </span>
  );
}

export const AGENCY_KINDS = Object.values(KIND);
