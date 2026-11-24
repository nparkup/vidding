/**
 * 기업 특허 조회와 평가 항목 적용 (평가점수 예측).
 *
 * 조회 (KIPRIS Plus Open API, 키는 Worker 비밀값 KIPRIS_API_KEY, worker/corp-lookup ?patents=사업자번호)
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
