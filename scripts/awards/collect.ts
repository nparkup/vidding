/**
 * 나라장터 낙찰 10년치(AWARD_YEARS)를 모아 Cloudflare R2(bidmate-awards)에 저장한다. GitHub Actions(.github/workflows/awards.yml)가 실행한다.
 *
 *   npx tsx scripts/awards/collect.ts            수집 + 샤드·통계 다시 만들기
 *   npx tsx scripts/awards/collect.ts check      토큰의 R2 읽기·쓰기 권한만 확인
 *   npx tsx scripts/awards/collect.ts raw        원자료만 받고 샤드·통계는 그대로 둔다 (배포 전 코드로 미리 채울 때)
 *   npx tsx scripts/awards/collect.ts rank       개찰 순위 1~5위만 받는다 (수집과 따로, 매일 하루 호출 한도 안에서)
 *   npx tsx scripts/awards/collect.ts index      받아 둔 원자료로 낙찰 결과 분석 색인(idx/)만 다시 만든다 (API를 부르지 않는다)
 *
 * 1. 한 주(월~일) 단위로 받는다. 낙찰정보·입찰공고정보 API는 한 번에 7일까지만 조회된다(2026-11-10 공지).
 *    - 낙찰: 낙찰정보서비스 getScsbidListSttus{Servc,Cnstwk,Thng} (최종낙찰자 목록, 등록일 기준)
 *    - 공고: 입찰공고정보서비스 getBidPblancListInfo{op}02 (계약방법·추정가격·분류), PrtcptPsblRgn02(지역), LicenseLimit02(업종),
 *      {op}BsisAmount02(기초금액)
 *    - 예정가격: 낙찰정보서비스 getOpengResultListInfo{op}PreparPcDetail (개찰일 기준. 복수예비가격 15개마다 한 줄이라 공고별 한 줄로 묶어
 *      예비가격 목록·추첨 번호·적격심사 기준과 함께 저장)
 *    최근 주부터 거꾸로 받고, 아직 끝나지 않은 최근 2주는 매번 다시 받는다. 끝난 주는 다시 받지 않는다.
 * 2. 실행 한 번에 MAX_MINUTES 분까지만 받고 멈춘다. 다음 실행이 이어 받는다(처음 채우는 기간은 며칠에 나눠 받는다).
 * 3. 받은 원자료를 공고번호로 합쳐 사업자번호별 샤드와 낙찰률 통계를 만들고, 바뀐 파일만 올린다.
 * 개찰 순위: 낙찰정보서비스 getOpengResultListInfoOpengCompt 는 기간 조회가 안 되고 공고번호마다 불러야 한다(2026-11-18 확인).
 *    10년치 약 300만 공고라 하루 한도(운영계정 10만 회) 안에서 최근 주부터 약 4주에 나눠 받는다. 참가 1곳인 공고는 부르지 않는다.
 *    상태는 rank-state.json 에 따로 둬서 수집 실행과 동시에 돌아도 manifest.json 을 덮어쓰지 않는다.
 * 4. 용량 한도: R2 사용량이 승인 용량(R2_APPROVED_BYTES, 기본 5GB)의 90%에 닿거나, 예상 최종 용량이 승인 용량을 넘으면
 *    올리기 전에 멈추고 실패로 끝낸다(사용자 승인 후 R2_APPROVED_BYTES 를 올려야 이어진다).
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import {
  AWARD_YEARS, BIZ_OF_OP, NOTICE_LEAD_WEEKS, OPS, RANK_TOP, SHARD_COLS, addDays, awardStartWeek, iso, kstNow, mondayOf, rateMethodOf,
  firstLicense, shardOf, weeksBetween, ymd, type AwardBiz, type AwardMeta, type ShardFile, type ShardRow, type TopBidder,
} from "../../src/lib/awards/format";
import { BANDS, bandOf, statKey, type RateStat } from "../../src/lib/rivalRate";
import {
  AGENCY_BUCKETS, AGENCY_COLS, SIMILAR_MIN, SIMILAR_YEARS, agencyBucket, analyzeBid, forecast, methodCode, METHOD_NAME, quantile, r3, similarKey,
  type AgencyIndexFile,
  KW_MIN_DF, KW_ROWS, keywords, kwBucket, type KwIndexFile, type KwLookup, type KwPosting, type KwRow,
  type AwardAnalysis, type AgencyRow, type SimilarIndexFile, type SimilarStat,
} from "../../src/lib/awards/analysis";
import { r2BucketBytes, r2Delete, r2Get, r2Put } from "./r2";

const NARA = "https://apis.data.go.kr/1230000";
const ROWS = 999; // 1000 이상이면 10건만 온다
const WORK = process.env.AWARDS_WORK_DIR || ".cache/awards";
const MAX_MS = Math.min(300, Number(process.env.MAX_MINUTES || 100)) * 60_000;
const APPROVED = Number(process.env.R2_APPROVED_BYTES || 5e9);
const STOP_AT = APPROVED * 0.9;
const CONCURRENCY = 3;
const GAP_MS = 250;
const started = Date.now();

type Kind = "award" | "notice" | "rgn" | "lic" | "base" | "plan";
const KINDS: { kind: Kind; ops: string[]; path: string; op: (o: string) => string; lead: boolean }[] = [
  { kind: "award", ops: Object.values(OPS), path: "/as/ScsbidInfoService", op: (o) => `getScsbidListSttus${o}`, lead: false },
  { kind: "notice", ops: Object.values(OPS), path: "/ad/BidPublicInfoService02", op: (o) => `getBidPblancListInfo${o}02`, lead: true },
  { kind: "rgn", ops: ["all"], path: "/ad/BidPublicInfoService02", op: () => "getBidPblancListInfoPrtcptPsblRgn02", lead: true },
  { kind: "lic", ops: ["all"], path: "/ad/BidPublicInfoService02", op: () => "getBidPblancListInfoLicenseLimit02", lead: true },
  { kind: "base", ops: Object.values(OPS), path: "/ad/BidPublicInfoService02", op: (o) => `getBidPblancListInfo${o}BsisAmount02`, lead: true },
  { kind: "plan", ops: Object.values(OPS), path: "/as/ScsbidInfoService", op: (o) => `getOpengResultListInfo${o}PreparPcDetail`, lead: true },
];

interface RawEntry { rows: number; bytes: number; at: string; calls: number; v?: number }
/** 원자료 형식 버전: 저장하는 열이 바뀌면 올리고, 이전 버전 파일은 끝난 주라도 다시 받는다
 * 2026-11-17: 공고에 낙찰하한율, 기초금액에 예가 범위, 예정가격에 적격심사 기준·복수예비가격·추첨 번호 추가 */
const RAW_V: Partial<Record<Kind, number>> = { notice: 2, base: 2, plan: 2 };
interface Manifest {
  v: 1;
  raw: Record<string, RawEntry>;
  files: Record<string, { bytes: number; hash: string }>;
  updatedAt?: string;
  blocked?: { at: string; usedBytes: number; projectedBytes: number; reason: string };
}

type Item = Record<string, string | undefined>;

/* ---------- 공공데이터포털 ---------- */

let calls = 0;
async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw Object.assign(new Error("DATA_GO_KR_SERVICE_KEY 가 없습니다."), { fatal: true });
  const qs = new URLSearchParams({ serviceKey: key, type: "json", ...params });
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    if (i) await sleep(2000 * i + Math.random() * 1000);
    calls++;
    try {
      const r = await fetch(`${NARA}${path}/${op}?${qs}`, { signal: AbortSignal.timeout(90_000) });
      const text = await r.text();
      if (r.status === 429) { last = new Error("429 초당 요청 제한"); await sleep(20_000); continue; }
      let j: {
        response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: number | string } };
        OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string; returnReasonCode?: string } };
      };
      try { j = JSON.parse(text); } catch { last = new Error(`응답 형식 오류 HTTP ${r.status}: ${text.slice(0, 100)}`); continue; }
      const auth = j.OpenAPI_ServiceResponse?.cmmMsgHeader;
      if (auth) {
        const msg = `${auth.returnReasonCode ?? ""} ${auth.returnAuthMsg ?? "인증 오류"}`;
        // 01 어플리케이션 에러·04 HTTP 에러·05 서비스 연결실패는 잠깐 끊긴 것이다(2026-11-18 00:25 KST에 05로 수집이 멈춤). 쉬었다 다시 부른다
        if (["01", "04", "05"].includes(auth.returnReasonCode ?? "")) { last = new Error(`${op}: ${msg}`); await sleep(30_000); continue; }
        // 하루 한도 초과(22)·키 오류 등: 이번 실행은 여기까지
        throw Object.assign(new Error(`${op}: ${msg}`), { fatal: true });
      }
      const res = j.response;
      const code = res?.header?.resultCode;
      if (code && code !== "00") throw Object.assign(new Error(`${op}: API 오류(${code}) ${res?.header?.resultMsg ?? ""}`), { fatal: code === "22" });
      const raw = res?.body?.items as Item[] | { item?: Item | Item[] } | undefined | "";
      const items = !raw ? [] : Array.isArray(raw) ? raw : raw.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
      return { items, total: Number(res?.body?.totalCount ?? items.length) };
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = e;
    }
  }
  throw last;
}

async function weekItems(path: string, op: string, monday: string): Promise<{ items: Item[]; calls: number }> {
  const p = { inqryDiv: "1", inqryBgnDt: `${monday}0000`, inqryEndDt: `${addDays(monday, 6)}2359`, numOfRows: String(ROWS) };
  const before = calls;
  const first = await call(path, op, { ...p, pageNo: "1" });
  const items = [...first.items];
  const pages = Math.ceil(first.total / ROWS);
  for (let pg = 2; pg <= pages; pg++) items.push(...(await call(path, op, { ...p, pageNo: String(pg) })).items);
  if (first.total && items.length < first.total * 0.98) throw new Error(`${op} ${monday}: ${first.total}건 중 ${items.length}건만 받음`);
  return { items, calls: calls - before };
}

/* ---------- 필요한 열만 ---------- */

const n = (s?: string) => Number(s) || 0;
const t = (s?: string) => (s ?? "").trim();

function slim(kind: Kind, i: Item): unknown[] {
  switch (kind) {
    case "award":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.bidClsfcNo), t(i.rbidNo), t(i.bidNtceNm), n(i.prtcptCnum), t(i.bidwinnrNm),
        t(i.bidwinnrBizno).replace(/\D/g, ""), n(i.sucsfbidAmt), n(i.sucsfbidRate), t(i.dminsttNm), t(i.fnlSucsfDate || i.rlOpengDt).slice(0, 10)];
    case "notice":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", [t(i.cntrctCnclsMthdNm), t(i.sucsfbidMthdNm)].filter(Boolean).join(" / "), n(i.presmptPrce),
        t(i.pubPrcrmntClsfcNo || i.dtilPrdctClsfcNo), t(i.pubPrcrmntClsfcNm || i.dtilPrdctClsfcNoNm), t(i.pubPrcrmntMidClsfcNm),
        t(i.pubPrcrmntLrgClsfcNm), t(i.mainCnsttyNm), t(i.cnstrtsiteRgnNm), t(i.ntceKindNm), n(i.sucsfbidLwltRate)];
    case "rgn":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.prtcptPsblRgnNm)];
    case "lic":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.lcnsLmtNm)];
    case "base":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.bidClsfcNo), n(i.bssamt), t(i.rsrvtnPrceRngBgnRate), t(i.rsrvtnPrceRngEndRate)];
    case "plan":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.bidClsfcNo), t(i.rbidNo), n(i.plnprc), n(i.bssamt),
        t(i.bidwinrSlctnAplBssCntnts), n(i.compnoRsrvtnPrceSno), n(i.bsisPlnprc), t(i.drwtYn) === "Y" ? 1 : 0, n(i.drwtNum)];
  }
}

/**
 * 금액이 없는 줄은 버린다. 예정가격은 복수예비가격(보통 15개)마다 한 줄씩 오므로 공고·분류·재입찰별 한 줄로 묶는다:
 * [공고번호, 차수, 분류, 재입찰, 예정가격, 기초금액, 적격심사 기준(행자부·조달청 등), 예비가격[], 추첨된 번호[], 번호별 추첨 수[]]
 */
function keepRows(kind: Kind, rows: unknown[][]): unknown[][] {
  if (kind === "base") return rows.filter((r) => (r[3] as number) > 0);
  if (kind !== "plan") return rows;
  const bids = new Map<string, { head: unknown[]; prices: Map<number, [number, number, number]> }>();
  for (const r of rows) {
    const [no, ord, clsfc, rbid, plnprc, bssamt, basis, sno, price, drawn, picks] = r as [string, string, string, string, number, number, string, number, number, number, number];
    if (!(plnprc > 0 || bssamt > 0)) continue;
    const k = `${no}|${ord}|${clsfc}|${rbid}`;
    const b = bids.get(k) ?? bids.set(k, { head: [no, ord, clsfc, rbid, plnprc, bssamt, basis], prices: new Map() }).get(k)!;
    if (sno > 0 && price > 0) b.prices.set(sno, [price, drawn, picks]);
  }
  return [...bids.values()].map(({ head, prices }) => {
    const list = [...prices.entries()].sort((a, b) => a[0] - b[0]);
    return [...head, list.map(([, v]) => v[0]), list.filter(([, v]) => v[1]).map(([sno]) => sno), list.map(([, v]) => v[2])];
  });
}

/* ---------- 상태·용량 ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
const sha = (b: Buffer) => createHash("sha1").update(b).digest("hex");
const local = (key: string) => join(WORK, key);
const fmtGB = (b: number) => `${(b / 1e9).toFixed(2)}GB`;

let manifest: Manifest = { v: 1, raw: {}, files: {} };
let rankState: RankState = { v: 1, weeks: {}, days: {} };
let r2Measured = 0;

const rankBytes = () => Object.values(rankState.weeks).reduce((s, w) => s + w.bytes, 0);
const usedBytes = () => Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0) + rankBytes();

class QuotaStop extends Error {}

/** key 에 body 를 올린다. 같은 내용이면 건너뛰고, 올린 뒤 용량이 한도의 90%를 넘으면 올리지 않고 멈춘다 */
async function put(key: string, body: Buffer, type = "application/gzip") {
  const hash = sha(body);
  writeLocal(key, body);
  if (manifest.files[key]?.hash === hash) return false;
  const after = Math.max(usedBytes(), r2Measured) - (manifest.files[key]?.bytes ?? 0) + body.length;
  if (after > STOP_AT) {
    throw new QuotaStop(`R2 사용량이 ${fmtGB(after)}가 되어 승인 용량 ${fmtGB(APPROVED)}의 90%를 넘습니다`);
  }
  await r2Put(key, body, type);
  manifest.files[key] = { bytes: body.length, hash };
  return true;
}

function writeLocal(key: string, body: Buffer) {
  mkdirSync(dirname(local(key)), { recursive: true });
  writeFileSync(local(key), body);
}

async function readRaw(key: string): Promise<unknown[][]> {
  let b: Buffer | null = existsSync(local(key)) ? readFileSync(local(key)) : null;
  if (!b) {
    b = await r2Get(key);
    if (b) writeLocal(key, b);
  }
  return b ? (JSON.parse(gunzipSync(b).toString("utf8")) as unknown[][]) : [];
}

async function saveManifest() {
  manifest.updatedAt = new Date().toISOString();
  const body = Buffer.from(JSON.stringify(manifest));
  await r2Put("manifest.json", body, "application/json");
  manifest.files["manifest.json"] = { bytes: body.length, hash: "" };
}

/* ---------- 수집 ---------- */

interface Job { key: string; kind: Kind; op: string; monday: string }

function plan(today: Date): { jobs: Job[]; awardWeeks: string[]; leadWeeks: string[] } {
  const cur = mondayOf(today);
  const awardWeeks = weeksBetween(awardStartWeek(today), cur).reverse();
  const leadWeeks = weeksBetween(addDays(awardStartWeek(today), -7 * NOTICE_LEAD_WEEKS), cur).reverse();
  const jobs: Job[] = [];
  // 주가 끝나고 8일 넘게 지난 뒤 받았으면 더 바뀌지 않는다고 본다. 아직 안 끝난 주는 6시간에 한 번만 다시 받는다
  const settled = (monday: string, at: string) => at.slice(0, 10).replace(/-/g, "") > addDays(monday, 14);
  const fresh = (at: string) => Date.now() - Date.parse(at) < 6 * 3600e3;
  for (const w of leadWeeks) {
    for (const k of KINDS) {
      if (!k.lead && !awardWeeks.includes(w)) continue;
      for (const op of k.ops) {
        const key = `raw/${k.kind}/${op}/${w}.json.gz`;
        const e = manifest.raw[key];
        if (e && (e.v ?? 1) >= (RAW_V[k.kind] ?? 1) && (settled(w, e.at) || fresh(e.at))) continue;
        jobs.push({ key, kind: k.kind, op, monday: w });
      }
    }
  }
  return { jobs, awardWeeks, leadWeeks };
}

async function collect(jobs: Job[]): Promise<{ done: number; stopped?: string }> {
  let next = 0;
  let done = 0;
  let stopped: string | undefined;
  let lastSave = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length && !stopped) {
      if (Date.now() - started > MAX_MS) { stopped = `시간 한도 ${MAX_MS / 60_000}분`; break; }
      const j = jobs[next++];
      const k = KINDS.find((x) => x.kind === j.kind)!;
      try {
        const { items, calls: c } = await weekItems(k.path, k.op(j.op), j.monday);
        const rows = keepRows(j.kind, items.map((i) => slim(j.kind, i)).filter((r) => r[0]));
        const body = gz(rows);
        await put(j.key, body);
        manifest.raw[j.key] = { rows: rows.length, bytes: body.length, at: new Date().toISOString(), calls: c, ...(RAW_V[j.kind] ? { v: RAW_V[j.kind] } : {}) };
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${jobs.length} 받음 (호출 ${calls}회, ${Math.round((Date.now() - started) / 60_000)}분)`);
      } catch (e) {
        if (e instanceof QuotaStop) { stopped = e.message; break; }
        if ((e as { fatal?: boolean }).fatal) { stopped = (e as Error).message; break; }
        console.warn(`  건너뜀 ${j.key}: ${(e as Error).message}`);
      }
      if (Date.now() - lastSave > 5 * 60_000) { lastSave = Date.now(); await saveManifest().catch(() => undefined); }
      await sleep(GAP_MS);
    }
  }));
  return { done, stopped };
}

/* ---------- 개찰 순위 1~5위 ---------- */

/** 하루 호출 한도 (운영계정 10만 회 중 사이트 조회 몫을 남긴다) */
const RANK_DAILY = Number(process.env.RANK_DAILY_CALLS || 95_000);
const RANK_CONCURRENCY = 4;
const RANK_PATH = "/as/ScsbidInfoService";
const RANK_OP = "getOpengResultListInfoOpengCompt";
/** 시험 실행: R2에 쓰지 않고 받은 결과만 보여 준다 */
const RANK_DRY = process.env.RANK_DRY === "1";

interface RankWeek { bids: number; rows: number; bytes: number; at: string; calls: number; /** 이 주 낙찰 원자료를 받은 시각. 같으면 다시 볼 필요가 없다. 덜 받았으면 "" */ awardAt: string }
interface RankState { v: 1; weeks: Record<string, RankWeek>; days: Record<string, number>; updatedAt?: string }
/** [분류, 재입찰, 순위, 사업자번호, 업체명, 투찰금액, 투찰률, 추첨번호1, 추첨번호2] */
type RankRow = [string, string, number, string, string, number, number, number, number];
/** [공고번호, 차수, 1~5위 줄] (빈 목록이면 불렀지만 결과가 없던 공고) */
type RankEntry = [string, string, RankRow[]];

const rankKey = (op: string, w: string) => `raw/rank/${op}/${w}.json.gz`;

async function saveRankState() {
  if (RANK_DRY) return;
  rankState.updatedAt = new Date().toISOString();
  await r2Put("rank-state.json", Buffer.from(JSON.stringify(rankState)), "application/json");
}

/** 한 공고의 1~5위. want = 분류|재입찰 → 참가업체 수. 보통 10줄 한 번이면 되고, 분류가 여럿이라 모자라면 큰 쪽으로 다시 받는다 */
async function fetchRanks(no: string, ord: string, want: Map<string, number>): Promise<RankRow[]> {
  const pick = (items: Item[]): RankRow[] => items.map((i): RankRow => [
    t(i.bidClsfcNo), t(i.rbidNo) || "000", n(i.opengRank), t(i.prcbdrBizno).replace(/\D/g, ""), t(i.prcbdrNm),
    n(i.bidprcAmt), n(i.bidprcrt), n(i.drwtNo1), n(i.drwtNo2),
  ]).filter((r) => r[2] >= 1 && r[2] <= RANK_TOP);
  const enough = (rows: RankRow[]) => [...want].every(([k, c]) => rows.filter((r) => `${r[0]}|${r[1]}` === k).length >= Math.min(RANK_TOP, c));
  const uniq = (rows: RankRow[]) => [...new Map(rows.map((r) => [`${r[0]}|${r[1]}|${r[2]}|${r[3]}`, r])).values()];
  const p = { bidNtceNo: no, bidNtceOrd: ord };
  const first = await call(RANK_PATH, RANK_OP, { ...p, numOfRows: "10", pageNo: "1" });
  if (first.total <= first.items.length || enough(pick(first.items))) return uniq(pick(first.items));
  const rows: RankRow[] = [];
  const pages = Math.min(3, Math.ceil(first.total / ROWS));
  for (let pg = 1; pg <= pages; pg++) {
    rows.push(...pick((await call(RANK_PATH, RANK_OP, { ...p, numOfRows: String(ROWS), pageNo: String(pg) })).items));
    if (enough(rows)) break;
  }
  return uniq(rows);
}

async function rankMode() {
  const m = await r2Get("manifest.json");
  if (m) manifest = JSON.parse(m.toString()) as Manifest;
  const rs = await r2Get("rank-state.json");
  if (rs) rankState = JSON.parse(rs.toString()) as RankState;
  r2Measured = (await r2BucketBytes()) ?? 0;
  const today = kstNow();
  const day = ymd(today);
  const weeks = weeksBetween(awardStartWeek(today), mondayOf(today)).reverse();
  const jobs: { op: string; w: string; awardAt: string }[] = [];
  for (const w of weeks) {
    for (const op of Object.values(OPS)) {
      const a = manifest.raw[`raw/award/${op}/${w}.json.gz`];
      if (!a) continue;
      if (rankState.weeks[rankKey(op, w)]?.awardAt === a.at) continue;
      jobs.push({ op, w, awardAt: a.at });
    }
  }
  // 오늘 이미 쓴 호출 + 이번 실행 호출. 동시에 도는 공고끼리 호출 수가 겹쳐 세지지 않게 전체 호출 수로 센다
  const dayBase = rankState.days[day] ?? 0;
  const callsBase = calls;
  const usedToday = () => dayBase + (calls - callsBase);
  const doneWeeks = Object.values(rankState.weeks).filter((x) => x.awardAt).length;
  console.log(`개찰 순위: ${doneWeeks}/${weeks.length * 3}개 주·업무 완료, 이번에 볼 것 ${jobs.length}개, 오늘(${day}) 호출 ${usedToday()}/${RANK_DAILY}회${RANK_DRY ? " (시험: R2에 쓰지 않음)" : ""}`);

  let stopped: string | undefined;
  let fetched = 0;
  let lastSave = Date.now();
  for (const job of jobs) {
    if (stopped) break;
    const key = rankKey(job.op, job.w);
    // 받을 공고: 참가 2곳 이상, 공고번호·차수마다 한 번
    const need = new Map<string, Map<string, number>>();
    for (const r of await readRaw(`raw/award/${job.op}/${job.w}.json.gz`)) {
      const [no, ord, clsfc, rbid, , bidders] = r as [string, string, string, string, string, number];
      if (!no || !(bidders >= 2)) continue;
      const k = `${no}|${ord}`;
      (need.get(k) ?? need.set(k, new Map()).get(k)!).set(`${clsfc}|${rbid || "000"}`, bidders);
    }
    const entries: RankEntry[] = rankState.weeks[key] ? ((await readRaw(key)) as RankEntry[]) : [];
    const have = new Set(entries.map((e) => `${e[0]}|${e[1]}`));
    const todo = [...need.keys()].filter((k) => !have.has(k));
    const before = calls;
    let next = 0;
    await Promise.all(Array.from({ length: RANK_CONCURRENCY }, async () => {
      while (next < todo.length && !stopped) {
        if (Date.now() - started > MAX_MS) { stopped = `시간 한도 ${MAX_MS / 60_000}분`; break; }
        if (usedToday() >= RANK_DAILY) { stopped = `오늘 호출 한도 ${RANK_DAILY}회`; break; }
        const k = todo[next++];
        const [no, ord] = k.split("|");
        try {
          entries.push([no, ord, await fetchRanks(no, ord, need.get(k)!)]);
          fetched++;
          if (fetched % 2000 === 0) console.log(`  공고 ${fetched.toLocaleString()}건 받음 (오늘 호출 ${usedToday().toLocaleString()}회, ${Math.round((Date.now() - started) / 60_000)}분)`);
        } catch (e) {
          if ((e as { fatal?: boolean }).fatal) { stopped = (e as Error).message; break; }
          console.warn(`  건너뜀 ${k}: ${(e as Error).message}`);
        } finally {
          rankState.days[day] = usedToday();
        }
        await sleep(100);
      }
    }));
    const got = new Set(entries.map((e) => `${e[0]}|${e[1]}`));
    const complete = [...need.keys()].every((k) => got.has(k));
    const body = gz(entries);
    if (RANK_DRY) {
      const sample = entries.find((e) => e[2].length >= 3);
      console.log(`  [시험] ${key}: 공고 ${need.size}건 중 ${entries.length}건, 줄 ${entries.reduce((s, e) => s + e[2].length, 0)}개, ${body.length.toLocaleString()}B, 호출 ${calls - before}회`);
      if (sample) console.log(`  [시험] 예: ${JSON.stringify(sample)}`);
      if (!stopped) stopped = "시험은 한 주만";
      break;
    }
    const after = Math.max(usedBytes(), r2Measured) - (rankState.weeks[key]?.bytes ?? 0) + body.length;
    if (after > STOP_AT) { stopped = `R2 사용량이 ${fmtGB(after)}가 되어 승인 용량 ${fmtGB(APPROVED)}의 90%를 넘습니다`; break; }
    await r2Put(key, body, "application/gzip");
    writeLocal(key, body);
    rankState.weeks[key] = {
      bids: entries.length, rows: entries.reduce((s, e) => s + e[2].length, 0), bytes: body.length, at: new Date().toISOString(),
      calls: (rankState.weeks[key]?.calls ?? 0) + (calls - before), awardAt: complete ? job.awardAt : "",
    };
    if (Date.now() - lastSave > 3 * 60_000 || stopped) { lastSave = Date.now(); await saveRankState(); }
  }
  // 30일 넘은 날짜별 호출 기록은 지운다
  for (const d of Object.keys(rankState.days)) if (d < ymd(new Date(today.getTime() - 30 * 86400e3))) delete rankState.days[d];
  await saveRankState();
  const done = Object.values(rankState.weeks).filter((x) => x.awardAt).length;
  console.log(`개찰 순위 이번 실행: 공고 ${fetched.toLocaleString()}건, 호출 ${calls.toLocaleString()}회 · 완료 ${done}/${weeks.length * 3}개 주·업무 · 순위 파일 ${fmtGB(rankBytes())}${stopped ? ` · 멈춤: ${stopped}` : ""}`);
  if (stopped && /승인 용량/.test(stopped)) { console.error(`::error::${stopped}. 사용자 승인 후 저장소 변수 R2_APPROVED_BYTES 를 올려 주세요.`); process.exit(2); }
}

/** 순위 파일은 따로 도는 실행이 바꾸므로, 내 캐시가 rank-state 와 크기가 다르면 R2에서 다시 받는다 */
async function readRank(key: string): Promise<RankEntry[]> {
  const st = rankState.weeks[key];
  if (!st) return [];
  if (!existsSync(local(key)) || statSync(local(key)).size !== st.bytes) {
    const b = await r2Get(key);
    if (!b) return [];
    writeLocal(key, b);
  }
  return JSON.parse(gunzipSync(readFileSync(local(key))).toString("utf8")) as RankEntry[];
}

/* ---------- 합치기 ---------- */

interface NoticeInfo { method: string; price: number; clsNo: string; clsNm: string; mid: string; lrg: string; work: string; site: string; lwlt: number }

async function build(awardWeeks: string[], leadWeeks: string[], opts: { indexOnly?: boolean } = {}) {
  // 공고: 공고번호 → 마지막 차수 정보
  const notices = new Map<string, NoticeInfo & { ord: string }>();
  const region = new Map<string, Set<string>>();
  const lic = new Map<string, Set<string>>();
  for (const w of [...leadWeeks].reverse()) {
    for (const op of Object.values(OPS)) {
      for (const r of await readRaw(`raw/notice/${op}/${w}.json.gz`)) {
        const [no, ord, method, price, clsNo, clsNm, mid, lrg, work, site, , lwlt] = r as [string, string, string, number, string, string, string, string, string, string, string, number?];
        const prev = notices.get(no);
        if (prev && prev.ord > ord) continue;
        notices.set(no, { ord, method, price, clsNo, clsNm, mid, lrg, work, site, lwlt: lwlt || 0 });
      }
    }
    for (const r of await readRaw(`raw/rgn/all/${w}.json.gz`)) {
      const [no, , name] = r as string[];
      if (name) (region.get(no) ?? region.set(no, new Set()).get(no)!).add(name);
    }
    for (const r of await readRaw(`raw/lic/all/${w}.json.gz`)) {
      const [no, , name] = r as string[];
      if (name) (lic.get(no) ?? lic.set(no, new Set()).get(no)!).add(name);
    }
  }

  // 기초금액·예정가격: 같은 공고·분류(·재입찰)는 마지막 차수 값을 쓴다
  const base = new Map<string, { ord: string; amt: number; rng: string }>();
  const plan = new Map<string, { ord: string; plnprc: number; base: number; basis: string }>();
  const keepLatest = <T extends { ord: string }>(m: Map<string, T>, k: string, v: T) => { const p = m.get(k); if (!p || p.ord <= v.ord) m.set(k, v); };
  for (const w of [...leadWeeks].reverse()) {
    for (const op of Object.values(OPS)) {
      for (const r of await readRaw(`raw/base/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, amt, bgn, end] = r as [string, string, string, number, string?, string?];
        const v = { ord, amt, rng: bgn || end ? `${bgn ?? ""}~${end ?? ""}` : "" };
        keepLatest(base, `${no}|${clsfc}`, v);
        keepLatest(base, no, v);
      }
      for (const r of await readRaw(`raw/plan/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, rbid, plnprc, bssamt, basis] = r as [string, string, string, string, number, number, string?];
        const v = { ord, plnprc, base: bssamt, basis: basis ?? "" };
        keepLatest(plan, `${no}|${clsfc}|${rbid}`, v);
        keepLatest(plan, `${no}|${clsfc}`, v);
      }
    }
  }

  // 낙찰: 같은 공고·차수·분류·재입찰은 한 번만
  const seen = new Set<string>();
  const shards = new Map<string, ShardRow[]>();
  let rows = 0;
  let matched = 0;
  let withBase = 0;
  let withPlan = 0;
  let withTop = 0;
  const prearng = new Map<string, number[]>();
  for (const w of awardWeeks) {
    for (const op of Object.values(OPS)) {
      const biz = BIZ_OF_OP[op] as AwardBiz;
      const top = new Map<string, TopBidder[]>();
      for (const [no, ord, list] of await readRank(rankKey(op, w))) {
        for (const [clsfc, rbid, rank, bz, name, amt, rt] of list) {
          const k = `${no}|${ord}|${clsfc}|${rbid}`;
          (top.get(k) ?? top.set(k, []).get(k)!).push([rank, bz, name, amt, rt]);
        }
      }
      for (const r of await readRaw(`raw/award/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, rbid, title, bidders, winner, bizno, amount, rate, agency, date] =
          r as [string, string, string, string, string, number, string, string, number, number, string, string];
        if (!bizno || bizno.length !== 10) continue;
        const id = `${no}-${ord}-${clsfc}-${rbid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const nt = notices.get(no);
        if (nt) matched++;
        const pl = plan.get(`${no}|${clsfc}|${rbid}`) ?? plan.get(`${no}|${clsfc}`);
        const ba = base.get(`${no}|${clsfc}`) ?? base.get(no);
        const bs = base.get(`${no}|${clsfc}`)?.amt || pl?.base || ba?.amt || 0;
        if (bs) withBase++;
        if (pl?.plnprc) withPlan++;
        // 수요기관별 예정가격/기초금액 비율 (예가가 기초금액보다 높게·낮게 정해지는 경향)
        if (pl?.plnprc && bs && agency) {
          const ratio = (pl.plnprc / bs) * 100;
          if (ratio > 90 && ratio < 110) (prearng.get(agency) ?? prearng.set(agency, []).get(agency)!).push(ratio);
        }
        const row: ShardRow = [
          bizno, winner, no, ord, biz, title, agency, amount, rate, date, bidders,
          nt?.method ?? "", nt?.price ?? 0, nt?.clsNo ?? "", nt?.clsNm ?? "", nt?.mid ?? "", nt?.lrg ?? "", nt?.work ?? "",
          [...(region.get(no) ?? (nt?.site ? [nt.site] : []))].join(", "), [...(lic.get(no) ?? [])].join(", "),
          bs, pl?.plnprc || 0, nt?.lwlt || 0, ba?.rng ?? "", pl?.basis ?? "",
          (top.get(`${no}|${ord}|${clsfc}|${rbid || "000"}`) ?? []).sort((a, b) => a[0] - b[0]),
        ];
        if (row[25].length) withTop++;
        const k = shardOf(bizno);
        (shards.get(k) ?? shards.set(k, []).get(k)!).push(row);
        rows++;
      }
    }
  }
  console.log(`낙찰 ${rows.toLocaleString()}건 (공고 정보 붙은 건 ${matched.toLocaleString()}건, 기초금액 ${withBase.toLocaleString()}건, 예정가격 ${withPlan.toLocaleString()}건, 개찰 순위 ${withTop.toLocaleString()}건), 공고 ${notices.size.toLocaleString()}건`);

  const keys = [...shards.keys()].sort();
  if (opts.indexOnly) {
    // 색인만: 샤드·통계·수집 상태는 건드리지 않는다 (동시에 도는 수집 실행의 manifest.json 을 덮지 않게 바로 올린다)
    const ix = await buildIndexes([...shards.values()].flat(), async (key, body) => { await r2Put(key, body, "application/gzip"); writeLocal(key, body); return true; });
    printSamples(ix);
    const trial = backtest(ix);
    await checkNotices(ix);
    await relateTrial(trial);
    return { rows, shards: keys.length };
  }
  let uploaded = 0;
  let next = 0;
  // 올리는 속도는 r2.ts 가 Cloudflare API 한도에 맞춘다. 중간에 끊겨도 다음 실행이 이미 올린 샤드를 건너뛰게 상태를 자주 저장한다
  let lastSave = Date.now();
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < keys.length) {
      const k = keys[next++];
      const list = shards.get(k)!.sort((a, b) => b[9].localeCompare(a[9]) || a[0].localeCompare(b[0]));
      const file: ShardFile = { v: 1, cols: SHARD_COLS, rows: list };
      if (await put(`shards/${k}.json.gz`, gz(file))) uploaded++;
      if (Date.now() - lastSave > 3 * 60_000) {
        lastSave = Date.now();
        console.log(`  샤드 ${next}/${keys.length}개 확인, ${uploaded}개 올림`);
        await saveManifest().catch(() => undefined);
      }
    }
  }));
  // 샤드 나누는 방식이 바뀌어 더 쓰지 않는 샤드 파일은 지운다 (2026-11-15: 1,000개 → 10,000개)
  const live = new Set(keys.map((k) => `shards/${k}.json.gz`));
  const stale = Object.keys(manifest.files).filter((k) => k.startsWith("shards/") && !live.has(k));
  for (const k of stale) { await r2Delete(k); delete manifest.files[k]; }
  console.log(`샤드 ${keys.length}개 중 ${uploaded}개 올림${stale.length ? `, 안 쓰는 샤드 ${stale.length}개 지움` : ""}`);

  // 통계
  const all = [...shards.values()].flat();
  const today = iso(mondayOf(kstNow()).replace(/-/g, ""));
  const since1y = iso(addDays(today.replace(/-/g, ""), -365));
  const windows: Record<string, { from: string; strata: Record<string, RateStat> }> = {};
  for (const [name, from] of [["1y", since1y], ["all", "0000-00-00"]] as const) {
    const groups = new Map<string, number[]>();
    const add = (k: string, v: number) => (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
    for (const r of all) {
      const rate = r[8];
      if (r[9] < from || !(rate > 50 && rate <= 110)) continue;
      const m = rateMethodOf(r[11]);
      if (!m) continue;
      const band = bandOf(r[12]);
      const l = firstLicense(r[19]);
      add(statKey(r[4], m, band), rate);
      add(statKey(r[4], m, "*"), rate);
      if (l) { add(`${statKey(r[4], m, band)}|${l}`, rate); add(`${statKey(r[4], m, "*")}|${l}`, rate); }
    }
    const strata: Record<string, RateStat> = {};
    for (const [k, v] of groups) {
      const s = v.sort((a, b) => a - b);
      const mid = s.length / 2;
      strata[k] = {
        n: s.length,
        mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 1000) / 1000,
        median: Math.round((s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2) * 1000) / 1000,
      };
    }
    windows[name] = { from: name === "1y" ? since1y : iso(awardWeeks[awardWeeks.length - 1]), strata };
  }
  await put("stats/rates.json", Buffer.from(JSON.stringify({ builtAt: new Date().toISOString(), bands: BANDS.map((b) => b.key), windows })), "application/json");

  // 수요기관별 적격심사·협상계약 낙찰 (같은 기관의 과거 유사 공고 찾기용)
  const agency: Record<string, [string, string, number, "Q" | "N", string][]> = {};
  for (const r of all) {
    const m = rateMethodOf(r[11]);
    if (!m || !(r[8] > 50 && r[8] <= 110) || !r[6]) continue;
    (agency[r[6]] ??= []).push([r[2], r[5], r[8], m === "적격심사" ? "Q" : "N", r[9]]);
  }
  await put("stats/agency.json.gz", gz(agency));

  // 수요기관별 예정가격/기초금액 비율(%) 분포: 5건 이상인 기관만
  const q = (s: number[], p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 1000) / 1000;
  const prearngStats: Record<string, { n: number; mean: number; p25: number; median: number; p75: number }> = {};
  for (const [name, v] of prearng) {
    if (v.length < 5) continue;
    const s = v.sort((a, b) => a - b);
    prearngStats[name] = { n: s.length, mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 1000) / 1000, p25: q(s, 0.25), median: q(s, 0.5), p75: q(s, 0.75) };
  }
  await put("stats/prearng.json.gz", gz({ builtAt: new Date().toISOString(), agencies: prearngStats }));
  console.log(`예정가격 경향: 수요기관 ${Object.keys(prearngStats).length.toLocaleString()}곳`);

  await buildIndexes(all, (key, body) => put(key, body));

  return { rows, shards: keys.length };
}

/* ---------- 낙찰 결과 분석 색인 (src/lib/awards/analysis.ts) ---------- */

/** 비슷한 공고 묶음마다 저장하는 최근 낙찰 예 수 (화면은 지금 공고명과 겹치는 5건만 고른다) */
const SIMILAR_EX = 15;

async function buildIndexes(all: ShardRow[], upload: (key: string, body: Buffer) => Promise<boolean>): Promise<{ rows: ShardRow[]; buckets: AgencyIndexFile[]; similar: SimilarIndexFile; kw: KwLookup }> {
  // 공고 1건당 1줄: 같은 공고번호는 낙찰금액이 가장 큰 줄 (분류가 여럿인 공고)
  const byNo = new Map<string, ShardRow>();
  for (const r of all) {
    const p = byNo.get(r[2]);
    if (!p || p[3] < r[3] || (p[3] === r[3] && p[7] < r[7])) byNo.set(r[2], r);
  }
  const rows = [...byNo.values()].sort((a, b) => b[9].localeCompare(a[9]));
  const winnerRank = (r: ShardRow) => r[25].find((x) => x[1] === r[0])?.[0] ?? 0;

  // 1. 수요기관별 과거 낙찰 (저장 기간 전체)
  const buckets: AgencyIndexFile[] = Array.from({ length: AGENCY_BUCKETS }, () => ({ v: 1, cols: AGENCY_COLS, agencies: {} }));
  for (const r of rows) {
    if (!r[6]) continue;
    const row: AgencyRow = [r[2], r[5], r[9], r[4], r[7], r[8], r[10], methodCode(r[11]), r[12], r[20], r[21], r[22], r[1], winnerRank(r),
      r[25].map((x) => [x[2], x[4], x[3]] as [string, number, number])];
    (buckets[Number(agencyBucket(r[6]))].agencies[r[6]] ??= []).push(row);
  }
  let up = 0;
  let bytes = 0;
  for (let i = 0; i < buckets.length; i++) {
    const body = gz(buckets[i]);
    bytes += body.length;
    if (await upload(`idx/agency/${String(i).padStart(2, "0")}.json.gz`, body)) up++;
  }
  console.log(`분석 색인: 수요기관 ${buckets.reduce((s, b) => s + Object.keys(b.agencies).length, 0).toLocaleString()}곳, 공고 ${rows.length.toLocaleString()}건, 파일 ${buckets.length}개 중 ${up}개 올림 (${fmtGB(bytes)})`);

  // 2. 비슷한 공고 통계 (최근 SIMILAR_YEARS 년)
  const today = mondayOf(kstNow());
  const since = iso(addDays(today, -365 * SIMILAR_YEARS));
  interface Acc { n: number; rates: number[]; gaps: number[]; bidders: number[]; winners: Map<string, number>; ranked: Map<string, number>; rk: number[][]; rkn: number; first: number; firstN: number; pre: number[]; ex: SimilarStat["ex"] }
  const groups = new Map<string, Acc>();
  const acc = (k: string) => groups.get(k) ?? groups.set(k, { n: 0, rates: [], gaps: [], bidders: [], winners: new Map(), ranked: new Map(), rk: [[], [], [], [], []], rkn: 0, first: 0, firstN: 0, pre: [], ex: [] }).get(k)!;
  for (const r of rows) {
    if (r[9] < since) break;
    const m = methodCode(r[11]);
    const band = bandOf(r[12] || r[20] || r[7]);
    const dims = ["*"];
    if (r[13]) dims.push(`c:${r[13]}`);
    if (r[17]) dims.push(`w:${r[17]}`);
    const l = firstLicense(r[19]);
    if (l) dims.push(`l:${l}`);
    const keys = new Set<string>();
    for (const d of dims) { keys.add(similarKey(r[4], m, band, d)); if (d !== "*") keys.add(similarKey(r[4], m, "*", d)); }
    const rate = r[8] > 50 && r[8] <= 110 ? r[8] : 0;
    const wr = winnerRank(r);
    for (const k of keys) {
      const a = acc(k);
      a.n++;
      if (rate) a.rates.push(rate);
      if (rate && r[22] > 0 && rate >= r[22] && rate - r[22] < 10) a.gaps.push(rate - r[22]);
      if (r[10] > 0) a.bidders.push(r[10]);
      a.winners.set(r[1], (a.winners.get(r[1]) ?? 0) + 1);
      if (r[25].length) {
        a.rkn++;
        r[25].slice(0, 5).forEach((x, i) => { if (x[4] > 50 && x[4] <= 110) a.rk[i].push(x[4]); if (x[2]) a.ranked.set(x[2], (a.ranked.get(x[2]) ?? 0) + 1); });
      }
      if (wr) { a.firstN++; if (wr === 1) a.first++; }
      if (r[21] > 0 && r[20] > 0) { const p = (r[21] / r[20]) * 100; if (p > 90 && p < 110) a.pre.push(p); }
      if (!k.endsWith("|*") && a.ex!.length < SIMILAR_EX) a.ex!.push([r[2], r[5], r[6], r[9], r[7], r[8], r[10], r[1], wr, r[25].map((x) => [x[2], x[4], x[3]] as [string, number, number])]);
    }
  }
  const out: SimilarIndexFile = { v: 1, builtAt: new Date().toISOString(), from: since, to: iso(addDays(today, 6)), groups: {} };
  const qs = <N extends number>(v: number[], ps: number[]) => { const s = v.sort((a, b) => a - b); return ps.map((p) => r3(quantile(s, p))) as number[] & { length: N }; };
  for (const [k, a] of groups) {
    if (a.n < SIMILAR_MIN) continue;
    const st: SimilarStat = {
      n: a.n,
      bidders: { q: qs<3>(a.bidders, [0.25, 0.5, 0.75]) as [number, number, number], mean: r3(a.bidders.reduce((s, x) => s + x, 0) / Math.max(1, a.bidders.length)) },
      winners: [...a.winners].sort((x, y) => y[1] - x[1]).slice(0, 5).filter(([, c]) => c >= 2),
    };
    const ranked = [...a.ranked].sort((x, y) => y[1] - x[1]).slice(0, 8).filter(([, c]) => c >= 2);
    if (ranked.length) st.ranked = ranked;
    if (a.rates.length >= SIMILAR_MIN) st.rate = { q: qs<5>(a.rates, [0.1, 0.25, 0.5, 0.75, 0.9]) as [number, number, number, number, number], mean: r3(a.rates.reduce((s, x) => s + x, 0) / a.rates.length), n: a.rates.length };
    if (a.gaps.length >= SIMILAR_MIN) st.gap = { q: qs<3>(a.gaps, [0.25, 0.5, 0.75]) as [number, number, number], n: a.gaps.length };
    if (a.rkn >= SIMILAR_MIN) st.ranks = { mean: a.rk.map((v) => (v.length ? r3(v.reduce((s, x) => s + x, 0) / v.length) : 0)), n: a.rkn, winnerFirst: a.firstN ? r3(a.first / a.firstN) : 0 };
    if (a.pre.length >= SIMILAR_MIN) st.pre = { q: qs<3>(a.pre, [0.25, 0.5, 0.75]) as [number, number, number], n: a.pre.length };
    if (a.ex?.length) st.ex = a.ex;
    out.groups[k] = st;
  }
  const body = gz(out);
  await upload("idx/similar.json.gz", body);
  console.log(`분석 색인: 비슷한 공고 묶음 ${Object.keys(out.groups).length.toLocaleString()}개 (${since}~, ${fmtGB(body.length)})`);

  // 3. 공고명 핵심어 색인 (최근 SIMILAR_YEARS 년, 기관 무관)
  const df = new Map<string, number>();
  const post = new Map<string, KwRow[]>();
  let kwN = 0;
  for (const r of rows) {
    if (r[9] < since) break;
    kwN++;
    const kr: KwRow = [r[2], r[5], r[6], r[9], r[4], r[7], r[8] > 50 && r[8] <= 110 ? r[8] : 0, r[10], methodCode(r[11]), r[20], r[1], winnerRank(r),
      r[25].slice(0, 5).map((x) => [x[2], x[4]] as [string, number])];
    for (const k of keywords(r[5])) {
      df.set(k, (df.get(k) ?? 0) + 1);
      const p = post.get(k) ?? post.set(k, []).get(k)!;
      if (p.length < KW_ROWS) p.push(kr);
    }
  }
  const kwFiles: KwIndexFile[] = Array.from({ length: AGENCY_BUCKETS }, () => ({ v: 1, n: kwN, kw: {} }));
  let kwCount = 0;
  for (const [k, d] of df) {
    if (d < KW_MIN_DF) continue;
    kwFiles[Number(kwBucket(k))].kw[k] = { df: d, rows: post.get(k)! };
    kwCount++;
  }
  let kwBytes = 0;
  for (let i = 0; i < kwFiles.length; i++) {
    const b = gz(kwFiles[i]);
    kwBytes += b.length;
    await upload(`idx/kw/${String(i).padStart(2, "0")}.json.gz`, b);
  }
  console.log(`분석 색인: 공고명 핵심어 ${kwCount.toLocaleString()}개 (공고 ${kwN.toLocaleString()}건, ${fmtGB(kwBytes)})`);
  const kw: KwLookup = { n: kwN, get: (k: string): KwPosting | undefined => kwFiles[Number(kwBucket(k))].kw[k] };
  return { rows, buckets, similar: out, kw };
}

/**
 * 색인 확인용: 최근 낙찰 공고 몇 건을 '지금 공고'로 보고 분석을 만들어 로그에 한 줄씩 찍는다 (SAMPLE_ANALYSIS {...}).
 * 업무·계약방법이 다른 공고를 고르고, 과거 같은 사업이 3건 이상인 것을 우선한다
 */
function printSamples(ix: Awaited<ReturnType<typeof buildIndexes>>) {
  const want: [AwardBiz, string][] = [["용역", "Q"], ["용역", "N"], ["공사", "Q"], ["물품", "Q"], ["물품", "L"], ["용역", "Q"], ["공사", "Q"], ["용역", "N"]];
  const used = new Set<string>();
  const range = { from: ix.rows[ix.rows.length - 1]?.[9] ?? "", to: ix.rows[0]?.[9] ?? "" };
  for (const [biz, m] of want) {
    for (const r of ix.rows.slice(0, 60_000)) {
      if (r[4] !== biz || methodCode(r[11]) !== m || used.has(r[2]) || !r[6] || used.has(r[6])) continue;
      const target = {
        id: `${r[2]}-${r[3]}`, bidNtceNo: r[2], title: r[5], demandAgency: r[6], bizType: biz,
        contractMethod: m === "Q" ? "적격심사" : m === "N" ? "협상에 의한 계약" : "최저가", baseAmount: r[20] || r[12] || r[7],
        postedAt: `${r[9]}T00:00:00+09:00`, licenseRaw: r[19], cls: { no: r[13] || undefined, nm: r[14] || undefined, work: r[17] || undefined },
        lowerLimitRate: r[22] || undefined,
      };
      const a = analyzeBid(target, ix.buckets[Number(agencyBucket(r[6]))].agencies[r[6]], ix.similar.groups, range, { kw: ix.kw });
      if (a.history.length < 3 || !a.prior || !a.similar) continue;
      used.add(r[2]); used.add(r[6]);
      console.log(`SAMPLE_ANALYSIS ${JSON.stringify({ target, actual: { rate: r[8], bidders: r[10], winner: r[1], amount: r[7] }, analysis: a })}`);
      break;
    }
  }
}

/**
 * 되짚어 보기: 최근 8주 낙찰 공고를 '지금 공고'로 보고 그 전 자료만으로 예측한 낙찰률·참가업체 수를 실제와 비교한다
 */
const fmtWon = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : `${n}`);

function backtest(ix: Awaited<ReturnType<typeof buildIndexes>>): { a: AwardAnalysis; actual: { winner: string } }[] {
  const since = iso(addDays(mondayOf(kstNow()), -56));
  const range = { from: "", to: "" };
  type Acc = { n: number; rateN: number; rateErr: number[]; inBand: number; bidN: number; bidIn: number; bidErr: number[]; prior: number; priorNear: number; priorErr: number[]; hist: number; maybe: number; maybeN: number; exN: number };
  const accs = { old: new Map<string, Acc>(), now: new Map<string, Acc>() };
  const diffs: string[] = [];
  const trial: { a: AwardAnalysis; actual: { winner: string } }[] = [];
  let seen = 0;
  for (const r of ix.rows) {
    if (r[9] < since) break;
    if (!r[6] || seen >= 20_000) continue;
    const m = methodCode(r[11]);
    if (m === "O") continue;
    seen++;
    const target = {
      id: r[2], bidNtceNo: r[2], title: r[5], demandAgency: r[6], bizType: r[4], contractMethod: METHOD_NAME[m], baseAmount: r[20] || r[12] || r[7],
      postedAt: `${r[9]}T00:00:00+09:00`, licenseRaw: r[19], cls: { no: r[13] || undefined, nm: r[14] || undefined, work: r[17] || undefined },
    };
    const rows = ix.buckets[Number(agencyBucket(r[6]))].agencies[r[6]];
    const pair = { old: analyzeBid(target, rows, ix.similar.groups, range, { legacy: true }), now: analyzeBid(target, rows, ix.similar.groups, range, { kw: ix.kw }) };
    for (const kind of ["old", "now"] as const) {
      const a = pair[kind];
      const fc = forecast(a, { contractMethod: target.contractMethod, lowerLimitRate: r[22] || undefined });
      const k = `${r[4]} ${METHOD_NAME[m]}`;
      const x = accs[kind].get(k) ?? accs[kind].set(k, { n: 0, rateN: 0, rateErr: [], inBand: 0, bidN: 0, bidIn: 0, bidErr: [], prior: 0, priorNear: 0, priorErr: [], hist: 0, maybe: 0, maybeN: 0, exN: 0 }).get(k)!;
      x.n++;
      x.hist += a.history.length;
      if (a.maybe?.length) { x.maybe++; x.maybeN += a.maybe.length; }
      if (a.similar?.stat.ex?.length) x.exN++;
      if (a.prior) {
        x.prior++;
        const amt = a.prior.base || a.prior.amount, tb = target.baseAmount;
        if (amt > 0 && tb > 0 && Math.max(amt, tb) / Math.min(amt, tb) <= 2) x.priorNear++;
        if (a.prior.rate > 50 && a.prior.rate <= 110 && r[8] > 50 && r[8] <= 110) x.priorErr.push(Math.abs(a.prior.rate - r[8]));
      }
      if (fc.winRate && r[8] > 50 && r[8] <= 110) { x.rateN++; x.rateErr.push(Math.abs(fc.winRate.value - r[8])); }
      if (fc.bidders && r[10] > 0) {
        x.bidN++;
        const [lo, mid, hi] = fc.bidders.q;
        if (r[10] >= lo && r[10] <= hi) x.bidIn++;
        x.bidErr.push(Math.abs(mid - r[10]) / Math.max(1, r[10]));
      }
    }
    if (pair.now.maybe?.length && trial.length < 40 && seen % 11 === 0) trial.push({ a: pair.now, actual: { winner: r[1] } });
    if (diffs.length < 40 && pair.old.prior && pair.old.prior.no !== pair.now.prior?.no && seen % 7 === 0) {
      diffs.push(`PRIOR_DIFF ${r[4]} | ${r[5]} | ${fmtWon(target.baseAmount)} || 전: ${pair.old.prior.title} (${pair.old.prior.date}, ${fmtWon(pair.old.prior.base || pair.old.prior.amount)}) || 후: ${pair.now.prior ? `${pair.now.prior.title} (${pair.now.prior.date}, ${fmtWon(pair.now.prior.base || pair.now.prior.amount)})` : "없음"}${pair.now.maybe?.length ? ` || 애매 ${pair.now.maybe.length}건: ${pair.now.maybe.slice(0, 3).map((x) => x.title).join(" / ")}` : ""}`);
    }
  }
  const med = (v: number[]) => (v.length ? r3(quantile(v.sort((a, b) => a - b), 0.5)) : 0);
  const pc = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`;
  for (const kind of ["old", "now"] as const) {
    for (const [k, x] of [...accs[kind]].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`BACKTEST${kind === "old" ? "_OLD" : ""} ${k}: 공고 ${x.n.toLocaleString()}건 · 낙찰률 예측 ${x.rateN.toLocaleString()}건, 오차 중앙값 ${med(x.rateErr)}%p, 1%p 안 ${pc(x.rateErr.filter((e) => e <= 1).length, x.rateN)} · 참가업체 예상 범위 안 ${pc(x.bidIn, x.bidN)}, 오차 중앙값 ${Math.round(med(x.bidErr) * 100)}% · 전년도 찾음 ${pc(x.prior, x.n)}, 그중 금액 2배 안 ${pc(x.priorNear, x.prior)}, 전년도 낙찰률과 실제 차이 중앙값 ${med(x.priorErr)}%p · 같은 사업 평균 ${(x.hist / Math.max(1, x.n)).toFixed(1)}건 · 애매 후보 있는 공고 ${pc(x.maybe, x.n)} (평균 ${(x.maybeN / Math.max(1, x.maybe)).toFixed(1)}건) · 비슷한 공고 예 있음 ${pc(x.exN, x.n)}`);
    }
  }
  for (const d of diffs) console.log(d);
  return trial;
}

/** 지금 사이트에 있는 공고 몇 건(CHECK_NOTICES)을 고치기 전·후로 분석해 찍는다 */
async function checkNotices(ix: Awaited<ReturnType<typeof buildIndexes>>) {
  const nos = (process.env.CHECK_NOTICES || "").split(",").map((x) => x.trim()).filter(Boolean);
  const site = process.env.SITE_URL;
  if (!nos.length || !site) return;
  let items: Record<string, unknown>[] = [];
  try {
    const r = await fetch(`${site.replace(/\/$/, "")}/bids-data.json`);
    const j = (await r.json()) as Record<string, unknown>[] | { items: Record<string, unknown>[] };
    items = Array.isArray(j) ? j : j.items ?? [];
  } catch (e) {
    console.log(`CHECK 사이트 공고를 읽지 못함: ${(e as Error).message}`);
    return;
  }
  const range = { from: "", to: "" };
  for (const no of nos) {
    const b = items.find((x) => x.bidNtceNo === no) as unknown as Parameters<typeof analyzeBid>[0] & { lowerLimitRate?: number } | undefined;
    if (!b) { console.log(`CHECK ${no}: 사이트에 없음`); continue; }
    const rows = ix.buckets[Number(agencyBucket(b.demandAgency))].agencies[b.demandAgency];
    for (const kind of ["old", "now"] as const) {
      const a = analyzeBid(b, rows, ix.similar.groups, range, kind === "old" ? { legacy: true } : { kw: ix.kw });
      const fc = forecast(a, b);
      const ex = a.related?.ex ?? a.similar?.stat.ex ?? [];
      if (kind === "now") console.log(`SAMPLE_ANALYSIS ${JSON.stringify({ target: b, analysis: a })}`);
      console.log(`CHECK ${kind === "old" ? "전" : "후"} ${no} ${b.title} (${b.demandAgency}) | 전년도: ${a.prior?.title ?? "없음"} | 같은 사업 ${a.history.length}건 | 비슷한 공고: ${a.related ? `핵심어 ${a.related.terms.join("·")} ${a.related.n}건` : a.similar?.label ?? "없음"} | 참가 예상: ${(fc.likely ?? []).slice(0, 6).map((x) => x.name).join(", ")} | 최근 낙찰 예: ${ex.slice(0, 4).map((e) => `${e[1]}(${e[7]})`).join(" / ")}`);
    }
  }
}

/** 애매한 후보 확인 시험: RELATE_TRIAL 건만큼 실제로 Claude에 물어 토큰과 판단을 찍는다 (ANTHROPIC_API_KEY 가 있을 때만) */
async function relateTrial(trial: { a: AwardAnalysis; actual: { winner: string } }[]) {
  const n = Number(process.env.RELATE_TRIAL || 0);
  if (!n || !process.env.ANTHROPIC_API_KEY || !trial.length) return;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { relateWithAI } = await import("../../src/lib/awards/relate");
  const client = new Anthropic({ maxRetries: 2 });
  let tin = 0, tout = 0, done = 0, same = 0, cands = 0;
  for (const { a } of trial.slice(0, n)) {
    if (!a.subject) continue;
    try {
      const r = await relateWithAI(client, a.subject, a);
      done++; cands += a.maybe?.length ?? 0; same += r.same.length;
      tin += r.usage?.input ?? 0; tout += r.usage?.output ?? 0;
      console.log(`RELATE_TRIAL ${a.subject.title} | 후보 ${a.maybe?.length}건, 같음 ${r.same.length}건 | 입력 ${r.usage?.input} 출력 ${r.usage?.output} | ${r.reason ?? r.status}`);
    } catch (e) {
      console.log(`RELATE_TRIAL 실패: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  if (done) console.log(`RELATE_TRIAL 합계: ${done}건, 후보 ${cands}건 중 같음 ${same}건, 공고당 입력 ${Math.round(tin / done)} 출력 ${Math.round(tout / done)} 토큰`);
}

async function indexMode() {
  const m = await r2Get("manifest.json");
  if (m) manifest = JSON.parse(m.toString()) as Manifest;
  const rs = await r2Get("rank-state.json");
  if (rs) rankState = JSON.parse(rs.toString()) as RankState;
  const { awardWeeks, leadWeeks } = plan(kstNow());
  const r = await build(awardWeeks, leadWeeks, { indexOnly: true });
  console.log(`색인만 다시 만듦: 낙찰 ${r.rows.toLocaleString()}건`);
}

/* ---------- 실행 ---------- */

async function check() {
  const key = `check/${Date.now()}.txt`;
  await r2Put(key, Buffer.from("ok"), "text/plain");
  const back = await r2Get(key);
  await r2Delete(key);
  if (back?.toString() !== "ok") throw new Error("R2에 쓴 내용을 다시 읽지 못했습니다.");
  const m = await r2Get("manifest.json");
  const bytes = await r2BucketBytes();
  console.log(`R2 읽기·쓰기 확인: 통과 (버킷 ${process.env.R2_BUCKET || "bidmate-awards"})`);
  console.log(`수집 상태 파일: ${m ? `있음 (원자료 ${Object.keys((JSON.parse(m.toString()) as Manifest).raw).length}개)` : "아직 없음"}`);
  console.log(`Cloudflare 집계 사용량: ${bytes === undefined ? "확인 불가" : fmtGB(bytes)}`);
}

async function main() {
  if (process.argv[2] === "check") return check();
  if (process.argv[2] === "rank") return rankMode();
  if (process.argv[2] === "index") return indexMode();

  const m = await r2Get("manifest.json");
  if (m) manifest = JSON.parse(m.toString()) as Manifest;
  const rs = await r2Get("rank-state.json");
  if (rs) rankState = JSON.parse(rs.toString()) as RankState;
  r2Measured = (await r2BucketBytes()) ?? 0;
  const today = kstNow();
  const { jobs, awardWeeks, leadWeeks } = plan(today);
  const totalRaw = KINDS.reduce((s, k) => s + (k.lead ? leadWeeks : awardWeeks).length * k.ops.length, 0);
  const haveRaw = Object.keys(manifest.raw).length;
  const used = Math.max(usedBytes(), r2Measured);
  // 예상 최종 용량: 지금까지 원자료 한 개당 크기로 남은 원자료를 채우고, 샤드·통계는 원자료와 비슷한 크기로 본다
  const rawBytes = Object.values(manifest.raw).reduce((s, e) => s + e.bytes, 0);
  // 개찰 순위: 받은 주의 평균 크기로 10년치를 채우고, 샤드에 붙는 몫만큼 두 배로 본다
  const rankDone = Object.values(rankState.weeks).filter((x) => x.awardAt);
  const rankProjected = rankDone.length >= 10 ? Math.round((rankDone.reduce((s, x) => s + x.bytes, 0) / rankDone.length) * awardWeeks.length * 3 * 2) : 0;
  const projected = haveRaw >= 20 ? Math.round((rawBytes / haveRaw) * totalRaw * 2.2) + rankProjected : 0;
  console.log(`기간: 낙찰 ${iso(awardWeeks[awardWeeks.length - 1])}부터 ${awardWeeks.length}주, 공고 ${leadWeeks.length}주 (${AWARD_YEARS}년 + 앞선 ${NOTICE_LEAD_WEEKS}주)`);
  console.log(`원자료 ${haveRaw}/${totalRaw}개 보유, 이번에 받을 것 ${jobs.length}개`);
  console.log(`R2 사용량 ${fmtGB(used)} (직접 집계 ${fmtGB(usedBytes())}, Cloudflare 집계 ${r2Measured ? fmtGB(r2Measured) : "확인 불가"}), 예상 최종 ${projected ? fmtGB(projected) : "아직 계산 불가"}, 승인 용량 ${fmtGB(APPROVED)}`);

  if (projected > APPROVED) {
    manifest.blocked = { at: new Date().toISOString(), usedBytes: used, projectedBytes: projected, reason: "예상 최종 용량이 승인 용량을 넘음" };
    await saveManifest();
    console.error(`::error::예상 최종 용량 ${fmtGB(projected)}가 승인 용량 ${fmtGB(APPROVED)}를 넘어 수집을 멈춥니다. 사용자 승인 후 저장소 변수 R2_APPROVED_BYTES 를 올려 주세요.`);
    process.exit(2);
  }

  let stopped: string | undefined;
  try {
    const r = await collect(jobs);
    stopped = r.stopped;
    console.log(`이번 실행: ${r.done}/${jobs.length}개 받음, 호출 ${calls}회${stopped ? `, 중단: ${stopped}` : ""}`);
  } finally {
    await saveManifest();
  }

  if (process.argv[2] === "raw") {
    console.log(`원자료만 받기: 샤드·통계는 다음 일반 실행에서 만든다. 원자료 ${Object.keys(manifest.raw).length}/${totalRaw}개, R2 ${fmtGB(usedBytes())}`);
    if (stopped && /승인 용량/.test(stopped)) { console.error(`::error::${stopped}`); process.exit(2); }
    return;
  }

  let quota = stopped && /승인 용량/.test(stopped) ? stopped : undefined;
  let built = { rows: 0, shards: 0 };
  if (!quota) {
    try {
      built = await build(awardWeeks, leadWeeks);
    } catch (e) {
      // 올린 샤드까지는 상태에 남겨 다음 실행이 다시 올리지 않게 한다
      await saveManifest().catch(() => undefined);
      if (!(e instanceof QuotaStop)) throw e;
      quota = e.message;
    }
  }

  const need = (weeks: string[], ops: string[]) => weeks.length * ops.length;
  const have = (k: Kind) => Object.keys(manifest.raw).filter((x) => x.startsWith(`raw/${k}/`)).length;
  const awardPerOp = Math.min(...Object.values(OPS).map((op) => awardWeeks.filter((w) => manifest.raw[`raw/award/${op}/${w}.json.gz`]).length));
  const complete = KINDS.every((k) => have(k.kind) >= need(k.lead ? leadWeeks : awardWeeks, k.ops));
  // 가장 오래된 주부터 끊김 없이 받은 범위의 시작
  let from = iso(mondayOf(today));
  for (const w of awardWeeks) {
    if (Object.values(OPS).every((op) => manifest.raw[`raw/award/${op}/${w}.json.gz`])) from = iso(w);
    else break;
  }
  const meta: AwardMeta = {
    builtAt: new Date().toISOString(), from, to: iso(addDays(mondayOf(today), 6)), weeks: awardPerOp, totalWeeks: awardWeeks.length,
    complete, rows: built.rows, bytes: usedBytes(),
    rankWeeks: Math.floor(Object.values(rankState.weeks).filter((x) => x.awardAt).length / 3),
  };
  if (!quota) await put("stats/meta.json", Buffer.from(JSON.stringify(meta)), "application/json").catch((e) => { if (e instanceof QuotaStop) quota = e.message; else throw e; });
  if (quota) {
    manifest.blocked = { at: new Date().toISOString(), usedBytes: Math.max(usedBytes(), r2Measured), projectedBytes: projected, reason: quota };
  } else delete manifest.blocked;
  await saveManifest();
  console.log(`완료 여부: ${complete ? `${AWARD_YEARS}년치 완료` : `낙찰 ${awardPerOp}/${awardWeeks.length}주`} · 끊김 없는 범위 ${from}~ · R2 ${fmtGB(usedBytes())}`);
  if (quota) {
    console.error(`::error::${quota}. 업로드를 멈췄습니다. 사용자 승인 후 저장소 변수 R2_APPROVED_BYTES 를 올려 주세요.`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
