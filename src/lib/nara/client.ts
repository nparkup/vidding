import "server-only";
import type { Bid, ContractMethod, License, Region, ServiceCategory } from "../types";
import { LICENSES, REGIONS } from "../types";
import { CATEGORY_KEYWORDS, NARA_APIS, NARA_BASE } from "./endpoints";

/**
 * 나라장터 OpenAPI 클라이언트.
 * DATA_GO_KR_SERVICE_KEY 환경변수가 있을 때만 실제 호출한다. (키는 절대 커밋하지 않는다)
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
}

function fmt(d: Date): string {
  // YYYYMMDDHHMM (KST)
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}${p(k.getUTCHours())}${p(k.getUTCMinutes())}`;
}

async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ serviceKey: key, type: "json", pageNo: "1", numOfRows: "100", ...params });
  const res = await fetch(`${NARA_BASE}${path}/${op}?${qs}`, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`나라장터 API 오류: HTTP ${res.status}`);
  const text = await res.text();
  let json: ApiEnvelope;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 XML로 내려온다
    throw new Error(`나라장터 API 응답 파싱 실패: ${text.slice(0, 200)}`);
  }
  const code = json.response?.header?.resultCode;
  if (code && code !== "00") throw new Error(`나라장터 API 오류(${code}): ${json.response?.header?.resultMsg}`);
  const raw = json.response?.body?.items;
  const items = Array.isArray(raw) ? raw : raw?.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
  return { items, total: json.response?.body?.totalCount ?? items.length };
}

function toIso(s?: string): string {
  if (!s) return new Date().toISOString();
  // "2026-11-11 10:00:00" 또는 "202611111000"
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h = "00", mi = "00"] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`).toISOString();
}

export function classify(title: string): ServiceCategory | null {
  const order: ServiceCategory[] = ["통합관리", "방역·소독", "경비", "청소", "시설관리"];
  for (const c of order) {
    if (CATEGORY_KEYWORDS[c].some((k) => title.includes(k))) return c;
  }
  return null;
}

function mapMethod(s?: string): ContractMethod {
  if (!s) return "적격심사";
  if (s.includes("협상")) return "협상에 의한 계약";
  if (s.includes("최저")) return "최저가";
  if (s.includes("수의")) return "수의계약(소액)";
  return "적격심사";
}

function mapRegion(s?: string): Region {
  if (!s) return "전국";
  const hit = REGIONS.find((r) => s.includes(r));
  return hit ?? "전국";
}

function mapLicenses(names: string[]): License[] {
  return LICENSES.filter((l) => names.some((n) => n.includes(l)));
}

/**
 * 최근 N시간 동안 등록된 용역 공고를 가져와 청소·시설관리 공고만 추린다.
 * 참가가능지역·면허제한은 별도 오퍼레이션에서 공고번호별로 조회해 합친다.
 */
export async function fetchFacilityBids(hours = 24): Promise<Bid[]> {
  const api = NARA_APIS[0];
  const end = new Date();
  const begin = new Date(end.getTime() - hours * 3600 * 1000);
  const range = { inqryDiv: "1", inqryBgnDt: fmt(begin), inqryEndDt: fmt(end) };

  const { items } = await call(api.path, api.operations.serviceList, range);
  const picked = items
    .map((it) => ({ it, category: classify(it.bidNtceNm ?? "") }))
    .filter((x): x is { it: Item; category: ServiceCategory } => !!x.category);

  // 지역/면허 제한은 같은 기간으로 조회 후 공고번호로 조인
  const [regionRes, licenseRes] = await Promise.all([
    call(api.path, api.operations.region, range).catch(() => ({ items: [] as Item[], total: 0 })),
    call(api.path, api.operations.license, range).catch(() => ({ items: [] as Item[], total: 0 })),
  ]);
  const regionBy = new Map<string, string>();
  for (const r of regionRes.items) if (r.bidNtceNo) regionBy.set(r.bidNtceNo, r.prtcptPsblRgnNm ?? "");
  const licenseBy = new Map<string, string[]>();
  for (const l of licenseRes.items) {
    if (!l.bidNtceNo) continue;
    licenseBy.set(l.bidNtceNo, [...(licenseBy.get(l.bidNtceNo) ?? []), l.lcnsLmtNm ?? ""]);
  }

  return picked.map(({ it, category }) => {
    const no = it.bidNtceNo ?? "";
    const ord = it.bidNtceOrd ?? "000";
    const amount = Number(it.asignBdgtAmt || it.presmptPrce || 0);
    return {
      id: `${no}-${ord}`,
      bidNtceNo: no,
      bidNtceOrd: ord,
      title: it.bidNtceNm ?? "(공고명 없음)",
      category,
      agency: it.ntceInsttNm ?? "",
      demandAgency: it.dminsttNm ?? it.ntceInsttNm ?? "",
      region: mapRegion(regionBy.get(no)),
      licenses: mapLicenses(licenseBy.get(no) ?? []),
      baseAmount: amount,
      contractMethod: mapMethod(it.cntrctCnclsMthdNm),
      lowerLimitRate: it.sucsfbidLwltRate ? Number(it.sucsfbidLwltRate) : undefined,
      jointContract: (it.cmmnSpldmdMethdNm ?? "").length > 0 && !(it.cmmnSpldmdMethdNm ?? "").includes("단독"),
      smallBizOnly: false,
      periodMonths: 12,
      postedAt: toIso(it.bidNtceDt),
      closeAt: toIso(it.bidClseDt),
      openAt: toIso(it.opengDt),
      detailUrl: it.bidNtceDtlUrl ?? "https://www.g2b.go.kr",
      source: "g2b",
    } satisfies Bid;
  });
}
