/**
 * 사업자번호로 나라장터 낙찰 이력을 조회해 선택 공고와 유사한 실적을 찾는다.
 * 서버(Next API)와 Cloudflare Worker(worker/corp-lookup)가 같이 쓴다. 서비스키는 호출하는 쪽이 넘긴다.
 *
 * - 조달청_나라장터 낙찰정보서비스 getScsbidListSttus{Servc,Cnstwk,Thng}PPSSrch 는 bizno 조건을 받지만
 *   한 번에 7일까지만 조회된다 (8일 이상은 오류 07). 그래서 최근 1년을 7일 단위로 나눠 동시에 부른다.
 * - 낙찰 응답에는 분류코드가 없어, 공고번호로 입찰공고정보서비스를 다시 불러 세부품명번호·중분류를 얻는다.
 * - 수의계약·민간·하도급 실적은 여기서 잡히지 않는다. 낙찰금액 기준이라 최종 계약금액·공동수급 지분과 다를 수 있다.
 */

/** 자동 조회 기간(년). 3년이면 업체 하나에 약 157회라 개발계정 하루 한도를 금방 써서 1년(약 53회)으로 줄였다 */
export const PERF_YEARS = 1;
/** 브라우저가 중계 서버에 한 번에 맡기는 주 수. 재시도 포함 외부 호출이 Cloudflare 무료 한도(요청당 50회) 안에 들게 한다 */
export const CHUNK_WEEKS = 15;
/** 분류 조회 한 번에 맡기는 공고 수 */
export const NTCE_BATCH = 15;
/**
 * 공공데이터포털은 서비스키·오퍼레이션마다 초당 요청 수를 제한한다. 2026-11-13 실측: 초당 20회는 통과, 40회는 절반 넘게 429가 나고
 * 그 뒤 20초가량 막힌다. 그래서 묶음 하나는 150ms 간격으로 시작해 초당 7회 이하로 부르고, 브라우저는 묶음을 2개까지만 동시에 보낸다.
 */
export const CHUNK_CONCURRENCY = 2;
const CALL_GAP_MS = 150;

const SCSBID = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const BIDNTCE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02";

export type PerfBiz = "용역" | "공사" | "물품";
const OP: Record<PerfBiz, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };
export const perfBizOf = (b?: string): PerfBiz => (b === "공사" || b === "물품" ? b : "용역");

export interface PerfWin {
  bidNtceNo: string;
  bidNtceOrd: string;
  title: string;
  /** 낙찰금액(원) */
  amount: number;
  agency: string;
  /** 최종 낙찰일 YYYY-MM-DD */
  date: string;
}

export interface NtceClass {
  bidNtceNo: string;
  /** 세부품명번호 (용역: 공공조달분류번호, 물품: 세부품명번호) */
  clsfcNo?: string;
  clsfcNm?: string;
  midNm?: string;
  lrgNm?: string;
  /** 공사의 주공종 */
  mainWork?: string;
}

export interface PerfChunk { wins: PerfWin[]; failed: number; windows: number }

type Item = Record<string, string | undefined>;

export interface Window { from: string; to: string }

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const kstToday = () => new Date(Date.now() + 9 * 3600e3);

/** 오늘(KST)부터 거꾸로 years년(최대 PERF_YEARS년)을 7일 단위로 나눈다. since(YYYY-MM-DD, 조달업체 등록일 등) 이전 주는 뺀다 */
export function perfWindows(since?: string, years = PERF_YEARS, today = kstToday()): Window[] {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - Math.min(PERF_YEARS, Math.max(1, years)));
  const floor = since && /^\d{4}-\d{2}-\d{2}/.test(since) ? new Date(`${since.slice(0, 10)}T00:00:00Z`) : undefined;
  const out: Window[] = [];
  for (let to = end; to >= start; ) {
    const from = new Date(to.getTime() - 6 * 86400e3);
    const f = from < start ? start : from;
    if (floor && to < floor) break;
    out.push({ from: ymd(f), to: ymd(to) });
    to = new Date(f.getTime() - 86400e3);
  }
  return out;
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** 7일 이하 창을 여러 개 받아 묶음 전체의 시작·끝을 만든다 (중계 서버에 넘기는 형식) */
export const spanOf = (ws: Window[]): Window => ({ from: ws[ws.length - 1].from, to: ws[0].to });

/** from~to(YYYYMMDD)를 다시 7일 단위로 나눈다. 중계 서버가 브라우저가 보낸 범위를 믿지 않고 직접 쪼갠다 */
export function splitRange(from: string, to: string): Window[] {
  if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) throw new Error("조회 기간 형식이 올바르지 않습니다.");
  const d = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const a = d(from);
  const b = d(to);
  if (a > b) throw new Error("조회 기간이 올바르지 않습니다.");
  const out: Window[] = [];
  for (let f = a; f <= b; ) {
    const t = new Date(Math.min(f.getTime() + 6 * 86400e3, b.getTime()));
    out.push({ from: ymd(f), to: ymd(t) });
    f = new Date(t.getTime() + 86400e3);
  }
  return out;
}

async function getItems(url: string): Promise<{ items: Item[]; total: number }> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  let j: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: number | string } }; OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string } } };
  try { j = JSON.parse(text); } catch { throw new Error(`응답 형식 오류 (HTTP ${r.status})`); }
  const auth = j.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth) throw new Error(auth.returnAuthMsg ?? "인증 오류");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const res = j.response ?? (Object.values(j)[0] as unknown as typeof j.response);
  const code = res?.header?.resultCode;
  if (code && code !== "00") throw new Error(`API 오류(${code}): ${res?.header?.resultMsg ?? ""}`);
  const raw = res?.body?.items as Item[] | { item?: Item | Item[] } | undefined;
  const items = !raw ? [] : Array.isArray(raw) ? raw : raw.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
  return { items, total: Number(res?.body?.totalCount ?? items.length) };
}

/**
 * 공공데이터포털은 가끔 빈 응답·끊김을 주고, 같은 오퍼레이션을 초당 너무 많이 부르면 429(초당 요청제한 초과)를 준다.
 * 잠깐 쉬었다가 두 번 더 시도한다.
 */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1000 * i + Math.random() * 500));
    try { return await fn(); } catch (e) { last = e; }
  }
  throw last;
}

/** 동시에 n개씩 실행하되, 시작 간격을 gapMs 이상 둔다 (Cloudflare Worker는 동시 외부 연결이 6개로 제한된다) */
async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>, gapMs = 0): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  let slot = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (next < xs.length) {
      const i = next++;
      if (gapMs) {
        const now = Date.now();
        const at = Math.max(now, slot);
        slot = at + gapMs;
        if (at > now) await new Promise((r) => setTimeout(r, at - now));
      }
      out[i] = await fn(xs[i]);
    }
  }));
  return out;
}

const qs = (key: string, p: Record<string, string>) => new URLSearchParams({ serviceKey: key, type: "json", pageNo: "1", ...p }).toString();

/** from~to 기간의 이 업체 낙찰 건 (업무구분 하나) */
export async function fetchWins(key: string, bizno: string, biz: PerfBiz, from: string, to: string): Promise<PerfChunk> {
  const ws = splitRange(from, to);
  if (ws.length > CHUNK_WEEKS + 1) throw new Error(`한 번에 ${CHUNK_WEEKS}주까지만 조회합니다.`);
  let failed = 0;
  const lists = await pool(ws, 6, async (w) => {
    try {
      const { items } = await withRetry(() => getItems(`${SCSBID}/getScsbidListSttus${OP[biz]}PPSSrch?${qs(key, {
        numOfRows: "100", inqryDiv: "1", inqryBgnDt: `${w.from}0000`, inqryEndDt: `${w.to}2359`, bizno,
      })}`));
      return items;
    } catch {
      failed++;
      return [];
    }
  }, CALL_GAP_MS);
  const seen = new Set<string>();
  const wins: PerfWin[] = [];
  for (const i of lists.flat()) {
    if (i.bidwinnrBizno && i.bidwinnrBizno !== bizno) continue;
    const id = `${i.bidNtceNo}-${i.bidNtceOrd}-${i.bidClsfcNo ?? ""}`;
    if (!i.bidNtceNo || seen.has(id)) continue;
    seen.add(id);
    wins.push({
      bidNtceNo: i.bidNtceNo,
      bidNtceOrd: i.bidNtceOrd ?? "000",
      title: (i.bidNtceNm ?? "").trim(),
      amount: Number(i.sucsfbidAmt) || 0,
      agency: (i.dminsttNm ?? "").trim(),
      date: (i.fnlSucsfDate ?? i.rlOpengDt ?? "").slice(0, 10),
    });
  }
  return { wins, failed, windows: ws.length };
}

/** 공고번호별 분류 (세부품명번호·중분류·주공종) */
export async function fetchNtceClasses(key: string, biz: PerfBiz, nos: string[]): Promise<NtceClass[]> {
  const list = [...new Set(nos.filter((n) => /^[A-Z0-9-]{6,20}$/.test(n)))].slice(0, NTCE_BATCH);
  const out = await pool(list, 6, async (no): Promise<NtceClass> => {
    try {
      const { items } = await withRetry(() => getItems(`${BIDNTCE}/getBidPblancListInfo${OP[biz]}02?${qs(key, { numOfRows: "5", inqryDiv: "2", bidNtceNo: no })}`), 2);
      const i = items.sort((a, b) => (b.bidNtceOrd ?? "").localeCompare(a.bidNtceOrd ?? ""))[0];
      if (!i) return { bidNtceNo: no };
      return {
        bidNtceNo: no,
        clsfcNo: i.pubPrcrmntClsfcNo || i.dtilPrdctClsfcNo || undefined,
        clsfcNm: i.pubPrcrmntClsfcNm || i.dtilPrdctClsfcNoNm || undefined,
        midNm: i.pubPrcrmntMidClsfcNm || undefined,
        lrgNm: i.pubPrcrmntLrgClsfcNm || undefined,
        mainWork: i.mainCnsttyNm || undefined,
      };
    } catch {
      return { bidNtceNo: no };
    }
  }, CALL_GAP_MS);
  return out;
}

/* ---------- 유사도 판정 ---------- */

export type SimLevel = "동일" | "유사" | "키워드";

const STOP = new Set([
  "용역", "사업", "공사", "구매", "제조", "임차", "위탁", "년도", "연도", "추진", "관련", "기타", "일괄", "단가", "연간", "계약",
  "외", "및", "등", "건", "차", "식", "개소", "지원", "운영", "관리", "실시", "설계", "구축", "수립", "개선", "정비",
]);

/** 공고명에서 비교에 쓸 낱말을 뽑는다: 연도·차수·괄호 속 번호를 지우고 2글자 이상 한글·영문 낱말만 */
export function titleTokens(t: string): string[] {
  const s = t.replace(/\[[^\]]*\]|\([^)]*\d[^)]*\)/g, " ").replace(/\d{2,4}\s*(년도|년|차|분기|월)/g, " ").replace(/[^가-힣A-Za-z]+/g, " ");
  const out = new Set<string>();
  for (const w of s.split(/\s+/)) {
    const v = w.replace(/(용역|공사|사업|구매|제조)$/u, "");
    if (v.length >= 2 && !STOP.has(v)) out.add(v);
  }
  return [...out];
}

export interface SimResult { level: SimLevel | null; why: string }

export function judgeSimilarity(target: { title: string; cls?: NtceClass }, win: { title: string; cls?: NtceClass }): SimResult {
  const a = target.cls;
  const b = win.cls;
  if (a?.clsfcNo && b?.clsfcNo && a.clsfcNo === b.clsfcNo) return { level: "동일", why: `세부품명 '${b.clsfcNm ?? b.clsfcNo}' 일치` };
  if (a?.midNm && b?.midNm && a.midNm === b.midNm && (!a.lrgNm || !b.lrgNm || a.lrgNm === b.lrgNm)) return { level: "유사", why: `중분류 '${b.midNm}' 일치` };
  if (a?.mainWork && b?.mainWork && a.mainWork === b.mainWork) return { level: "유사", why: `주공종 '${b.mainWork}' 일치` };
  // 물품 세부품명번호는 앞 6자리가 같으면 같은 품목군
  if (a?.clsfcNo && b?.clsfcNo && a.clsfcNo.length >= 8 && a.clsfcNo.slice(0, 6) === b.clsfcNo.slice(0, 6)) return { level: "유사", why: `같은 품목군 '${b.clsfcNm ?? b.clsfcNo}'` };
  const ta = titleTokens(target.title);
  const tb = new Set(titleTokens(win.title));
  const common = ta.filter((w) => tb.has(w) || [...tb].some((x) => x.length >= 3 && w.length >= 3 && (x.includes(w) || w.includes(x))));
  if (common.length >= 2 || common.some((w) => w.length >= 4)) return { level: "키워드", why: `공고명 '${common.slice(0, 3).join("·")}' 겹침` };
  return { level: null, why: b?.clsfcNm ? `분류 '${b.clsfcNm}'로 다른 사업` : "분류·공고명이 달라 제외" };
}

/** 평가표 실적 항목에 적힌 인정 기간(년). 못 찾으면 undefined */
export function sheetPerfYears(texts: string[]): number | undefined {
  for (const t of texts) {
    const m = t.match(/(?:최근|직전|과거)\s*(\d{1,2})\s*년/);
    if (m) return Number(m[1]);
  }
  return undefined;
}
