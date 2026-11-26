/**
 * 기업 특허 조회와 평가 항목 적용 (입찰점수 예측).
 *
 * 조회 (worker/corp-lookup ?patents=사업자번호)
 * 기본: 특허청 등록원부 사업자 권리목록 (공공데이터포털 15124946, 공공데이터포털 서비스키 그대로). 한 번에 사업자번호 → 특허권 목록.
 * 예비: KIPRIS Plus Open API (키는 Worker 비밀값 KIPRIS_API_KEY가 있을 때만, 등록원부가 실패하면)
 * 1. 출원인 법인: CorpBsApplicantService/corpBsApplicantInfoV3 (BusinessRegistrationNumber=000-00-00000)
 *    → 특허고객번호(ApplicantNumber). 한 사업자번호에 번호가 여럿일 수 있다
 * 2. 특허·실용 공개·등록공보: patUtiModInfoSearchSevice/getAdvancedSearch (applicant=특허고객번호, lastvalue=R)
 *    → 지금 '등록' 상태(존속 중)인 특허·실용신안. 소멸·포기·무효·거절·취하·공개(출원 중)는 빼고 받는다
 * KIPRIS Plus는 월 1,000회까지 무료라 회사를 고를 때만 부르고 R2에 30일 둔다 (회사 하나에 보통 2회).
 *
 * 평가 적용: 공고 배점표에 특허 항목(특허·지식재산권·실용신안 보유 등)이 있을 때만 쓴다. 없는 공고에 항목을 만들지 않는다.
 * 공고 문구가 우선: 실용신안 포함 여부, 최근 N년 등록, 건당 점수, 건수 구간을 문구에서 읽는다.
 * 문구에 출원이 함께 인정된다고 적힌 경우가 아니면 등록 건만 센다.
 */

export interface PatentEntry {
  /** 등록번호 */
  no: string;
  title: string;
  /** 등록일 YYYY-MM-DD */
  regDate?: string;
  appNo?: string;
  /** 특허 또는 실용신안 (출원번호 앞 두 자리 10·20) */
  type: "특허" | "실용신안";
}

export interface PatentLookup {
  bizno: string;
  status: "ok" | "none" | "off" | "limit" | "error";
  /** 사업자번호에 연결된 특허고객번호와 출원인명 */
  applicants: { code: string; name: string }[];
  /** 등록 상태 특허·실용신안 (최근 등록 순, 많으면 앞 200건만) */
  items: PatentEntry[];
  /** 등록 상태 전체 건수 (items 보다 많을 수 있다) */
  total: number;
  checkedAt: string;
  reason?: string;
}

/* ---------- KIPRIS Plus 호출 (Worker) ---------- */

const KIPRIS = "http://plus.kipris.or.kr";

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
const blocks = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
const ymd = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : /^\d{4}[.-]\d{2}[.-]\d{2}/.test(s) ? s.slice(0, 10).replace(/\./g, "-") : undefined);
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim();

/** KIPRIS 응답의 오류 문구 (인증키 오류·한도 초과 등). 정상이면 빈 문자열 */
function kiprisError(xml: string): string {
  const code = tag(xml, "resultCode") || tag(xml, "returnReasonCode");
  const msg = tag(xml, "resultMsg") || tag(xml, "returnAuthMsg") || tag(xml, "errMsg");
  if (code && !/^0+$/.test(code)) return `${code} ${msg}`.trim();
  if (/SERVICE_KEY|ACCESS_KEY|인증|등록되지 않은|LIMITED|초과/i.test(msg)) return msg;
  return "";
}

async function getXml(url: string, f: typeof fetch): Promise<string> {
  const r = await f(url, { headers: { Accept: "application/xml" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`KIPRIS ${r.status}`);
  const err = kiprisError(t);
  if (err) throw new Error(`KIPRIS ${err}`.slice(0, 160));
  return t;
}

/** 사업자번호(10자리) → 등록 상태 특허·실용신안. 특허고객번호는 3개까지만 본다 (호출 한도) */
export async function fetchPatents(key: string, bizno: string, f: typeof fetch = fetch): Promise<PatentLookup> {
  const now = new Date().toISOString();
  const dashed = `${bizno.slice(0, 3)}-${bizno.slice(3, 5)}-${bizno.slice(5)}`;
  const q = new URLSearchParams({ BusinessRegistrationNumber: dashed, accessKey: key });
  const x1 = await getXml(`${KIPRIS}/openapi/rest/CorpBsApplicantService/corpBsApplicantInfoV3?${q}`, f);
  const seen = new Set<string>();
  const applicants = blocks(x1, "corpBsApplicantInfo")
    .map((b) => ({ code: tag(b, "ApplicantNumber"), name: decode(tag(b, "ApplicantName")) }))
    .filter((a) => /^\d{12}$/.test(a.code) && !seen.has(a.code) && seen.add(a.code));
  if (!applicants.length) return { bizno, status: "none", applicants: [], items: [], total: 0, checkedAt: now, reason: "특허청에 출원인으로 등록된 기록이 없습니다" };
  const items: PatentEntry[] = [];
  let total = 0;
  for (const a of applicants.slice(0, 3)) {
    const p = new URLSearchParams({ applicant: a.code, patent: "true", utility: "true", lastvalue: "R", pageNo: "1", numOfRows: "200", sortSpec: "GD", descSort: "true", ServiceKey: key });
    const x = await getXml(`${KIPRIS}/kipo-api/kipi/patUtiModInfoSearchSevice/getAdvancedSearch?${p}`, f);
    const rows = blocks(x, "item");
    total += Number(tag(x, "totalCount")) || rows.length;
    for (const b of rows) {
      const no = tag(b, "registerNumber");
      if (!no || items.some((i) => i.no === no)) continue;
      const appNo = tag(b, "applicationNumber");
      const status = tag(b, "registerStatus");
      if (status && status !== "등록") continue;
      items.push({ no, title: decode(tag(b, "inventionTitle")).slice(0, 120), regDate: ymd(tag(b, "registerDate")), appNo: appNo || undefined, type: appNo.startsWith("20") ? "실용신안" : "특허" });
    }
  }
  items.sort((x, y) => (y.regDate ?? "").localeCompare(x.regDate ?? ""));
  return { bizno, status: "ok", applicants, items: items.slice(0, 200), total: Math.max(total, items.length), checkedAt: now };
}

/* ---------- 공공데이터포털 등록원부 (기본 경로) ---------- */

const RGST = "https://apis.data.go.kr/1430000/PttRgstRtInfoInqSvc/getBusinessRightList";

/**
 * 등록상태·존속기간으로 지금 살아 있는 권리인지. 실제 값(2026-11-24 확인): "등록유지", "존속기간만료(존속기간만료)",
 * "등록료불납(등록료불납)" 등. 등록유지만 살아 있는 권리로 본다 (값이 비어 있으면 존속기간 만료일로 판단)
 */
function aliveRight(status: string, expires: string | undefined, today: string): boolean {
  if (expires && expires < today) return false;
  if (!status) return true;
  return /등록\s*유지|존속\s*중/.test(status) && !/만료|불납|소멸|포기|무효|취하|말소|거절/.test(status);
}

/** 한 쪽 100건 (그보다 크면 007 TOO_MANY_REQUEST_DATA_ERROR). 큰 회사도 이 쪽 수 안에서 최근 등록부터 본다 */
const RGST_ROWS = 100;
const RGST_MAX_PAGES = 40;
/** 한 번 조회에 쓰는 시간 한도 (권리가 아주 많은 회사는 등록원부 응답이 쪽마다 10초 넘게 걸린다) */
const RGST_BUDGET_MS = 30_000;

/**
 * 사업자번호(10자리) → 그 사업자가 권리자로 가진 특허권·실용신안권 (특허청 등록원부, 공공데이터포털 15124946 사업자 권리목록 조회).
 * 공공데이터포털 서비스키를 그대로 쓴다 (개발계정 하루 10,000회).
 * 응답은 상표·디자인과 통상실시권(남의 권리를 쓰는 것)까지 등록일 오름차순으로 섞여 온다. 등록번호 앞 10(특허)·20(실용신안)이고
 * 권리자란에 있는 것만 센다. 최근 등록이 뒤쪽 쪽에 있어 마지막 쪽부터 거꾸로 읽고, 쪽 전체가 존속기간(20년)을 넘긴 옛 등록이면 멈춘다.
 */
export async function fetchPatentsRgst(serviceKey: string, bizno: string, f: typeof fetch = fetch): Promise<PatentLookup> {
  const now = new Date().toISOString();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const dashed = `${bizno.slice(0, 3)}-${bizno.slice(3, 5)}-${bizno.slice(5)}`;
  type Row = Record<string, unknown>;
  const page = async (no: number, rows: number): Promise<{ total: number; list: Row[] }> => {
    const q = new URLSearchParams({ serviceKey, pageNo: String(no), numOfRows: String(rows), type: "json", searchType: "1", searchVal: dashed });
    const r = await f(`${RGST}?${q}`);
    const t = await r.text();
    const auth = t.match(/<returnAuthMsg>([^<]*)<|"returnAuthMsg"\s*:\s*"([^"]*)"/);
    if (auth) throw new Error(`등록원부 ${auth[1] ?? auth[2]}`);
    if (!r.ok) throw new Error(`등록원부 ${r.status}`);
    let j: Record<string, unknown>;
    try { j = JSON.parse(t) as Record<string, unknown>; } catch { throw new Error("등록원부 응답을 읽지 못했습니다"); }
    // 응답 감싸기가 바뀌어도 rightList·totalCount 를 찾아 내려간다
    const find = (o: unknown, k: string): unknown => {
      if (!o || typeof o !== "object") return undefined;
      if (k in (o as Row)) return (o as Row)[k];
      for (const v of Object.values(o as Row)) { const x = find(v, k); if (x !== undefined) return x; }
      return undefined;
    };
    const code = String(find(j, "resultCode") ?? "");
    if (code && !/^0+$/.test(code)) {
      const msg = String(find(j, "resultMsg") ?? "");
      if (/없|NODATA|NO_DATA/i.test(msg) || code === "003" || code === "03") return { total: 0, list: [] };
      throw new Error(`등록원부 ${code} ${msg}`.trim().slice(0, 160));
    }
    const raw = find(j, "rightList");
    return { total: Number(find(j, "totalCount")) || 0, list: (Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : []) as Row[] };
  };
  const first = await page(1, RGST_ROWS);
  const pages = Math.ceil(first.total / RGST_ROWS);
  const items: PatentEntry[] = [];
  const holders = new Map<string, string>();
  const oldLimit = `${Number(today.slice(0, 4)) - 21}${today.slice(4)}`;
  let partial = false;
  const take = (rows: Row[]) => {
    let anyRecent = false;
    for (const row of rows) {
      const str = (k: string) => (row[k] === undefined || row[k] === null ? "" : String(row[k]).trim());
      const no = str("rgstNo");
      const regDate = ymd(str("rgstDate").replace(/\D/g, ""));
      if (regDate && regDate >= oldLimit) anyRecent = true;
      if (!/^(10|20)/.test(no) || items.some((i) => i.no === no)) continue;
      if (str("pertDiv") && !/권리자/.test(str("pertDiv"))) continue;
      if (!aliveRight(str("rgstStatus"), ymd(str("cndrtExptnDate").replace(/\D/g, "")), today)) continue;
      const holder = str("rightHolderInfo");
      const code = str("applicantCd");
      if (code && holder && !holders.has(code)) holders.set(code, holder.slice(0, 40));
      const appNo = str("applNo").replace(/\D/g, "");
      items.push({ no, title: decode(str("title")).slice(0, 120), regDate, appNo: appNo || undefined, type: no.startsWith("20") ? "실용신안" : "특허" });
    }
    return anyRecent;
  };
  if (pages <= 1) take(first.list);
  else {
    // 마지막 쪽부터 거꾸로 (최근 등록 먼저). 쪽 전체가 21년보다 옛 등록이면 그 앞은 모두 만료라 멈춘다
    const t0 = Date.now();
    let n = pages;
    let read = 1;
    let stopped = false;
    for (; n >= 1; n--, read++) {
      if (read > RGST_MAX_PAGES || Date.now() - t0 > RGST_BUDGET_MS) { partial = true; break; }
      const rows = n === 1 ? first.list : (await page(n, RGST_ROWS)).list;
      if (!take(rows) && rows.length) { stopped = true; break; }
    }
    void stopped;
  }
  items.sort((x, y) => (y.regDate ?? "").localeCompare(x.regDate ?? ""));
  if (!items.length && partial) return { bizno, status: "error", applicants: [], items: [], total: 0, checkedAt: now, reason: "등록원부 권리가 많아 제시간에 확인하지 못했습니다" };
  if (!items.length) return { bizno, status: "none", applicants: [], items: [], total: 0, checkedAt: now, reason: first.total ? "등록원부에 지금 유지 중인 특허권이 없습니다" : "특허청 등록원부에 이 사업자번호의 권리가 없습니다" };
  return { bizno, status: "ok", applicants: [...holders].map(([code, name]) => ({ code, name })), items, total: items.length, checkedAt: now, ...(partial ? { reason: "권리가 많아 최근 등록분 일부만 확인했습니다" } : {}) };
}

/* ---------- 평가 항목 적용 ---------- */

/** 항목 이름만으로 특허 항목인지 (특허·지식재산권·산업재산권·실용신안) */
const PATENT_LABEL_RE = /특\s*허|지식\s*재산|산업\s*재산|실용\s*신안|\bIP\b\s*보유/;

interface ItemLike { label: string; max: number; kind: string; basis?: string; criteria?: string[]; recognition?: string[]; bands?: { unit: string; min: number; points: number; cond: string }[] }

const textOf = (it: ItemLike) => [it.label, it.basis ?? "", ...(it.criteria ?? []), ...(it.recognition ?? []), ...(it.bands ?? []).map((b) => b.cond)].join("\n");

/**
 * 공고 배점표의 특허 항목인지. 이름에 특허·지식재산권 등이 있거나, 이름이 분류 없는 항목(기타·가감점)이고 세부 기준이 특허 보유를 평가하는 경우.
 * 입찰가격·실적·신용 항목은 문구에 특허가 섞여 있어도 특허 항목으로 보지 않는다.
 */
export function isPatentItem(it: ItemLike): boolean {
  if (!(it.max > 0) || ["price", "performance", "credit", "finance", "capability", "plan"].includes(it.kind)) return false;
  if (PATENT_LABEL_RE.test(it.label)) return true;
  if (!["other", "bonus", "techGrade"].includes(it.kind)) return false;
  const t = [it.basis ?? "", ...(it.criteria ?? [])].join("\n");
  return /특\s*허[^\n]{0,20}(보유|등록|건)/.test(t);
}

export interface PatentRule {
  /** 실용신안도 세는지 */
  utility: boolean;
  /** 출원 건도 인정한다고 적혀 있는지 (자동 조회는 등록 건만이라 직접 입력으로 더한다) */
  applications: boolean;
  /** 최근 N년 안에 등록된 것만 */
  withinYears?: number;
  /** 1건당 점수 */
  perItem?: number;
  /** 건수 구간 (많은 건수부터) */
  bands: { min: number; points: number; cond: string }[];
  /** 보유하면 만점이라고 적힌 경우 */
  holdFull: boolean;
  /** 신기술·인증처럼 특허 말고도 함께 인정하는 것이 문구에 있는지 (화면 안내) */
  others: string[];
}

/** 공고 문구에서 특허 항목의 평가 기준을 읽는다 */
export function patentRule(it: ItemLike): PatentRule {
  const t = textOf(it);
  const utility = /실용\s*신안/.test(t) && !/실용\s*신안[^\n]{0,8}(제외|불인정|미인정)/.test(t);
  const applications = /출원\s*(중|건|포함|도\s*인정)|출원[^\n]{0,6}인정/.test(t) && !/출원[^\n]{0,8}(제외|불인정|미인정)/.test(t);
  const yrs = t.match(/최근\s*(\d{1,2})\s*년/);
  const per = t.match(/(?:1\s*)?건\s*당\s*(\d{1,2}(?:\.\d{1,2})?)\s*점/);
  const bands: PatentRule["bands"] = [];
  const fromItem = (it.bands ?? []).filter((b) => b.unit === "건");
  if (fromItem.length) bands.push(...fromItem.map((b) => ({ min: b.min, points: b.points, cond: b.cond })));
  else {
    for (const m of t.matchAll(/(\d{1,2})\s*(?:건|개)(?!\s*당)\s*(이상|초과)?[^\n\d]{0,12}?(\d{1,2}(?:\.\d{1,2})?)\s*점/g)) {
      const min = Number(m[1]) + (m[2] === "초과" ? 1 : 0);
      const points = Number(m[3]);
      if (points <= it.max && !bands.some((b) => b.min === min)) bands.push({ min, points, cond: m[0].replace(/\s+/g, " ").trim().slice(0, 40) });
    }
  }
  bands.sort((a, b) => b.min - a.min);
  const holdFull = !bands.length && !per && /(보유|있는\s*경우|보유\s*시|보유한\s*경우)/.test(t);
  const others = ["신기술", "신제품", "녹색기술", "GS\\s*인증", "NEP", "NET", "성능\\s*인증", "우수\\s*조달"].filter((w) => new RegExp(w).test(t)).map((w) => w.replace(/\\s\*/g, " "));
  return { utility, applications, withinYears: yrs ? Number(yrs[1]) : undefined, perItem: per ? Number(per[1]) : undefined, bands, holdFull, others };
}

/** 이 항목 기준으로 세는 특허 (자동 조회 결과 중 고객이 뺀 것은 빼고) */
export function countPatents(items: PatentEntry[], rule: PatentRule, asOf: Date = new Date()): PatentEntry[] {
  return items.filter((p) => {
    if (p.type === "실용신안" && !rule.utility) return false;
    if (rule.withinYears && p.regDate) {
      const from = new Date(asOf);
      from.setFullYear(from.getFullYear() - rule.withinYears);
      if (Date.parse(`${p.regDate}T00:00:00+09:00`) < from.getTime()) return false;
    }
    return true;
  });
}

/** 특허 건수로 항목 점수를 정한다 */
export function scorePatentItem(max: number, rule: PatentRule, n: number): { points: number; how: string; estimated: boolean } {
  if (rule.bands.length) {
    const hit = rule.bands.find((b) => n >= b.min);
    return { points: Math.min(max, hit?.points ?? 0), how: hit ? `공고 구간 '${hit.cond}' ${hit.points}점` : "공고 최저 구간 미만", estimated: false };
  }
  if (rule.perItem) return { points: Math.min(max, n * rule.perItem), how: `건당 ${rule.perItem}점 (최대 ${max}점)`, estimated: false };
  if (rule.holdFull) return { points: n > 0 ? max : 0, how: n > 0 ? "보유 시 배점 (공고 문구)" : "보유 건 없음", estimated: false };
  // 공고에 건수 기준이 없으면 1건 60%, 2건 80%, 3건 이상 만점으로 추정한다
  const ratio = n >= 3 ? 1 : n === 2 ? 0.8 : n === 1 ? 0.6 : 0;
  return { points: Math.round(max * ratio * 100) / 100, how: "공고에 건수 기준이 없어 1건 60%·2건 80%·3건 이상 만점으로 추정", estimated: true };
}
