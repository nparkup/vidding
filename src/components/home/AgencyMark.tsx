import type { ReactNode } from "react";
import { agencyLogo, agencyLogoLabel } from "@/lib/agencyLogos";
import { agencyKind } from "@/lib/agencyKind";

/**
 * 발주기관 표기. 공식 CI가 확인된 기관(src/lib/agencyLogos.ts)은 CI와 기관명을,
 * 나머지는 기관 유형별 도형과 이름 첫 글자로 만든 자체 엠블럼을 보여 준다.
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

/** 아래 줄 이름에서 위 줄과 겹치는 시·도 이름을 뺀다. "전북특별자치도교육청" + "전북특별자치도전주교육지원청" → "전주교육지원청" */
function trimRegion(top: string, main: string): string {
  const m = main.match(/^\S+?(특별자치도|특별자치시|특별시|광역시|통합특별시|도)(?=\S)/);
  if (!m || !top.startsWith(m[0])) return main;
  const rest = main.slice(m[0].length);
  return rest.length >= 2 ? rest : main;
}

/**
 * 띠의 모든 칸을 같은 틀로 맞춘다: 칸 높이 고정(폭은 이름 길이만큼), CI는 같은 크기 상자 안에 가운데 맞춤,
 * 글자는 항상 두 줄(위: 상위 기관 또는 기관 유형, 아래: 기관 이름).
 */
function Card({ title, mark, top, main }: { title: string; mark: ReactNode; top: string; main: string }) {
  return (
    <span className="inline-flex h-[64px] items-center gap-3 whitespace-nowrap rounded-2xl border border-ink-100 bg-white pl-3 pr-5" title={title}>
      <span className="flex h-9 w-[80px] shrink-0 items-center justify-center">{mark}</span>
      <span className="h-8 w-px shrink-0 bg-ink-100" aria-hidden />
      <span className="flex flex-col justify-center gap-0.5 leading-tight">
        <span className="text-[11px] font-medium text-ink-400">{top}</span>
        <span className="text-[14px] font-bold tracking-[-0.02em] text-ink-700">{main}</span>
      </span>
    </span>
  );
}

/** 상위 기관이 없는 칸의 윗줄. 발주처 분석과 같은 구분(src/lib/agencyKind.ts)을 쓰되 기관 하나에 맞는 말로 줄인다 */
function kindLine(name: string): string {
  switch (agencyKind(name)) {
    case "gov": return "중앙행정기관";
    case "local1": return "광역자치단체";
    case "local2": return "기초자치단체";
    case "edu": return "교육청";
    case "school": return /대학/.test(name) ? "대학교" : "학교";
    case "corp": return /공사$|공단$/.test(name) ? "공기업" : "공공기관";
    case "mil": return "국방기관";
    case "welfare": return "복지시설";
    case "biz": return /조합|협회|법인/.test(name) ? "조합·단체" : "기업";
    default: return "공공기관";
  }
}

export function AgencyMark({ name }: { name: string }) {
  const [rawTop, rawMain] = split(name);
  const kind = kindOf(rawMain);
  const top = rawTop || kindLine(rawMain);
  const main = rawTop ? trimRegion(rawTop, rawMain) : rawMain;
  const ch = rawMain.replace(/^(국립|한국)/, "").charAt(0);
  const logo = agencyLogo(name);
  if (logo) {
    // 흐르는 띠에서 이미지가 늦게 받아져 폭이 바뀌면 띠가 덜컥이므로 상자 크기는 고정하고, 그림은 비율대로 상자 안에 맞춘다
    const ratio = logo.ratio || 1;
    const h = ratio > 80 / 36 ? Math.round(80 / ratio) : 36;
    const w = Math.round(h * ratio);
    return (
      <Card
        title={name}
        top={top}
        main={main}
        mark={
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.src}
            alt={`${agencyLogoLabel(name)} CI`}
            width={w}
            height={h}
            style={{ width: w, height: h }}
            className="object-contain"
            loading="eager"
            decoding="async"
            draggable={false}
          />
        }
      />
    );
  }
  return <Card title={`${name} (${KIND[kind].label})`} top={top} main={main} mark={<Emblem kind={kind} ch={ch} />} />;
}

export const AGENCY_KINDS = Object.values(KIND);
