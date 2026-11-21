import data from "./agencyLogos.data.json";

/**
 * 발주기관 공식 CI.
 * 파일은 빌드 때 scripts/agency-logos/fetch.mjs 가 위키미디어 공용에서 받아 public/agency-logos/ 에 둔다.
 * 어떤 기관이 어떤 파일인지는 scripts/agency-logos/sources.json 에 사람이 보고 적은 목록이며,
 * 목록에 없는 기관은 추측하지 않고 자체 유형 표시(AgencyMark)로 둔다.
 *
 * 공고 데이터의 기관명은 "경기도교육청 경기도용인교육지원청"처럼 상위 기관부터 띄어 쓴다.
 * 가장 아래 단계부터 목록에 있는 기관을 찾되, 그 아래에 학교나 시·군·구가 붙으면
 * 그 기관은 자기 CI가 따로 있으므로 상위 기관 CI를 쓰지 않는다.
 */
const FILES: Record<string, string> = data;

/** 중앙행정기관과 그 소속기관은 2016년부터 정부상징 하나를 함께 쓴다 */
const GOV = "정부상징";

const PROVINCES = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
  "전남광주통합특별시",
];

const norm = (s: string) =>
  s.replace(/\((재|사|주)\)|㈜|주식회사|재단법인|사단법인|사회복지법인/g, "").replace(/\s+/g, "").trim();

const COMMITTEES = /^(국무조정실|국무총리비서실|국민권익위원회|공정거래위원회|개인정보보호위원회|금융위원회|원자력안전위원회|방송미디어통신위원회|방송통신위원회)$/;

function isCentral(t: string) {
  return (/^[가-힣]{2,}(부|청|처)$/.test(t) && !/(도청|시청|군청|구청|교육청|지원청)$/.test(t)) || COMMITTEES.test(t);
}

const isLocalGov = (t: string) => /^[가-힣]{1,5}(시|군|구)$/.test(t);
const isSchool = (t: string) => /(학교|유치원)$/.test(t);

function keyOf(t: string): string | undefined {
  if (FILES[t] && t !== GOV) return t;
  // 경기도용인교육지원청, 울산광역시강북교육청 → 시·도교육청
  if (/교육(지원)?청$/.test(t)) {
    const p = PROVINCES.find((p) => t.startsWith(p));
    if (p && FILES[`${p}교육청`]) return `${p}교육청`;
  }
  // 경기도청 → 경기도
  if (/(도청|시청)$/.test(t)) {
    const p = PROVINCES.find((p) => `${p}청` === t);
    if (p && FILES[p]) return p;
  }
  return undefined;
}

const cache = new Map<string, string | null>();

/** 기관명에 맞는 CI 목록 키 (없으면 null). 같은 키면 같은 로고 */
export function agencyLogoKey(name: string): string | null {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const toks = name.split(/\s+/).map(norm).filter(Boolean);
  let key: string | null = null;
  if (toks.length && isCentral(toks[0])) key = FILES[GOV] ? GOV : null;
  else {
    for (let i = toks.length - 1; i >= 0; i--) {
      const k = keyOf(toks[i]);
      if (!k) continue;
      const rest = toks.slice(i + 1);
      key = rest.some((r) => isSchool(r) || isLocalGov(r)) ? null : k;
      break;
    }
  }
  cache.set(name, key);
  return key;
}

export function agencyLogoSrc(name: string): string | undefined {
  const key = agencyLogoKey(name);
  const file = key ? FILES[key] : undefined;
  return file ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/agency-logos/${file}` : undefined;
}

/** CI를 쓰는 기관 이름(정부상징이면 "정부상징") — 대체 텍스트용 */
export function agencyLogoLabel(name: string): string | undefined {
  const key = agencyLogoKey(name);
  return key === GOV ? "대한민국 정부상징" : key ?? undefined;
}
