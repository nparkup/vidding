import "server-only";
import type { AptBid, AptCategory, AptPrior } from "../apt";

/**
 * 공동주택(아파트) 입찰 수집. 공공데이터포털 국토교통부 서비스 2개 (키는 나라장터와 같은 DATA_GO_KR_SERVICE_KEY):
 * - 공동주택 입찰공고 정보제공 서비스 (ApHusBidPblAncInfoOfferServiceV3): 공고일 범위(startDate·endDate, YYYYMMDD)로 전국 공고
 * - 공동주택 입찰결과공지 정보제공 서비스 (ApHusBidResultNoticeInfoOfferServiceV3): 입찰 상태(bidState=5 낙찰)·연도(searchYear)로 낙찰 건
 * 요청 변수와 응답 필드는 2026-11-20 실제 호출로 확인했다 (결과 서비스는 공고일 범위 변수를 무시하고 상태·연도 조회만 거른다).
 * 결과 서비스의 응찰업체 조회(getBidEntrpsInfoSearchV3)는 담당자 이름·전화가 들어 있어 쓰지 않는다.
 */
const BASE = "https://apis.data.go.kr/1613000";
const NOTICE = "/ApHusBidPblAncInfoOfferServiceV3";
const RESULT = "/ApHusBidResultNoticeInfoOfferServiceV3";
/** 공고 수집 기간 (공고일 기준). 입찰 기간이 보통 1~3주라 이 안에 진행 중 공고가 모두 들어온다 */
export const APT_NOTICE_DAYS = 45;
const ROWS = 999;

type Item = Record<string, unknown>;

async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY 가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ serviceKey: key, _type: "json", pageNo: "1", numOfRows: String(ROWS), ...params });
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}/${op}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let json: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: unknown } }; OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string; errMsg?: string } } };
      try { json = JSON.parse(text); } catch { throw new Error(`응답 파싱 실패: ${text.slice(0, 120)}`); }
      const auth = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (auth) throw Object.assign(new Error(`인증 오류: ${auth.returnAuthMsg ?? auth.errMsg}`), { fatal: true });
      const code = json.response?.header?.resultCode;
      if (code && code !== "00") throw Object.assign(new Error(`API 오류(${code}): ${json.response?.header?.resultMsg}`), { fatal: true });
      const raw = json.response?.body?.items as { item?: Item | Item[] } | Item[] | undefined;
      const items = Array.isArray(raw) ? raw : raw?.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
      return { items, total: Number(json.response?.body?.totalCount) || items.length };
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`공동주택 ${op}: ${(last as Error)?.message}`);
}

/** 한 조회의 모든 페이지 */
async function all(path: string, op: string, params: Record<string, string>, maxPages = 80): Promise<Item[]> {
  const first = await call(path, op, params);
  const items = [...first.items];
  const pages = Math.min(maxPages, Math.ceil(first.total / ROWS));
  for (let p = 2; p <= pages; p++) items.push(...(await call(path, op, { ...params, pageNo: String(p) })).items);
  return items;
}

/* ---------- 변환 ---------- */

const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
/** "2026-12-01 17:00:00" (KST) → ISO */
function kstIso(v: unknown): string | undefined {
  const t = s(v);
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return undefined;
  const d = new Date(`${t.slice(0, 10)}T${(t.slice(11, 19) || "00:00:00").padEnd(8, ":00")}+09:00`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) ? s(v).slice(0, 10) : undefined);

/** 법정동 시·도 코드 → K-apt 지역 표기 (2026 전남·광주 통합은 12) */
const AREA: Record<string, string> = {
  "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "전남광주", "30": "대전", "31": "울산", "36": "세종", "41": "경기",
  "42": "강원", "51": "강원", "43": "충북", "44": "충남", "45": "전북", "52": "전북", "46": "전남광주", "12": "전남광주", "47": "경북", "48": "경남", "50": "제주",
};
/** 공고명 앞 "[경기]" 같은 지역 표기 */
const PREFIX = /^\s*\[([^\]]{2,6})\]\s*/;

const STATE: Record<string, string> = { "1": "신규공고", "2": "수정공고", "3": "재공고" };
const KIND: Record<string, string> = { "01": "일반경쟁", "02": "제한경쟁", "03": "지명경쟁" };
const SUC: Record<string, string> = { "01": "최저(고)낙찰", "02": "적격심사", "03": "최저낙찰", "04": "최고낙찰", "05": "적격심사(최저)", "06": "적격심사(최고)" };
const SYSTEM: Record<string, string> = { "01": "K-APT", "02": "조달청", "03": "아파트비드포유", "04": "KG2B전자입찰", "05": "나이스아파트", "06": "이 아파트", "07": "주택관리공단", "08": "오픈매뉴얼", "09": "한국환경공단", "10": "아파트장터A2P" };
const CLS1: Record<string, string> = { "01": "주택관리업자", "02": "사업자" };
const CLS2: Record<string, string> = { "01": "위탁관리", "02": "공사", "03": "용역", "04": "물품", "05": "기타" };
const CLS3_SERVICE: Record<string, string> = { "04": "경비", "05": "청소", "06": "승강기유지", "07": "지능형홈네트워크", "08": "전기안전관리", "09": "정화조 청소·관리", "10": "저수조 청소", "11": "건축물 안전진단", "12": "기타 용역", "13": "소독", "14": "주민운동시설 위탁", "15": "회계감사" };

/** K-apt 입찰분류 → 화면 분야 */
export function aptCategory(c1: string, c2: string, c3: string): AptCategory {
  if (c1 === "01") return "주택관리(위탁)";
  if (c2 === "02") return "공사";
  if (c2 === "03") {
    switch (c3) {
      case "04": return "경비";
      case "05": return "청소";
      case "13": return "소독";
      case "06": return "승강기유지";
      case "08": return "전기안전관리";
      case "09": case "10": return "정화조·저수조";
      default: return "기타 용역";
    }
  }
  return "물품·기타";
}

function classLabel(c1: string, c2: string, c3: string): string {
  const parts = [CLS1[c1], c1 === "01" ? undefined : CLS2[c2], c2 === "03" ? CLS3_SERVICE[c3] : undefined].filter(Boolean);
  return parts.join(" · ");
}

/** 빈 값·"첨부 참조" 같은 안내 문구는 버린다 */
const meaningful = (v: unknown) => {
  const t = s(v).replace(/\s+/g, " ");
  return t && t.length > 1 && !/^(없음|-|null)$/i.test(t) ? t : undefined;
};

export function toAptBid(it: Item): AptBid | null {
  const no = s(it.bidNum);
  const rawTitle = s(it.bidTitle);
  const closeAt = kstIso(it.bidDeadline);
  if (!no || !rawTitle || !closeAt) return null;
  const c1 = s(it.codeClassifyType1), c2 = s(it.codeClassifyType2), c3 = s(it.codeClassifyType3);
  const prefix = rawTitle.match(PREFIX)?.[1];
  const region = AREA[s(it.bidArea)] ?? (prefix && Object.values(AREA).includes(prefix) ? prefix : "");
  const content = meaningful(it.bidContent);
  return {
    no,
    aptCode: s(it.aptCode),
    apt: s(it.bidKaptname),
    region,
    title: rawTitle.replace(PREFIX, "") || rawTitle,
    content: content && !/^(자세한 내용은 )?(입찰 ?)?(공고문|첨부 ?파일).{0,12}(참조|참고)/.test(content) ? content.slice(0, 1000) : undefined,
    category: aptCategory(c1, c2, c3),
    classLabel: classLabel(c1, c2, c3),
    postedAt: day(it.bidRegDate ?? it.bidRegdate) ?? closeAt.slice(0, 10),
    closeAt,
    state: STATE[s(it.bidState)] ?? "공고",
    kind: KIND[s(it.codeKind)],
    award: SUC[s(it.codeSucWay)],
    way: s(it.codeWay) === "01" ? "전자입찰" : s(it.codeWay) === "00" ? "직접입찰" : undefined,
    system: SYSTEM[s(it.codeAuth)],
    urgent: s(it.bidEmrgYn) === "Y" || undefined,
    briefingAt: kstIso(it.bidFieldDesDate),
    briefingPlace: meaningful(it.bidFieldDesLoc),
    docs: meaningful(it.bidReqDocs)?.slice(0, 500),
    docsBy: kstIso(it.bidDocsDeadline),
    guarantee: s(it.bidGuaranteeYn) === "Y" || undefined,
    payTerms: meaningful(it.bidTermsOfPayment)?.slice(0, 200),
    files: s(it.bidFileSeq).split(/[,\s]+/).filter((x) => /^\d+$/.test(x)),
  };
}

const kstYmd = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");

/** 공고일이 최근 days일인 공고 중 아직 마감 전인 것 (마감 임박순) */
export async function fetchAptNotices(days = APT_NOTICE_DAYS, now = new Date()): Promise<AptBid[]> {
  const items = await all(NOTICE, "getPblAncDeSearchV3", { startDate: kstYmd(new Date(now.getTime() - days * 86400e3)), endDate: kstYmd(now) });
  const out = new Map<string, AptBid>();
  for (const it of items) {
    const b = toAptBid(it);
    if (b && new Date(b.closeAt).getTime() > now.getTime()) out.set(b.no, b);
  }
  return [...out.values()].sort((a, b) => a.closeAt.localeCompare(b.closeAt));
}

/** 낙찰 한 건 (직전 낙찰 비교용). 업체 정보는 받지 않는다 */
interface AptAward { no: string; key: string; prior: AptPrior }

/** 올해와 작년 낙찰 건 (입찰결과공지, 상태 5 = 낙찰·계약완료) */
export async function fetchAptAwards(now = new Date()): Promise<AptAward[]> {
  const y = Number(kstYmd(now).slice(0, 4));
  const out: AptAward[] = [];
  for (const year of [y - 1, y]) {
    const items = await all(RESULT, "getBidSttusSearchV3", { bidState: "5", searchYear: String(year) });
    for (const it of items) {
      const amount = Number(s(it.amount).replace(/[^\d]/g, "")) || 0;
      const apt = s(it.aptCode);
      if (!amount || !apt) continue;
      const cat = aptCategory(s(it.codeClassifyType1), s(it.codeClassifyType2), s(it.codeClassifyType3));
      out.push({
        no: s(it.bidNum),
        key: `${apt}|${cat}`,
        prior: { title: s(it.bidTitle).replace(PREFIX, ""), amount, start: day(it.contractPeriodSdate), end: day(it.contractPeriodEdate), closedAt: day(it.bidDeadline) },
      });
    }
  }
  return out;
}

/** 같은 단지·같은 분야의 가장 최근 낙찰을 공고에 붙인다. 붙인 건수를 돌려준다 */
export function attachPriors(bids: AptBid[], awards: AptAward[]): number {
  const latest = new Map<string, AptAward>();
  for (const a of awards) {
    const cur = latest.get(a.key);
    if (!cur || (a.prior.closedAt ?? "") > (cur.prior.closedAt ?? "")) latest.set(a.key, a);
  }
  let n = 0;
  for (const b of bids) {
    const a = latest.get(`${b.aptCode}|${b.category}`);
    // 기타 용역·공사·물품은 같은 분야라도 일이 달라 비교하지 않는다
    if (!a || a.no === b.no || b.category === "기타 용역" || b.category === "공사" || b.category === "물품·기타") continue;
    b.prior = a.prior;
    n++;
  }
  return n;
}
