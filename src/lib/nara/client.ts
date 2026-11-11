import "server-only";
import type { Bid, ContractMethod, License, Region, ServiceCategory } from "../types";
import { LICENSES } from "../types";
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

async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
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

function mapLicenses(s?: string): License[] {
  const names = (s ?? "").split(",");
  return LICENSES.filter((l) => names.some((n) => n.replace(/\s/g, "").includes(l)));
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

export function classify(rawTitle: string, licenseText = ""): ServiceCategory | null {
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

function periodMonths(title: string): number {
  const m = title.match(/(20\d{2}|\d{2})\s*[~∼\-]\s*[‘’']?(20\d{2}|\d{2})/);
  if (m) {
    const a = Number(m[1].slice(-2)), b = Number(m[2].slice(-2));
    if (b >= a && b - a < 5) return (b - a + 1) * 12;
  }
  return 12;
}

export function mapStdItem(it: Item): Bid | null {
  if (it.bsnsDivNm && it.bsnsDivNm !== "용역") return null;
  const title = (it.bidNtceNm ?? "").trim();
  const category = classify(title, it.bidprcPsblIndstrytyNm);
  if (!category) return null;
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
    agency: it.ntceInsttNm ?? "",
    demandAgency: it.dmndInsttNm || it.ntceInsttNm || "",
    region: regions[0] ?? "전국",
    regions: regions.length ? regions : undefined,
    licenses: mapLicenses(it.bidprcPsblIndstrytyNm),
    licenseRaw: [...new Set((it.bidprcPsblIndstrytyNm ?? "").split(",").map((x) => x.trim()).filter(Boolean))].join(", ") || undefined,
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

async function fetchStdDay(day: string): Promise<Item[]> {
  const params = { bidNtceBgnDt: `${day}0000`, bidNtceEndDt: `${day}2359`, numOfRows: "300" };
  const first = await call(STD_BID_API.path, STD_BID_API.operations.bidList, { ...params, pageNo: "1" });
  const pages = Math.min(Math.ceil(first.total / 300), 15);
  const rest: Item[] = [];
  for (let p = 2; p <= pages; p++) {
    rest.push(...(await call(STD_BID_API.path, STD_BID_API.operations.bidList, { ...params, pageNo: String(p) })).items);
  }
  return [...first.items, ...rest];
}

/**
 * 최근 N일 동안 게시된 용역 공고 중 청소·시설관리 공고만 추린다.
 * 마감이 지난 공고는 제외한다.
 */
export async function fetchFacilityBids(days = 3): Promise<Bid[]> {
  const now = new Date();
  const dayList = Array.from({ length: days }, (_, i) => ymd(new Date(now.getTime() - i * 86400000)));
  const seen = new Map<string, Bid>();
  for (const day of dayList) {
    for (const it of await fetchStdDay(day)) {
      const b = mapStdItem(it);
      if (!b || new Date(b.closeAt).getTime() <= now.getTime()) continue;
      // 정정공고(차수 증가)는 최신 차수만 유지
      const prev = [...seen.values()].find((x) => x.bidNtceNo === b.bidNtceNo);
      if (prev && prev.bidNtceOrd >= b.bidNtceOrd) continue;
      if (prev) seen.delete(prev.id);
      seen.set(b.id, b);
    }
  }
  return [...seen.values()].sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt));
}
