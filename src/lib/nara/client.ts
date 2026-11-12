import "server-only";
import type { Bid, BizType, ContractMethod, Region, ServiceCategory } from "../types";
import { splitLicenses } from "../licenses";
import { CATEGORY_KEYWORDS, NARA_BASE, STD_BID_API } from "./endpoints";

/**
 * 나라장터 OpenAPI 클라이언트.
 * DATA_GO_KR_SERVICE_KEY 환경변수가 있을 때만 실제 호출한다. (키는 절대 커밋하지 않는다)
 *
 * 공고 원천: 조달청_나라장터 공공데이터개방표준서비스 > 입찰공고정보.
 * 한 번의 응답에 면허(투찰가능업종)·참가가능지역·마감일이 모두 들어 있어 별도 조인이 필요 없다.
 * 조회 기간은 하루 단위로만 허용되므로 날짜별로 나눠 호출한다.
 */
export function hasServiceKey(): boolean {
  return !!process.env.DATA_GO_KR_SERVICE_KEY;
}

type Item = Record<string, string | undefined>;

interface ApiEnvelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: Item[] | { item?: Item[] | Item }; totalCount?: number };
  };
  "nkoneps.com.response.ResponseError"?: { header?: { resultCode?: string; resultMsg?: string } };
  OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: string; returnAuthMsg?: string } };
}

const kst = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000);
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => { const k = kst(d); return `${k.getUTCFullYear()}${p2(k.getUTCMonth() + 1)}${p2(k.getUTCDate())}`; };

export async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ serviceKey: key, type: "json", pageNo: "1", numOfRows: "100", ...params });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${NARA_BASE}${path}/${op}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let json: ApiEnvelope;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`응답 파싱 실패: ${text.slice(0, 120)}`);
      }
      const authErr = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (authErr) throw Object.assign(new Error(`인증 오류: ${authErr.returnAuthMsg ?? authErr.errMsg}`), { fatal: true });
      const apiErr = json["nkoneps.com.response.ResponseError"]?.header;
      if (apiErr) throw Object.assign(new Error(`API 오류(${apiErr.resultCode}): ${apiErr.resultMsg}`), { fatal: true });
      const code = json.response?.header?.resultCode;
      if (code && code !== "00") throw Object.assign(new Error(`API 오류(${code}): ${json.response?.header?.resultMsg}`), { fatal: true });
      const raw = json.response?.body?.items;
      const items = Array.isArray(raw) ? raw : raw?.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
      return { items, total: json.response?.body?.totalCount ?? items.length };
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`나라장터 ${op}: ${(lastErr as Error)?.message}`);
}

/* ---------- 변환 ---------- */

function toIso(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  const t = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  const d = new Date(`${date}T${t}:00+09:00`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

const REGION_ALIASES: [string, Region[]][] = [
  ["서울", ["서울"]], ["경기", ["경기"]], ["인천", ["인천"]], ["강원", ["강원"]],
  ["충청북", ["충북"]], ["충북", ["충북"]], ["충청남", ["충남"]], ["충남", ["충남"]],
  ["대전", ["대전"]], ["세종", ["세종"]],
  ["전라북", ["전북"]], ["전북", ["전북"]],
  // 2026년 출범한 전남광주통합특별시: 광주·전남 업체 모두 해당
  ["전남광주", ["광주", "전남"]], ["전라남", ["전남"]], ["전남", ["전남"]], ["광주", ["광주"]],
  ["경상북", ["경북"]], ["경북", ["경북"]], ["경상남", ["경남"]], ["경남", ["경남"]],
  ["대구", ["대구"]], ["울산", ["울산"]], ["부산", ["부산"]], ["제주", ["제주"]],
];

export function mapRegions(s?: string): Region[] {
  if (!s?.trim()) return [];
  const out = new Set<Region>();
  for (const part of s.split(",")) {
    const hit = REGION_ALIASES.find(([k]) => part.includes(k));
    if (hit) hit[1].forEach((r) => out.add(r));
  }
  return [...out];
}

function mapMethod(s?: string): ContractMethod {
  if (!s) return "적격심사";
  if (s.includes("협상")) return "협상에 의한 계약";
  if (s.includes("최저가") && !s.includes("제한적")) return "최저가";
  if (s.includes("수의")) return "수의계약(소액)";
  return "적격심사";
}

/** 공고명이 IT·교육·임차 등 다른 업종인데 키워드만 겹치는 경우를 거른다 */
const EXCLUDE = [
  "시스템", "솔루션", "플랫폼", "소프트웨어", "홈페이지", "전산", "네트워크", "클라우드", "데이터", "펌웨어", "레이더", "정보통신",
  "감리", "설계", "건설사업관리", "시뮬레이션", "개발", "연구", "컨설팅",
  "임차", "리스", "폐기물", "폐토사", "분뇨", "하수처리시설 청소", "세탁", "운송", "운반", "통학버스",
  "교육", "캠프", "교류", "연수", "탐방", "모니터링", "건강검진", "홍보", "축제 운영", "행사", "취사",
  "안전점검", "진단", "관제", "상수관망", "관측망", "바다숲", "스케이트장", "하천환경정비", "검색기", "정보보안", "보안합숙", "보안운송",
];
/** '유지관리'처럼 넓은 키워드일 때 투찰가능업종으로 한 번 더 확인 */
const FACILITY_LICENSE_HINT = ["건물위생", "소독", "시설경비", "경비업", "기계설비", "소방시설", "전기공사", "저수조", "조경", "근로자파견", "청소"];
const STRONG = ["청소", "미화", "경비", "방역", "소독", "해충방제", "시설관리", "시설물 관리", "시설물관리"];

/** 청소·시설관리 계열 용역인지 판별 (아니면 null) */
export function classifyFacility(rawTitle: string, licenseText = ""): ServiceCategory | null {
  // '청소년'의 '청소'를 청소 용역으로 오인하지 않도록 제거
  const title = rawTitle.replace(/청소년/g, "");
  if (EXCLUDE.some((k) => title.includes(k))) return null;
  const has = (c: ServiceCategory) => CATEGORY_KEYWORDS[c].some((k) => title.includes(k));
  const kinds = (["청소", "경비", "시설관리"] as ServiceCategory[]).filter(has);
  let cat: ServiceCategory | null = null;
  if (has("통합관리") || kinds.length >= 2) cat = "통합관리";
  else if (has("방역·소독")) cat = "방역·소독";
  else if (has("경비")) cat = "경비";
  else if (has("청소")) cat = "청소";
  else if (has("시설관리")) cat = "시설관리";
  if (!cat) return null;
  const strong = STRONG.some((k) => title.includes(k));
  const licenseOk = FACILITY_LICENSE_HINT.some((k) => licenseText.includes(k));
  if (!strong && !licenseOk) return null;
  return cat;
}


/* ---------- 전 업종 분류 ---------- */
type Rule = [ServiceCategory, RegExp];
/** 투찰가능업종 → 업종 (먼저 나오는 업종이 대표) */
const LICENSE_RULES: Rule[] = [
  ["IT·소프트웨어", /소프트웨어|컴퓨터관련/],
  ["설계·감리·엔지니어링", /엔지니어링|감리|건축사|건설사업관리|측량|안전진단|기술사사무소|환경영향평가|문화재|매장유산/],
  ["연구·조사·컨설팅", /학술|연구용역|경영컨설팅/],
  ["폐기물·환경", /폐기물|석면|재활용|하수|분뇨|오수/],
  ["행사·홍보·교육", /행사|방송|영상|비디오|광고|인쇄|출판|공연|디자인/],
  ["운송·여행·임차", /여행|운송|화물|여객|시설대여|자동차대여|이사/],
  ["조경·산림", /조경|산림|숲|나무병원|식물보호/],
  ["소방·기계설비공사", /소방시설공사|기계설비|가스공사|냉동냉장|보일러/],
  ["전기·통신공사", /전기공사|정보통신공사|전기|통신/],
  ["건축·토목공사", /공사업|건설업|해체|철거/],
  ["의료·의약품", /의료기기|의약품|약국|의료/],
  ["식자재·급식", /식품|급식|농산물|축산물|수산물|양곡/],
];
/** 공고명 → 업종 */
const TITLE_RULES: Rule[] = [
  ["IT·소프트웨어", /시스템|소프트웨어|S\/W|SW|전산|정보화|홈페이지|플랫폼|클라우드|데이터|네트워크|디지털|AI|앱|서버|보안관제|웹/],
  ["설계·감리·엔지니어링", /설계|감리|건설사업관리|측량|안전진단|안전점검|정밀점검|내진|타당성|환경영향|지질|시굴|발굴/],
  ["연구·조사·컨설팅", /연구|조사|컨설팅|수립|계획|분석|평가|진단|검사|자문|기본구상/],
  ["폐기물·환경", /폐기물|폐자재|수거|재활용|석면|수질|대기|토양|하수|분뇨|준설|쓰레기/],
  ["행사·홍보·교육", /행사|축제|홍보|교육|캠프|프로그램|체험|공연|전시|유튜브|영상|광고|디자인|인쇄|제작|SNS|콘텐츠/],
  ["운송·여행·임차", /여행|수학여행|임차|리스|운송|운반|이전|이사|통학|차량|버스|셔틀/],
  ["조경·산림", /조경|숲가꾸기|가로수|산림|사방|방제|가지치기|벌채|녹지|재선충|수목/],
  ["소방·기계설비공사", /소방|기계설비|냉난방|환기|공조|배관|보일러|승강기|가스/],
  ["전기·통신공사", /전기|통신|CCTV|가로등|조명|태양광|변압|수배전/],
  ["의료·의약품", /의약품|의료|진료재료|주사|inj|mg|제세동|백신|치료/i],
  ["식자재·급식", /식재료|식자재|급식|부식|우유|쌀|간식|도시락/],
  ["컴퓨터·전산장비", /노트북|컴퓨터|PC|서버|모니터|태블릿|프린터|복합기|스토리지|네트워크 장비|전산장비/i],
];

const CATS_BY_BIZ: Record<"용역" | "공사" | "물품", ServiceCategory[]> = {
  용역: ["IT·소프트웨어", "설계·감리·엔지니어링", "연구·조사·컨설팅", "폐기물·환경", "행사·홍보·교육", "운송·여행·임차"],
  공사: ["전기·통신공사", "소방·기계설비공사", "조경·산림", "건축·토목공사"],
  물품: ["의료·의약품", "식자재·급식", "컴퓨터·전산장비"],
};
const FALLBACK: Record<"용역" | "공사" | "물품", ServiceCategory> = { 용역: "기타 용역", 공사: "건축·토목공사", 물품: "기타 물품" };

export function mapBizType(s?: string): BizType {
  if (s === "공사" || s === "물품" || s === "외자") return s;
  return "용역";
}

/**
 * 모든 공고를 업종으로 분류한다.
 * 용역은 청소·시설관리 판별을 먼저 하고, 나머지는 투찰가능업종 → 공고명 키워드 순으로 본다.
 */
export function classify(rawTitle: string, licenseText = "", biz: BizType = "용역"): ServiceCategory {
  const kind = biz === "외자" ? "물품" : biz;
  if (kind === "용역") {
    const f = classifyFacility(rawTitle, licenseText);
    if (f) return f;
  }
  if (kind === "물품" && /관급/.test(rawTitle)) return "관급자재";
  const allowed = CATS_BY_BIZ[kind];
  for (const lic of splitLicenses(licenseText)) {
    const hit = LICENSE_RULES.find(([c, re]) => allowed.includes(c) && re.test(lic));
    if (hit) return hit[0];
  }
  // '청소년'의 청소, '창조경제'의 조경처럼 다른 단어 속 키워드는 지운다
  const title = rawTitle.replace(/청소년|창조경제/g, "");
  const t = TITLE_RULES.find(([c, re]) => allowed.includes(c) && re.test(title));
  return t ? t[0] : FALLBACK[kind];
}

function periodMonths(title: string): number {
  const m = title.match(/(20\d{2}|\d{2})\s*[~∼\-]\s*[‘’']?(20\d{2}|\d{2})/);
  if (m) {
    const a = Number(m[1].slice(-2)), b = Number(m[2].slice(-2));
    if (b >= a && b - a < 5) return (b - a + 1) * 12;
  }
  return 12;
}

export function mapStdItem(it: Item): Bid | null {
  const title = (it.bidNtceNm ?? "").trim();
  if (!title) return null;
  const bizType = mapBizType(it.bsnsDivNm);
  const category = classify(title, it.bidprcPsblIndstrytyNm, bizType);
  const closeAt = toIso(it.bidClseDate, it.bidClseTm) ?? toIso(it.opengDate, it.opengTm);
  if (!closeAt) return null;
  const regions = mapRegions(it.prtcptPsblRgnNm);
  const no = it.bidNtceNo ?? "";
  const ord = it.bidNtceOrd ?? "000";
  const amount = Number(it.asignBdgtAmt || it.presmptPrce || 0);
  const method = mapMethod(it.bidwinrDcsnMthdNm);
  const rate = it.bidwinrDcsnMthdNm?.includes("낙찰하한율") || method === "적격심사" ? 87.745 : undefined;
  return {
    id: `${no}-${ord}`,
    bidNtceNo: no,
    bidNtceOrd: ord,
    title,
    category,
    bizType,
    agency: it.ntceInsttNm ?? "",
    demandAgency: it.dmndInsttNm || it.ntceInsttNm || "",
    region: regions[0] ?? "전국",
    regions: regions.length ? regions : undefined,
    licenses: splitLicenses(it.bidprcPsblIndstrytyNm),
    licenseRaw: splitLicenses(it.bidprcPsblIndstrytyNm).join(", ") || undefined,
    baseAmount: amount,
    contractMethod: method,
    lowerLimitRate: rate,
    jointContract: it.cmmnCntrctYn === "Y",
    smallBizOnly: false,
    periodMonths: periodMonths(title),
    postedAt: toIso(it.bidNtceDate, it.bidNtceBgn) ?? new Date().toISOString(),
    closeAt,
    openAt: toIso(it.opengDate, it.opengTm) ?? closeAt,
    briefingAt: it.presnatnOprtnYn === "Y" ? toIso(it.presnatnOprtnDate, it.presnatnOprtnTm) : undefined,
    detailUrl: it.bidNtceUrl || "https://www.g2b.go.kr",
    source: "g2b",
  };
}

/** 표준서비스는 한 번에 999건까지 준다 (1000 이상을 넣으면 10건으로 되돌아간다) */
const ROWS = 999;

async function fetchStdDay(day: string): Promise<Item[]> {
  const params = { bidNtceBgnDt: `${day}0000`, bidNtceEndDt: `${day}2359`, numOfRows: String(ROWS) };
  const first = await call(STD_BID_API.path, STD_BID_API.operations.bidList, { ...params, pageNo: "1" });
  const pages = Math.ceil(first.total / ROWS);
  const rest: Item[] = [];
  for (let p = 2; p <= pages; p++) {
    rest.push(...(await call(STD_BID_API.path, STD_BID_API.operations.bidList, { ...params, pageNo: String(p) })).items);
  }
  return [...first.items, ...rest];
}

/** 동시에 n개씩 실행 (공공데이터포털 과부하를 피하려고 너무 크게 잡지 않는다) */
export async function mapLimit<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  }));
  return out;
}

/** 최근 N일 날짜(YYYYMMDD, KST) 목록 */
export function recentDays(days: number, now = new Date()): string[] {
  return Array.from({ length: days }, (_, i) => ymd(new Date(now.getTime() - i * 86400000)));
}

/**
 * 수집 기간(게시일 기준). 나라장터 공고는 게시 후 1~4주 뒤에 마감되는 경우가 많아
 * 최근 며칠치만 받으면 아직 마감 전인 공고 대부분이 빠진다.
 * 2026-11-12 실측: 마감 전 공고 12,315건 중 게시 3일 이내 3,832건, 3~13일 6,773건, 14~29일 1,437건, 30일 이상 273건.
 */
export const COLLECT_DAYS = 60;

/**
 * 최근 N일 동안 게시된 모든 업종(용역·공사·물품·외자) 공고 중 아직 마감 전인 공고를 업종별로 분류해 가져온다.
 * 정정·재입찰 공고는 최신 차수만 남기고, 최신 차수가 취소공고면 목록에서 뺀다.
 */
export async function fetchAllBids(days = COLLECT_DAYS): Promise<Bid[]> {
  const now = new Date();
  const perDay = await mapLimit(recentDays(days, now), 4, fetchStdDay);
  const latest = new Map<string, Item>(); // bidNtceNo → 최신 차수 원본
  for (const it of perDay.flat()) {
    const no = it.bidNtceNo;
    if (!no) continue;
    const prev = latest.get(no);
    if (prev && (prev.bidNtceOrd ?? "000") >= (it.bidNtceOrd ?? "000")) continue;
    latest.set(no, it);
  }
  const out: Bid[] = [];
  for (const it of latest.values()) {
    if (it.bidNtceSttusNm?.includes("취소")) continue;
    const b = mapStdItem(it);
    if (!b || new Date(b.closeAt).getTime() <= now.getTime()) continue;
    out.push(b);
  }
  return out.sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt));
}
