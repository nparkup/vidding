/**
 * 수요기관 이름으로 큰 구분(중앙행정기관·지자체·교육청·학교·공공기관·군 등)과 시·도를 정한다.
 * 공고 데이터의 기관명은 "경기도교육청 경기도용인교육지원청 OO초등학교"처럼 상위 기관부터 띄어 쓴다.
 * 이름만 보고 정하므로 일부는 다른 구분에 들어갈 수 있다. 위에서부터 먼저 맞는 규칙을 쓴다.
 */

export type AgencyKind = "gov" | "local1" | "local2" | "edu" | "school" | "corp" | "mil" | "welfare" | "biz" | "etc";

export const AGENCY_KINDS: { key: AgencyKind; label: string; title: string }[] = [
  { key: "gov", label: "중앙행정기관", title: "중앙행정기관·국가기관과 소속기관 (국회·법원·선관위 포함)" },
  { key: "local1", label: "광역자치단체", title: "시·도와 그 본부·사업소" },
  { key: "local2", label: "기초자치단체", title: "시·군·구와 읍·면·동, 사업소" },
  { key: "edu", label: "교육청", title: "시·도교육청과 교육지원청" },
  { key: "school", label: "학교·대학", title: "초·중·고등학교, 대학교, 유치원" },
  { key: "corp", label: "공기업·공공기관", title: "공사·공단, 출연연구기관, 재단, 공공병원 등" },
  { key: "mil", label: "군·국방", title: "국방부, 육·해·공군, 방위사업청, 병무청, 부대" },
  { key: "welfare", label: "복지시설", title: "복지관, 요양원, 지역아동센터 등 사회복지시설" },
  { key: "biz", label: "기업·조합·단체", title: "주식회사, 농·축·수협, 조합, 사단법인·협회" },
  { key: "etc", label: "기타", title: "위 구분에 들지 않은 기관" },
];

export const KIND_LABEL = Object.fromEntries(AGENCY_KINDS.map((k) => [k.key, k.label])) as Record<AgencyKind, string>;

/** 시·도 정식 이름 → 짧은 이름 (화면 표기·필터 값) */
const PROVINCES: [string, string][] = [
  ["서울특별시", "서울"], ["부산광역시", "부산"], ["대구광역시", "대구"], ["인천광역시", "인천"], ["광주광역시", "광주"],
  ["대전광역시", "대전"], ["울산광역시", "울산"], ["세종특별자치시", "세종"], ["경기도", "경기"],
  ["강원특별자치도", "강원"], ["강원도", "강원"], ["충청북도", "충북"], ["충청남도", "충남"],
  ["전북특별자치도", "전북"], ["전라북도", "전북"], ["전남광주통합특별시", "전남광주"], ["전라남도", "전남"],
  ["경상북도", "경북"], ["경상남도", "경남"], ["제주특별자치도", "제주"],
];
/** 첫 단어로만 쓰는 줄인 이름 */
const ALIAS: Record<string, string> = {
  서울시: "서울", 부산시: "부산", 대구시: "대구", 인천시: "인천", 광주시: "광주", 대전시: "대전", 울산시: "울산", 세종시: "세종",
  경기: "경기", 강원: "강원", 충북: "충북", 충남: "충남", 전북: "전북", 전남: "전남", 경북: "경북", 경남: "경남", 제주: "제주",
};

/** 화면의 시·도 순서 */
export const REGION_ORDER = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "전남광주", "경북", "경남", "제주"];

const CENTRAL_EXTRA = /^(국무조정실|국무총리비서실|국무총리실|국민권익위원회|공정거래위원회|개인정보보호위원회|금융위원회|원자력안전위원회|방송미디어통신위원회|방송통신위원회|국회|국회사무처|국회도서관|대법원|법원행정처|헌법재판소|중앙선거관리위원회|감사원|대통령비서실|대통령경호처|국가정보원|고위공직자범죄수사처|인사혁신처|법제처|국가인권위원회|진실화해를위한과거사정리위원회)$/;
const MIL = /국방|육군|해군|공군|해병|국군|방위사업청|병무청|합동참모|사령부|비행단|함대|사단$|여단$|부대$/;
const SCHOOL = /(학교|대학|대학교|유치원|대학원|산학협력단)$/;
const WELFARE_PRE = /^(사회복지법인|\(복\)|복지법인)/;
const WELFARE = /(복지관|복지원|복지회관|복지센터|요양원|요양시설|요양센터|의집|재활원|재활시설|보호작업장|마을|복지타운|어린이집|복지시설|그린빌|공동생활가정|자립생활센터|쉼터|보육원|양로원|목양원|지역아동센터|자활센터|청소년센터|시니어|실버|케어센터|아동보호|일시보호소|거주시설|노인복지|장애인복지|재가)/;
const BIZ = /(주식회사|\(주\)|㈜|（주）|영농조합|산림조합|협동조합|농협|축협|수협|조합공동사업법인|농업회사법인|상권조합|사단법인|\(사\)|사\)|학교법인|의료법인|특수법인)/;
const PUBLIC = /(공사|공단|진흥원|진흥회|과학기술원|연구원|개발원|의료원|병원|은행|중앙회|적십자사|체육회|공항|위원회|연구회|평가원|관리원|정보원|기술원|연구소|테크노파크|혁신센터|재단|공제조합|공제회|보증기금|감독원|상공회의소|협회|개발센터|의학원|박물관|도서관|미술관|관리단|지원단|인증원|보장원|서비스원|예술의전당|방송|지원센터|협의회)$/;
const SGG = /^[가-힣]{1,5}(시|군|구)$/;

const provinceOfToken = (t: string): string | undefined => {
  if (ALIAS[t]) return ALIAS[t];
  return PROVINCES.find(([p]) => t === p || t === `${p}청`)?.[1];
};

/** 이름 어디에든 들어 있는 시·도 (가장 앞에 나온 것) */
export function agencyRegion(name: string): string | undefined {
  const t0 = name.trim().split(/\s+/)[0] ?? "";
  if (ALIAS[t0]) return ALIAS[t0];
  const flat = name.replace(/\s+/g, "");
  let best: [number, string] | undefined;
  for (const [p, short] of PROVINCES) {
    const i = flat.indexOf(p);
    if (i >= 0 && (!best || i < best[0])) best = [i, short];
  }
  return best?.[1];
}

const memo = new Map<string, AgencyKind>();

export function agencyKind(name: string): AgencyKind {
  const hit = memo.get(name);
  if (hit) return hit;
  const k = classify(name);
  memo.set(name, k);
  return k;
}

function classify(name: string): AgencyKind {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (!t.length) return "etc";
  const f = t.join("");
  const t0 = t[0];
  const last = t[t.length - 1];

  if (MIL.test(f)) return "mil";
  if (SCHOOL.test(last) || /(대학교|대학)$/.test(t0)) return "school";
  if (t.some((x) => /교육(지원)?청$/.test(x))) return "edu";
  if (WELFARE_PRE.test(t0) || WELFARE.test(f)) return "welfare";
  if (/(공사|공단)/.test(t0)) return "corp";
  if ((/^[가-힣]{2,}(부|청|처)$/.test(t0) && !/(도청|시청|군청|구청|교육청|지원청)$/.test(t0)) || CENTRAL_EXTRA.test(t0) || /(법원|검찰청)$/.test(t0)) return "gov";

  // 지자체: 첫 단어가 시·도(경기도, 서울시), 시·도+시군구(경상남도고성군), 시·군·구
  const prov = provinceOfToken(t0);
  const provSgg = !prov && PROVINCES.some(([p]) => t0.startsWith(p) && SGG.test(t0.slice(p.length)));
  const sgg0 = !prov && SGG.test(t0);
  if (prov || provSgg || sgg0) {
    if (t.some((x) => /(공사|공단)$/.test(x))) return "corp";
    if (provSgg || sgg0 || t.slice(1).some((x) => SGG.test(x) && !provinceOfToken(x))) return "local2";
    return "local1";
  }
  if (BIZ.test(f)) return "biz";
  if (t.some((x) => PUBLIC.test(x)) || /^(한국|국립|국민|\(재\)|재단법인)/.test(t0)) return "corp";
  return "etc";
}
