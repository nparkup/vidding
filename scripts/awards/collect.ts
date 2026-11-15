/**
 * 나라장터 낙찰 5년치(AWARD_YEARS)를 모아 Cloudflare R2(bidmate-awards)에 저장한다. GitHub Actions(.github/workflows/awards.yml)가 실행한다.
 *
 *   npx tsx scripts/awards/collect.ts            수집 + 샤드·통계 다시 만들기
 *   npx tsx scripts/awards/collect.ts check      토큰의 R2 읽기·쓰기 권한만 확인
 *   npx tsx scripts/awards/collect.ts raw        원자료만 받고 샤드·통계는 그대로 둔다 (배포 전 코드로 미리 채울 때)
 *
 * 1. 한 주(월~일) 단위로 받는다. 낙찰정보·입찰공고정보 API는 한 번에 7일까지만 조회된다(2026-11-10 공지).
 *    - 낙찰: 낙찰정보서비스 getScsbidListSttus{Servc,Cnstwk,Thng} (최종낙찰자 목록, 등록일 기준)
 *    - 공고: 입찰공고정보서비스 getBidPblancListInfo{op}02 (계약방법·추정가격·분류), PrtcptPsblRgn02(지역), LicenseLimit02(업종)
 *    최근 주부터 거꾸로 받고, 아직 끝나지 않은 최근 2주는 매번 다시 받는다. 끝난 주는 다시 받지 않는다.
 * 2. 실행 한 번에 MAX_MINUTES 분까지만 받고 멈춘다. 다음 실행이 이어 받는다(처음 채우는 기간은 며칠에 나눠 받는다).
 * 3. 받은 원자료를 공고번호로 합쳐 사업자번호별 샤드와 낙찰률 통계를 만들고, 바뀐 파일만 올린다.
 * 4. 용량 한도: R2 사용량이 승인 용량(R2_APPROVED_BYTES, 기본 5GB)의 90%에 닿거나, 예상 최종 용량이 승인 용량을 넘으면
 *    올리기 전에 멈추고 실패로 끝낸다(사용자 승인 후 R2_APPROVED_BYTES 를 올려야 이어진다).
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import {
  AWARD_YEARS, BIZ_OF_OP, NOTICE_LEAD_WEEKS, OPS, SHARD_COLS, addDays, awardStartWeek, iso, kstNow, mondayOf, rateMethodOf,
  firstLicense, shardOf, weeksBetween, type AwardBiz, type AwardMeta, type ShardFile, type ShardRow,
} from "../../src/lib/awards/format";
import { BANDS, bandOf, statKey, type RateStat } from "../../src/lib/rivalRate";
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

type Kind = "award" | "notice" | "rgn" | "lic";
const KINDS: { kind: Kind; ops: string[]; path: string; op: (o: string) => string; lead: boolean }[] = [
  { kind: "award", ops: Object.values(OPS), path: "/as/ScsbidInfoService", op: (o) => `getScsbidListSttus${o}`, lead: false },
  { kind: "notice", ops: Object.values(OPS), path: "/ad/BidPublicInfoService02", op: (o) => `getBidPblancListInfo${o}02`, lead: true },
  { kind: "rgn", ops: ["all"], path: "/ad/BidPublicInfoService02", op: () => "getBidPblancListInfoPrtcptPsblRgn02", lead: true },
  { kind: "lic", ops: ["all"], path: "/ad/BidPublicInfoService02", op: () => "getBidPblancListInfoLicenseLimit02", lead: true },
];

interface RawEntry { rows: number; bytes: number; at: string; calls: number }
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
        t(i.pubPrcrmntLrgClsfcNm), t(i.mainCnsttyNm), t(i.cnstrtsiteRgnNm), t(i.ntceKindNm)];
    case "rgn":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.prtcptPsblRgnNm)];
    case "lic":
      return [t(i.bidNtceNo), t(i.bidNtceOrd) || "000", t(i.lcnsLmtNm)];
  }
}

/* ---------- 상태·용량 ---------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const gz = (o: unknown) => gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
const sha = (b: Buffer) => createHash("sha1").update(b).digest("hex");
const local = (key: string) => join(WORK, key);
const fmtGB = (b: number) => `${(b / 1e9).toFixed(2)}GB`;

let manifest: Manifest = { v: 1, raw: {}, files: {} };
let r2Measured = 0;

const usedBytes = () => Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0);

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
        if (e && (settled(w, e.at) || fresh(e.at))) continue;
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
        const rows = items.map((i) => slim(j.kind, i)).filter((r) => r[0]);
        const body = gz(rows);
        await put(j.key, body);
        manifest.raw[j.key] = { rows: rows.length, bytes: body.length, at: new Date().toISOString(), calls: c };
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

/* ---------- 합치기 ---------- */

interface NoticeInfo { method: string; price: number; clsNo: string; clsNm: string; mid: string; lrg: string; work: string; site: string }

async function build(awardWeeks: string[], leadWeeks: string[]) {
  // 공고: 공고번호 → 마지막 차수 정보
  const notices = new Map<string, NoticeInfo & { ord: string }>();
  const region = new Map<string, Set<string>>();
  const lic = new Map<string, Set<string>>();
  for (const w of [...leadWeeks].reverse()) {
    for (const op of Object.values(OPS)) {
      for (const r of await readRaw(`raw/notice/${op}/${w}.json.gz`)) {
        const [no, ord, method, price, clsNo, clsNm, mid, lrg, work, site] = r as [string, string, string, number, string, string, string, string, string, string];
        const prev = notices.get(no);
        if (prev && prev.ord > ord) continue;
        notices.set(no, { ord, method, price, clsNo, clsNm, mid, lrg, work, site });
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

  // 낙찰: 같은 공고·차수·분류·재입찰은 한 번만
  const seen = new Set<string>();
  const shards = new Map<string, ShardRow[]>();
  let rows = 0;
  let matched = 0;
  for (const w of awardWeeks) {
    for (const op of Object.values(OPS)) {
      const biz = BIZ_OF_OP[op] as AwardBiz;
      for (const r of await readRaw(`raw/award/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, rbid, title, bidders, winner, bizno, amount, rate, agency, date] =
          r as [string, string, string, string, string, number, string, string, number, number, string, string];
        if (!bizno || bizno.length !== 10) continue;
        const id = `${no}-${ord}-${clsfc}-${rbid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const nt = notices.get(no);
        if (nt) matched++;
        const row: ShardRow = [
          bizno, winner, no, ord, biz, title, agency, amount, rate, date, bidders,
          nt?.method ?? "", nt?.price ?? 0, nt?.clsNo ?? "", nt?.clsNm ?? "", nt?.mid ?? "", nt?.lrg ?? "", nt?.work ?? "",
          [...(region.get(no) ?? (nt?.site ? [nt.site] : []))].join(", "), [...(lic.get(no) ?? [])].join(", "),
        ];
        const k = shardOf(bizno);
        (shards.get(k) ?? shards.set(k, []).get(k)!).push(row);
        rows++;
      }
    }
  }
  console.log(`낙찰 ${rows.toLocaleString()}건 (공고 정보 붙은 건 ${matched.toLocaleString()}건), 공고 ${notices.size.toLocaleString()}건`);

  let uploaded = 0;
  const keys = [...shards.keys()].sort();
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < keys.length) {
      const k = keys[next++];
      const list = shards.get(k)!.sort((a, b) => b[9].localeCompare(a[9]) || a[0].localeCompare(b[0]));
      const file: ShardFile = { v: 1, cols: SHARD_COLS, rows: list };
      if (await put(`shards/${k}.json.gz`, gz(file))) uploaded++;
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

  return { rows, shards: keys.length };
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

  const m = await r2Get("manifest.json");
  if (m) manifest = JSON.parse(m.toString()) as Manifest;
  r2Measured = (await r2BucketBytes()) ?? 0;
  const today = kstNow();
  const { jobs, awardWeeks, leadWeeks } = plan(today);
  const totalRaw = awardWeeks.length * 3 + leadWeeks.length * 5;
  const haveRaw = Object.keys(manifest.raw).length;
  const used = Math.max(usedBytes(), r2Measured);
  // 예상 최종 용량: 지금까지 원자료 한 개당 크기로 남은 원자료를 채우고, 샤드·통계는 원자료와 비슷한 크기로 본다
  const rawBytes = Object.values(manifest.raw).reduce((s, e) => s + e.bytes, 0);
  const projected = haveRaw >= 20 ? Math.round((rawBytes / haveRaw) * totalRaw * 2.2) : 0;
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
