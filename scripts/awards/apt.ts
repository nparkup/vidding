/**
 * 공동주택(아파트, K-apt) 지난 입찰공고·낙찰을 낙찰 저장소(R2)에 쌓는다. 메인 현황 줄 '누적입찰공고·누적낙찰정보'에 쓴다.
 * GitHub Actions(.github/workflows/awards.yml)가 수집 실행 앞에 부른다: npx tsx scripts/awards/apt.ts
 *
 * - 공고: 공동주택 입찰공고 정보제공 서비스 getPblAncDeSearchV3 (공고일 startDate·endDate). 한 달씩 받는다 → apt/notice/YYYY-MM.json.gz
 * - 낙찰: 공동주택 입찰결과공지 정보제공 서비스 getBidSttusSearchV3 (bidState=5 낙찰, searchYear). 한 해씩 받는다 → apt/award/YYYY.json.gz
 * 지난 달·해는 한 번만 받고, 이번 달·지난달 공고와 올해·작년 낙찰은 매번 다시 받는다. 자료가 있는 첫 달은 APT_FROM_YEAR 부터 찾아본다.
 * 필요한 열만 남긴다. 공고 내용(bidContent)은 연락처가 섞일 수 있어 저장하지 않고, 응찰업체 담당자 이름·전화는 받지도 않는다.
 * 다 받은 뒤 stats/apt-meta.json 에 공고번호 기준 건수를 쓴다. 조달청 시스템으로 낸 공고 번호(g2b)는 나라장터 공고와 겹칠 수 있어
 * 따로 적어 두고, 수집 실행(collect.ts)이 나라장터 공고와 겹치는 수를 센다.
 * 용량 한도: Cloudflare가 센 R2 사용량이 승인 용량(R2_APPROVED_BYTES)의 90%에 닿으면 올리지 않고 멈춘다.
 */
// 공공데이터포털 호출 수 (관리자 화면 API 사용량)
import { flushApiCounts } from "../apiCounter";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import { r2BucketBytes, r2Get, r2Put } from "./r2";

const BASE = "https://apis.data.go.kr/1613000";
const NOTICE = "/ApHusBidPblAncInfoOfferServiceV3";
const RESULT = "/ApHusBidResultNoticeInfoOfferServiceV3";
const ROWS = 999;
const WORK = process.env.AWARDS_WORK_DIR || ".cache/awards";
const APPROVED = Number(process.env.R2_APPROVED_BYTES || 5e9);
const FROM_YEAR = Number(process.env.APT_FROM_YEAR || 2010);
/** 공고 API는 2013-10 공고부터 있다 (2026-11-21 실행: 2010~2013-09 는 0건, 2010-06~08 은 게이트웨이가 계속 HTTP 에러) */
const NOTICE_FROM_YEAR = Number(process.env.APT_NOTICE_FROM_YEAR || 2013);
const MAX_MS = Math.min(300, Number(process.env.MAX_MINUTES || 100)) * 60_000;
const started = Date.now();
const STATE = "apt/state.json";
export const APT_META = "stats/apt-meta.json";

type Item = Record<string, unknown>;
interface Entry { rows: number; bytes: number; at: string; calls: number }
interface State { v: 1; months: Record<string, Entry>; years: Record<string, Entry> }
export interface AptMeta {
  builtAt: string;
  /** 공고번호 기준 누적 공고 수 */
  notices: number;
  /** 자료가 있는 첫 달 YYYY-MM, 마지막으로 받은 달 */
  noticeFrom: string;
  noticeTo: string;
  /** 공고 API 또는 낙찰 API에 한 번이라도 나온 공고번호 수 (현황 줄 누적입찰공고에 쓴다).
   * 공고 API는 지난 공고를 일부만 돌려준다 (2025년 공고 409건, 같은 해 낙찰 31,880건) → 낙찰 난 공고도 공고로 센다 */
  noticesAll: number;
  /** 공고번호 기준 누적 낙찰 수, 자료가 있는 첫 해 */
  awards: number;
  awardFrom: string;
  /** 조달청 시스템(codeAuth 02)으로 낸 공고의 공고번호 (나라장터 공고와 겹치는지 collect.ts 가 센다) */
  g2b: string[];
  bytes: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const local = (key: string) => join(WORK, key);
let calls = 0;

async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw Object.assign(new Error("DATA_GO_KR_SERVICE_KEY 가 없습니다."), { fatal: true });
  const qs = new URLSearchParams({ serviceKey: key, _type: "json", numOfRows: String(ROWS), ...params });
  let last: unknown;
  for (let i = 0; i < 6; i++) {
    if (i) await sleep(3000 * i);
    calls++;
    try {
      const r = await fetch(`${BASE}${path}/${op}?${qs}`, { signal: AbortSignal.timeout(90_000) });
      const text = await r.text();
      let j: {
        response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: unknown } };
        OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string; errMsg?: string; returnReasonCode?: string } };
      };
      try { j = JSON.parse(text); } catch { last = new Error(`응답 형식 오류 HTTP ${r.status}: ${text.slice(0, 100)}`); continue; }
      const auth = j.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (auth) {
        const msg = `${auth.returnReasonCode ?? ""} ${auth.returnAuthMsg ?? auth.errMsg ?? "인증 오류"}`;
        if (/HTTP|TIMEOUT|01|04|05/.test(msg)) { last = new Error(`${op}: ${msg}`); await sleep(20_000); continue; }
        throw Object.assign(new Error(`${op}: ${msg}`), { fatal: true });
      }
      const code = j.response?.header?.resultCode;
      // 03 = 자료 없음
      if (code === "03") return { items: [], total: 0 };
      if (code && code !== "00") throw Object.assign(new Error(`${op}: API 오류(${code}) ${j.response?.header?.resultMsg ?? ""}`), { fatal: true });
      const raw = j.response?.body?.items as { item?: Item | Item[] } | Item[] | undefined | "";
      const items = !raw ? [] : Array.isArray(raw) ? raw : raw.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
      return { items, total: Number(j.response?.body?.totalCount) || items.length };
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = e;
    }
  }
  throw last;
}

/** 한 조회의 모든 쪽. 한 쪽이라도 끝내 못 받으면 실패로 끝내 다음 실행이 다시 받게 한다 */
async function all(path: string, op: string, params: Record<string, string>): Promise<Item[]> {
  const first = await call(path, op, { ...params, pageNo: "1" });
  const items = [...first.items];
  const pages = Math.ceil(first.total / ROWS);
  for (let p = 2; p <= pages; p++) items.push(...(await call(path, op, { ...params, pageNo: String(p) })).items);
  if (first.total && items.length < first.total * 0.98) throw new Error(`${op} ${JSON.stringify(params)}: ${first.total}건 중 ${items.length}건만 받음`);
  return items;
}

/** 공고 한 줄: 공고번호, 단지코드, 단지명, 공고명, 공고일, 마감, 상태, 입찰시스템, 분류1·2·3, 낙찰방법, 입찰종류, 지역 */
const slimNotice = (it: Item) => [s(it.bidNum), s(it.aptCode), s(it.bidKaptname), s(it.bidTitle), s(it.bidRegDate ?? it.bidRegdate).slice(0, 10), s(it.bidDeadline).slice(0, 16),
  s(it.bidState), s(it.codeAuth), s(it.codeClassifyType1), s(it.codeClassifyType2), s(it.codeClassifyType3), s(it.codeSucWay), s(it.codeKind), s(it.bidArea)];
/** 낙찰 한 줄: 공고번호, 단지코드, 공고명, 분류1·2·3, 낙찰방법, 낙찰금액, 계약 시작·끝, 마감 (업체·담당자 정보는 남기지 않는다) */
const slimAward = (it: Item) => [s(it.bidNum), s(it.aptCode), s(it.bidTitle), s(it.codeClassifyType1), s(it.codeClassifyType2), s(it.codeClassifyType3), s(it.codeSucWay),
  Number(s(it.amount).replace(/[^\d]/g, "")) || 0, s(it.contractPeriodSdate).slice(0, 10), s(it.contractPeriodEdate).slice(0, 10), s(it.bidDeadline).slice(0, 10)];

const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const p2 = (n: number) => String(n).padStart(2, "0");

async function readFile(key: string): Promise<unknown[][]> {
  let b: Buffer | null = existsSync(local(key)) ? readFileSync(local(key)) : null;
  if (!b) {
    b = await r2Get(key);
    if (b) { mkdirSync(dirname(local(key)), { recursive: true }); writeFileSync(local(key), b); }
  }
  return b ? (JSON.parse(gunzipSync(b).toString("utf8")) as unknown[][]) : [];
}

async function main() {
  const now = kst();
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  const st = await r2Get(STATE);
  const state: State = st ? (JSON.parse(st.toString()) as State) : { v: 1, months: {}, years: {} };
  const measured = (await r2BucketBytes()) ?? 0;
  const own = () => Object.values(state.months).concat(Object.values(state.years)).reduce((a, e) => a + e.bytes, 0);
  const stopAt = APPROVED * 0.9;
  console.log(`R2 사용량 ${(measured / 1e9).toFixed(2)}GB (Cloudflare 집계), 승인 용량 ${(APPROVED / 1e9).toFixed(2)}GB, 아파트 자료 ${(own() / 1e6).toFixed(1)}MB`);

  const months: string[] = [];
  for (let yy = NOTICE_FROM_YEAR; yy <= y; yy++) for (let mm = 1; mm <= (yy === y ? m : 12); mm++) months.push(`${yy}-${p2(mm)}`);
  const recentMonths = new Set(months.slice(-2));
  const years = Array.from({ length: y - FROM_YEAR + 1 }, (_, i) => String(FROM_YEAR + i));
  const recentYears = new Set([String(y - 1), String(y)]);

  let stopped = "";
  const upload = async (key: string, rows: unknown[][]): Promise<number> => {
    if (!rows.length) return 0;
    const body = gzipSync(Buffer.from(JSON.stringify(rows)));
    if (measured + body.length > stopAt) throw Object.assign(new Error(`R2 사용량이 승인 용량 ${(APPROVED / 1e9).toFixed(2)}GB의 90%에 닿습니다`), { quota: true });
    await r2Put(key, body, "application/gzip");
    mkdirSync(dirname(local(key)), { recursive: true });
    writeFileSync(local(key), body);
    return body.length;
  };
  const saveState = () => r2Put(STATE, Buffer.from(JSON.stringify(state)), "application/json");

  // 공고: 최근 달부터 거꾸로
  let fetched = 0;
  for (const mo of [...months].reverse()) {
    if (state.months[mo] && !recentMonths.has(mo)) continue;
    if (Date.now() - started > MAX_MS) { stopped = "시간 한도"; break; }
    const [yy, mm] = mo.split("-").map(Number);
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    try {
      const before = calls;
      const items = await all(NOTICE, "getPblAncDeSearchV3", { startDate: `${yy}${p2(mm)}01`, endDate: `${yy}${p2(mm)}${p2(last)}` });
      const uniq = new Map<string, unknown[]>();
      for (const it of items) { const r = slimNotice(it); if (r[0]) uniq.set(r[0] as string, r); }
      const rows = [...uniq.values()];
      const bytes = await upload(`apt/notice/${mo}.json.gz`, rows);
      state.months[mo] = { rows: rows.length, bytes, at: new Date().toISOString(), calls: calls - before };
      fetched++;
      if (fetched % 12 === 0) await saveState();
    } catch (e) {
      if ((e as { quota?: boolean }).quota) { stopped = (e as Error).message; break; }
      if ((e as { fatal?: boolean }).fatal) { stopped = (e as Error).message; break; }
      console.warn(`공고 ${mo}: ${(e as Error).message}`);
    }
  }
  // 낙찰: 최근 해부터 거꾸로
  if (!stopped) for (const yr of [...years].reverse()) {
    if (state.years[yr] && !recentYears.has(yr)) continue;
    if (Date.now() - started > MAX_MS) { stopped = "시간 한도"; break; }
    try {
      const before = calls;
      const items = await all(RESULT, "getBidSttusSearchV3", { bidState: "5", searchYear: yr });
      const uniq = new Map<string, unknown[]>();
      for (const it of items) { const r = slimAward(it); if (r[0]) uniq.set(r[0] as string, r); }
      const rows = [...uniq.values()];
      const bytes = await upload(`apt/award/${yr}.json.gz`, rows);
      state.years[yr] = { rows: rows.length, bytes, at: new Date().toISOString(), calls: calls - before };
    } catch (e) {
      if ((e as { quota?: boolean }).quota || (e as { fatal?: boolean }).fatal) { stopped = (e as Error).message; break; }
      console.warn(`낙찰 ${yr}: ${(e as Error).message}`);
    }
  }
  await saveState();

  // 누적 건수 (공고번호 기준, 달·해가 바뀌며 같은 번호가 다시 나오면 한 번만)
  const noticeNos = new Set<string>();
  const g2b = new Set<string>();
  const perYear: Record<string, number> = {};
  for (const mo of months) {
    if (!state.months[mo]?.rows) continue;
    for (const r of await readFile(`apt/notice/${mo}.json.gz`)) {
      const no = r[0] as string;
      if (!noticeNos.has(no)) perYear[mo.slice(0, 4)] = (perYear[mo.slice(0, 4)] ?? 0) + 1;
      noticeNos.add(no);
      if (r[7] === "02") g2b.add(no);
    }
  }
  const awardNos = new Set<string>();
  const awardYear: Record<string, number> = {};
  for (const yr of years) {
    if (!state.years[yr]?.rows) continue;
    for (const r of await readFile(`apt/award/${yr}.json.gz`)) {
      if (!awardNos.has(r[0] as string)) awardYear[yr] = (awardYear[yr] ?? 0) + 1;
      awardNos.add(r[0] as string);
    }
  }
  const withData = months.filter((mo) => state.months[mo]?.rows);
  const meta: AptMeta = {
    builtAt: new Date().toISOString(),
    notices: noticeNos.size, noticesAll: new Set([...noticeNos, ...awardNos]).size, noticeFrom: withData[0] ?? "", noticeTo: withData[withData.length - 1] ?? "",
    awards: awardNos.size, awardFrom: years.find((yr) => state.years[yr]?.rows) ?? "",
    g2b: [...g2b], bytes: own(),
  };
  const missingMonths = months.filter((mo) => !state.months[mo]).length;
  const missingYears = years.filter((yr) => !state.years[yr]).length;
  // 다 받았거나 남은 게 없을 때만 건수를 바꾼다 (덜 받은 채로 화면 숫자가 줄어들지 않게)
  if (!missingMonths && !missingYears) await r2Put(APT_META, Buffer.from(JSON.stringify(meta)), "application/json");
  console.log(`아파트 공고 연도별: ${JSON.stringify(perYear)}`);
  console.log(`아파트 낙찰 연도별: ${JSON.stringify(awardYear)}`);
  console.log(`아파트 누적 공고 ${meta.notices.toLocaleString()}건 (${meta.noticeFrom}~${meta.noticeTo}, 조달청 시스템 ${g2b.size.toLocaleString()}건), 누적 낙찰 ${meta.awards.toLocaleString()}건 (${meta.awardFrom}~), 공고·낙찰 합친 공고번호 ${meta.noticesAll.toLocaleString()}건, 호출 ${calls}회, 저장 ${(own() / 1e6).toFixed(1)}MB`);
  console.log(missingMonths || missingYears ? `남은 것: 공고 ${missingMonths}달, 낙찰 ${missingYears}해 (건수는 다 받은 뒤 올린다)` : `${APT_META} 갱신`);
  if (stopped) {
    console.error(`::warning::아파트 수집 중단: ${stopped}`);
    if (/승인 용량/.test(stopped)) process.exit(2);
  }
}

main().then(() => flushApiCounts("awards-apt"), async (e) => {
  console.error("아파트 수집 실패:", e instanceof Error ? e.message : e);
  await flushApiCounts("awards-apt");
  process.exit(1);
});
