import "server-only";
import type { Bid, BizType, ContractMethod, Region, ServiceCategory } from "../types";
import { splitLicenses } from "../licenses";
import { mapRegions } from "../regions";
export { mapRegions };
import { CHANGE_DAYS, diffBids, type NoticeChange } from "../noticeChanges";
import { NARA_BASE, STD_BID_API } from "./endpoints";
import { classify } from "../classify";
export { classify, classifyFacility } from "../classify";

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

function mapMethod(s?: string): ContractMethod {
  if (!s) return "적격심사";
  // 수의시담·수의시담(2인 이상)은 지정 업체와만 계약하는 건이라 소액수의견적과 따로 둔다
  if (s.includes("시담")) return "수의시담";
  if (s.includes("협상")) return "협상에 의한 계약";
  // 아래 셋은 평가 배점표가 없고 가격(규격 적합 여부 포함)으로 정한다. 예전엔 적격심사로 섞였다
  if (/규격\s*가격|규격.*동시/.test(s)) return "규격가격동시입찰";
  if (s.includes("2단계")) return "2단계경쟁";
  if (s.includes("제한적") && s.includes("최저가")) return "제한적최저가";
  if (s.includes("최저가")) return "최저가";
  if (s.includes("수의")) return "수의계약(소액)";
  return "적격심사";
}


export function mapBizType(s?: string): BizType {
  if (s === "공사" || s === "물품" || s === "외자") return s;
  return "용역";
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
    awardRaw: it.bidwinrDcsnMthdNm?.trim() || undefined,
    contractType: it.cntrctCnclsMthdNm?.trim() || undefined,
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
  return (await fetchAllBidsWithChanges(days)).bids;
}

/** 공고 목록과 함께 최근 정정·취소 내역(차수 사이 바뀐 항목)을 돌려준다 (lib/noticeChanges) */
export async function fetchAllBidsWithChanges(days = COLLECT_DAYS): Promise<{ bids: Bid[]; changes: NoticeChange[] }> {
  const now = new Date();
  const perDay = await mapLimit(recentDays(days, now), 4, fetchStdDay);
  return splitOrders(perDay.flat(), now);
}

/** 공고번호별 차수를 모아 최신 차수 공고와 정정·취소 내역으로 나눈다 */
export function splitOrders(rows: Item[], now = new Date()): { bids: Bid[]; changes: NoticeChange[] } {
  const byNo = new Map<string, Map<string, Item>>(); // bidNtceNo → 차수 → 원본
  for (const it of rows) {
    const no = it.bidNtceNo;
    if (!no) continue;
    const m = byNo.get(no) ?? byNo.set(no, new Map()).get(no)!;
    m.set(it.bidNtceOrd ?? "000", it);
  }
  const out: Bid[] = [];
  const changes: NoticeChange[] = [];
  const since = now.getTime() - CHANGE_DAYS * 86400000;
  for (const orders of byNo.values()) {
    const ords = [...orders.keys()].sort();
    const latest = orders.get(ords[ords.length - 1])!;
    const cancelled = !!latest.bidNtceSttusNm?.includes("취소");
    let live: Bid | null = null;
    if (!cancelled) {
      const b = mapStdItem(latest);
      if (b && new Date(b.closeAt).getTime() > now.getTime()) { out.push(b); live = b; }
    }
    // 차수마다 바로 앞 차수와 비교 (게시일이 CHANGE_DAYS 안인 것만)
    for (let i = 0; i < ords.length; i++) {
      const cur = orders.get(ords[i])!;
      const ord = cur.bidNtceOrd ?? "000";
      if (ord === "000") continue;
      const kind = cur.bidNtceSttusNm?.includes("취소") ? "취소" : cur.bidNtceSttusNm?.includes("정정") ? "정정" : null;
      if (!kind) continue;
      const at = toIso(cur.bidNtceDate, cur.bidNtceBgn);
      if (!at || new Date(at).getTime() < since) continue;
      const prevItem = i > 0 ? orders.get(ords[i - 1]) : undefined;
      const prev = prevItem ? mapStdItem(prevItem) : null;
      const next = mapStdItem(cur) ?? prev;
      if (!next) continue;
      changes.push({
        no: next.bidNtceNo,
        ord,
        prevOrd: prev?.bidNtceOrd,
        kind,
        at,
        title: next.title,
        agency: next.agency,
        demandAgency: next.demandAgency,
        bizType: next.bizType,
        category: next.category,
        // 이 차수가 아니어도 같은 공고번호의 진행 중 공고가 있으면 그 상세로 잇는다 (정정 1차 → 지금 2차)
        bidId: live?.id,
        closeAt: next.closeAt,
        baseAmount: next.baseAmount || prev?.baseAmount || undefined,
        fields: kind === "정정" && prev ? diffBids(prev, next) : [],
        detailUrl: next.detailUrl,
      });
      // 진행 중인 공고가 이번 정정 차수면 목록 카드에 '정정' 표시를 붙인다
      if (kind === "정정" && live && live.bidNtceOrd === ord) live.amend = { at, fields: changes[changes.length - 1].fields.map((f) => f.field) };
    }
  }
  return {
    bids: out.sort((a, b) => +new Date(a.closeAt) - +new Date(b.closeAt)),
    changes: changes.sort((a, b) => b.at.localeCompare(a.at)),
  };
}
