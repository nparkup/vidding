import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { call, classify, mapLimit } from "./client";
import { groupLicenses } from "./qualification";
import { applyIndustryLaws, type IndustryLawTable } from "./industryLaw";
import type { BidQual } from "../eligibility";
import { agencyKey, type NuriBid, type NuriBidsFile, type NuriBiz, type NuriContract, type NuriRateStat, type NuriResult } from "../nuri";

/**
 * 누리장터(민간) 입찰 수집. 공공데이터포털 조달청 서비스 3개 (키는 나라장터와 같은 DATA_GO_KR_SERVICE_KEY):
 * - 누리장터 민간입찰공고서비스 (PrvtBidNtceService): 용역·공사·물품·기타 공고, 면허제한, 참가가능지역
 * - 누리장터 민간낙찰정보서비스 (PrvtScsbidInfoService): 개찰결과 목록 + 공고별 개찰 순위(투찰금액·투찰률)
 * - 누리장터 민간계약정보서비스 (PrvtCntrctInfoService): 계약현황
 * 2026-11-23 실제 호출로 확인: 조회 기간은 7일까지(넘으면 오류), inqryDiv=1 은 등록일시 기준. 7일 동안 용역 176·공사 23·물품 39·기타 0건,
 * 개찰결과 116건(개찰완료·유찰), 계약 84건. 최종낙찰 목록(getPrvtScsbidListSttus)은 어느 조회 조건으로도 0건이라 쓰지 않고
 * 개찰완료 공고의 개찰 순위(getPrvtOpengResultListInfoOpengCompt)를 쓴다. 계약에는 입찰공고번호가 없어 기관명으로만 잇는다.
 * 담당자 이름·전화·이메일과 업체 대표자 이름·주소·전화는 저장하지 않는다.
 */
const BID = "/ao/PrvtBidNtceService";
const RES = "/ao/PrvtScsbidInfoService";
const CON = "/ao/PrvtCntrctInfoService";
const CACHE = ".cache/nuri";
const ROWS = 999;
/** 진행 중 공고를 찾는 기간 (등록일 기준). 입찰 기간이 길어도 한 달 반 안에 들어온다 */
const NOTICE_WEEKS = 7;
/** 개찰 결과·계약을 모으는 기간 */
const HISTORY_WEEKS = 26;
/** 한 빌드에서 새로 묻는 공고별 개찰 순위 수 (나머지는 다음 빌드) */
const RANK_BUDGET = 1500;

type Item = Record<string, string | undefined>;

const p2 = (n: number) => String(n).padStart(2, "0");
const kstYmd = (t: number) => { const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`; };
/** "2026-11-26 18:00:00" → "2026-11-26T18:00:00+09:00" */
const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.trim().slice(0, 10)}T${(s.trim().slice(11, 19) || "00:00:00").padEnd(8, ":00")}+09:00` : undefined);
const num = (s?: string) => { const n = Number(String(s ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : undefined; };
const clean = (s?: string) => s?.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || undefined;

/**
 * 월요일~일요일로 끊은 기간 [시작, 끝] (YYYYMMDD), 이번 주(월요일~오늘)부터 거꾸로 n개.
 * 경계가 날마다 움직이지 않아야 지난 주 응답을 캐시에서 그대로 다시 쓴다.
 */
function weeks(n: number, now = Date.now()): [string, string][] {
  const dow = (new Date(now + 9 * 3600e3).getUTCDay() + 6) % 7; // 월요일 0
  const monday = now - dow * 864e5;
  return Array.from({ length: n }, (_, i) => i === 0 ? [kstYmd(monday), kstYmd(now)] : [kstYmd(monday - i * 7 * 864e5), kstYmd(monday - (i - 1) * 7 * 864e5 - 864e5)]);
}

function readJson<T>(file: string): T | undefined {
  try { return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined; } catch { return undefined; }
}
function writeJson(file: string, v: unknown) {
  try { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, JSON.stringify(v)); } catch { /* 캐시는 없어도 된다 */ }
}

async function all(path: string, op: string, params: Record<string, string>): Promise<Item[]> {
  const first = await call(path, op, { ...params, numOfRows: String(ROWS), pageNo: "1" });
  const items = [...first.items] as Item[];
  for (let p = 2; p <= Math.ceil(first.total / ROWS); p++) items.push(...((await call(path, op, { ...params, numOfRows: String(ROWS), pageNo: String(p) })).items as Item[]));
  return items;
}

/**
 * 7일 단위 기간 조회. 끝난 지 3일이 넘은 기간은 바뀌지 않으므로 캐시에서 읽는다.
 * 실패한 기간은 건너뛰고 failed 로 센다.
 */
async function byWeeks(path: string, op: string, n: number, slim: (it: Item) => Item, stats: { calls: number; failed: number }): Promise<Item[]> {
  const today = kstYmd(Date.now());
  const fresh = kstYmd(Date.now() - 3 * 864e5);
  const out = await mapLimit(weeks(n), 3, async ([from, to]) => {
    const file = join(CACHE, op, `${from}-${to}.json`);
    const done = to < fresh && to < today;
    if (done) { const c = readJson<Item[]>(file); if (c) return c; }
    try {
      stats.calls++;
      const rows = (await all(path, op, { inqryDiv: "1", inqryBgnDt: `${from}0000`, inqryEndDt: `${to}2359` })).map(slim);
      if (done) writeJson(file, rows);
      return rows;
    } catch (e) {
      stats.failed++;
      console.warn(`누리장터 ${op} ${from}~${to} 실패:`, e instanceof Error ? e.message : e);
      return [];
    }
  });
  return out.flat();
}

const pick = (keys: string[]) => (it: Item): Item => Object.fromEntries(keys.filter((k) => it[k] != null && it[k] !== "").map((k) => [k, it[k]]));

/* ---------- 공고 ---------- */

const NOTICE_KEYS = ["bidNtceNo", "bidNtceOrd", "bidNtceClsfc", "nticeDt", "rgstDt", "refNo", "ntceNm", "ntceDivNm", "ntceInsttNm", "bidMethdNm", "cntrctMthdNm", "sucsfbidMthdNm", "rbidDivNm", "bidQlfctNm",
  "bidBeginDt", "bidClseDt", "opengDt", "opengPlce", "sptDscrptDt", "sptDscrptPlce", "vatInclsnYnNm", "refAmtUseYn", "refAmtOpenYn", "refAmt", "asignBdgtAmt", "rgnLmtDivNm",
  "servcDtlList", "cnstwkDtlList", "prdctDtlList", "aptHsmpNm", "aptHshldNum", "aptCmplNum", "aptTotar", "aptHeatMethdNm",
  ...Array.from({ length: 10 }, (_, i) => [`ntceSpecDocNm${i + 1}`, `ntceSpecDocUrl${i + 1}`]).flat()];
const OPS: [NuriBiz, string][] = [["용역", "Servc"], ["공사", "Cnstwk"], ["물품", "Thng"], ["기타", "Etc"]];

/** 상세목록 "[1^이름^장소^기한]" 첫 줄 */
function firstDetail(s?: string): NuriBid["detail"] {
  const m = s?.match(/\[([^\]]+)\]/);
  if (!m) return undefined;
  const f = m[1].split("^");
  return { name: clean(f[1]), place: clean(f.length > 4 ? f[4] : f[2]), until: f.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) };
}

function toBid(it: Item, biz: NuriBiz, qual: BidQual | undefined, regions: string[]): NuriBid | undefined {
  const no = it.bidNtceNo, title = clean(it.ntceNm);
  const closeAt = iso(it.bidClseDt) ?? iso(it.opengDt);
  if (!no || !title || !closeAt) return undefined;
  const files = Array.from({ length: 10 }, (_, i) => ({ name: clean(it[`ntceSpecDocNm${i + 1}`]) ?? "", url: it[`ntceSpecDocUrl${i + 1}`] ?? "" })).filter((f) => f.name && /^https:\/\/www\.g2b\.go\.kr\//.test(f.url));
  const groups = qual?.licenseGroups ?? [];
  const lic = groups.flat().map((r) => r.name).join(" ");
  return {
    no, ord: it.bidNtceOrd ?? "000", biz, kind: clean(it.bidNtceClsfc), title, agency: clean(it.ntceInsttNm) ?? "", refNo: clean(it.refNo),
    state: clean(it.ntceDivNm) ?? "등록공고",
    category: classify(title, lic, biz === "기타" ? "용역" : biz),
    postedAt: iso(it.nticeDt) ?? iso(it.rgstDt) ?? closeAt,
    beginAt: iso(it.bidBeginDt), closeAt, openAt: iso(it.opengDt), openPlace: clean(it.opengPlce),
    method: clean(it.bidMethdNm), contract: clean(it.cntrctMthdNm), award: clean(it.sucsfbidMthdNm), rebid: clean(it.rbidDivNm), qualification: clean(it.bidQlfctNm),
    regionLimit: clean(it.rgnLmtDivNm), regions, licenseGroups: groups,
    budget: num(it.asignBdgtAmt), refAmount: it.refAmtOpenYn === "Y" ? num(it.refAmt) : undefined,
    vat: clean(it.vatInclsnYnNm)?.replace(/\(.*$/, ""),
    briefingAt: iso(it.sptDscrptDt), briefingPlace: clean(it.sptDscrptPlce),
    detail: firstDetail(it.servcDtlList ?? it.cnstwkDtlList ?? it.prdctDtlList),
    apt: clean(it.aptHsmpNm) ? { name: clean(it.aptHsmpNm)!, households: num(it.aptHshldNum), buildings: num(it.aptCmplNum), area: num(it.aptTotar), heating: clean(it.aptHeatMethdNm) } : undefined,
    files,
  };
}

/* ---------- 개찰 결과 ---------- */

const RESULT_KEYS = ["bidNtceNo", "bidNtceOrd", "rbidNo", "bidClsfcNo", "bidNtceNm", "dminsttNm", "opengDt", "prtcptCnum", "progrsDivCdNm"];
const RANK_KEYS = ["opengRank", "prcbdrNm", "bidprcAmt", "bidprcrt", "rmrk", "opengRsltDivNm"];

async function ranksOf(r: Item, stats: { calls: number; failed: number; budget: number }): Promise<NuriResult["ranks"] | undefined> {
  const file = join(CACHE, "ranks", `${r.bidNtceNo}-${r.bidNtceOrd ?? "000"}-${r.rbidNo ?? "000"}.json`);
  let rows = readJson<Item[]>(file);
  if (!rows) {
    if (stats.budget <= 0) return undefined;
    stats.budget--;
    try {
      stats.calls++;
      rows = (await all(RES, "getPrvtOpengResultListInfoOpengCompt", { bidNtceNo: r.bidNtceNo!, bidNtceOrd: r.bidNtceOrd ?? "000", rbidNo: r.rbidNo ?? "000" })).map(pick(RANK_KEYS));
      writeJson(file, rows);
    } catch {
      stats.failed++;
      return undefined;
    }
  }
  return rows
    .map((x) => ({ rank: Number(x.opengRank) || 0, name: clean(x.prcbdrNm) ?? "", amount: num(x.bidprcAmt), rate: num(x.bidprcrt), note: clean(x.rmrk) }))
    .filter((x) => x.rank > 0 && x.name)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);
}

/* ---------- 계약 ---------- */

const CONTRACT_KEYS = ["untyCntrctNo", "bsnsDivNm", "cntrctNm", "cmmnCntrctYn", "cntrctCnclsDate", "cntrctPrd", "totCntrctAmt", "cntrctInsttNm", "corpList", "cntrctDtlInfoUrl", "rgstDt"];

/** "[1^구분^^업체명^대표자^국적^..^업체명^]" → 업체명만 (대표자 이름은 버린다) */
function corpsOf(s?: string): string[] {
  return [...new Set((s?.match(/\[[^\]]+\]/g) ?? []).map((p) => clean(p.slice(1, -1).split("^")[3]) ?? "").filter(Boolean))];
}

function toContract(it: Item): NuriContract | undefined {
  if (!it.untyCntrctNo || !it.cntrctNm) return undefined;
  return {
    no: it.untyCntrctNo, name: clean(it.cntrctNm)!, agency: clean(it.cntrctInsttNm) ?? "", biz: clean(it.bsnsDivNm),
    date: it.cntrctCnclsDate?.slice(0, 10) || it.rgstDt?.slice(0, 10), amount: num(it.totCntrctAmt), period: clean(it.cntrctPrd),
    corps: corpsOf(it.corpList), joint: it.cmmnCntrctYn === "Y" || undefined,
    link: /^https:\/\/www\.g2b\.go\.kr\//.test(it.cntrctDtlInfoUrl ?? "") ? it.cntrctDtlInfoUrl : undefined,
  };
}

/* ---------- 통계 ---------- */

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };

export function rateStats(results: NuriResult[]): NuriRateStat[] {
  const m = new Map<string, NuriResult[]>();
  for (const r of results) {
    const top = r.ranks[0];
    if (!r.biz || !r.award || !top?.rate || top.rate < 30 || top.rate > 130) continue;
    const k = `${r.biz}|${r.award}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return [...m.entries()].filter(([, xs]) => xs.length >= 5).map(([k, xs]) => {
    const [biz, award] = k.split("|") as [NuriBiz, string];
    const rates = xs.map((x) => x.ranks[0].rate!);
    const r1 = (n: number) => Math.round(n * 1000) / 1000;
    return { biz, award, n: xs.length, p25: r1(q(rates, 0.25)), p50: r1(q(rates, 0.5)), p75: r1(q(rates, 0.75)), bidders: Math.round((xs.reduce((a, x) => a + x.bidders, 0) / xs.length) * 10) / 10 };
  });
}

/* ---------- 전체 ---------- */

export async function fetchNuriBids(laws?: IndustryLawTable): Promise<{ file: NuriBidsFile; log: string; all: NuriResult[] }> {
  const st = { calls: 0, failed: 0 };
  const now = Date.now();

  // 1. 공고: 업무별로 최근 26주 (지난 공고는 개찰 결과의 업무·낙찰방법을 찾는 데 쓴다), 같은 공고번호는 최신 차수만, 취소공고·마감 지난 공고는 뺀다
  const rows: { it: Item; biz: NuriBiz }[] = [];
  for (const [biz, op] of OPS) for (const it of await byWeeks(BID, `getPrvtBidPblancListInfo${op}`, HISTORY_WEEKS, pick(NOTICE_KEYS), st)) rows.push({ it, biz });
  const latest = new Map<string, { it: Item; biz: NuriBiz }>();
  for (const r of rows) {
    const no = r.it.bidNtceNo;
    if (!no) continue;
    const prev = latest.get(no);
    if (!prev || (prev.it.bidNtceOrd ?? "") < (r.it.bidNtceOrd ?? "") || ((prev.it.bidNtceOrd ?? "") === (r.it.bidNtceOrd ?? "") && (prev.it.rgstDt ?? "") < (r.it.rgstDt ?? ""))) latest.set(no, r);
  }
  const open = [...latest.values()].filter((r) => r.it.ntceDivNm !== "취소공고" && !/취소\s*공고/.test(r.it.ntceNm ?? ""));

  // 2. 면허제한·참가가능지역 (최근 7주 등록분)
  // 실제 응답의 면허제한·지역 행에는 차수가 없어 공고번호로 묶고, 정정으로 다시 올라온 행이 있으면 가장 늦게 등록된 묶음만 쓴다
  const lic = await byWeeks(BID, "getPrvtBidPblancListInfoLicenseLimit", NOTICE_WEEKS, pick(["bidNtceNo", "bidNtceOrd", "lmtGrpNo", "lmtSno", "lcnsLmtNm", "permsnIndstrytyList", "rgstDt"]), st);
  const rgn = await byWeeks(BID, "getPrvtBidPblancListInfoPrtcptPsblRgn", NOTICE_WEEKS, pick(["bidNtceNo", "bidNtceOrd", "lmtSno", "prtcptPsblRgnNm", "rgstDt"]), st);
  const key = (it: Item) => it.bidNtceNo ?? "";
  const group = (xs: Item[]) => {
    const m = new Map<string, Item[]>();
    for (const x of xs) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
    for (const [k, v] of m) { const at = (x: Item) => (x.rgstDt ?? "").slice(0, 16); const last = v.reduce((a, x) => (at(x) > a ? at(x) : a), ""); m.set(k, v.filter((x) => at(x) === last)); }
    return m;
  };
  const licBy = group(lic), rgnBy = group(rgn);
  const quals: Record<string, BidQual> = {};
  for (const { it } of open) {
    const ls = licBy.get(key(it));
    quals[key(it)] = { licenseLimited: ls ? true : null, licenseGroups: ls ? groupLicenses(ls) : [], regionLimited: null, regions: [] };
  }
  if (laws) applyIndustryLaws(quals, laws);
  const items = open
    .map(({ it, biz }) => toBid(it, biz, quals[key(it)], [...new Set((rgnBy.get(key(it)) ?? []).map((r) => clean(r.prtcptPsblRgnNm) ?? "").filter(Boolean))]))
    .filter((b): b is NuriBid => !!b && new Date(b.closeAt).getTime() > now)
    .sort((a, b) => a.closeAt.localeCompare(b.closeAt));

  // 3. 개찰 결과 (최근 26주) + 개찰완료 공고의 순위. 공고 업무·낙찰방법은 공고 목록에서 찾는다
  const resRows = await byWeeks(RES, "getPrvtOpengResultListInfo", HISTORY_WEEKS, pick(RESULT_KEYS), st);
  // 공고의 기준금액(공개한 경우) 또는 배정예산: 누리장터 개찰 순위에 투찰률 값이 비어 있어(2026-11-25 실측 0건) 이 금액 대비로 투찰률을 낸다
  const noticeOf = new Map<string, { biz: NuriBiz; award?: string; base?: number }>();
  for (const r of rows) if (r.it.bidNtceNo) noticeOf.set(r.it.bidNtceNo, { biz: r.biz, award: clean(r.it.sucsfbidMthdNm), base: (r.it.refAmtOpenYn === "Y" ? num(r.it.refAmt) : undefined) ?? num(r.it.asignBdgtAmt) });
  const byRound = new Map<string, Item>();
  for (const r of resRows) { const k = `${r.bidNtceNo}-${r.bidNtceOrd}-${r.rbidNo}`; const p = byRound.get(k); if (!p || (p.opengDt ?? "") < (r.opengDt ?? "")) byRound.set(k, r); }
  const rk = { ...st, budget: RANK_BUDGET };
  const rounds = [...byRound.values()].sort((a, b) => (b.opengDt ?? "").localeCompare(a.opengDt ?? ""));
  const results = (await mapLimit(rounds, 4, async (r): Promise<NuriResult | undefined> => {
    const openedAt = iso(r.opengDt);
    if (!r.bidNtceNo || !openedAt) return undefined;
    const done = r.progrsDivCdNm === "개찰완료";
    const n = noticeOf.get(r.bidNtceNo);
    const base = n?.base && n.base > 0 ? n.base : undefined;
    const ranks = (done ? await ranksOf(r, rk) : [])?.map((x) => (x.rate || !x.amount || !base ? x : { ...x, rate: Math.round((x.amount / base) * 100000) / 1000, rateBy: "base" as const }));
    return { no: r.bidNtceNo, ord: r.bidNtceOrd ?? "000", title: clean(r.bidNtceNm) ?? "", agency: clean(r.dminsttNm) ?? "", openedAt, bidders: Number(r.prtcptCnum) || 0, state: clean(r.progrsDivCdNm) ?? "", biz: n?.biz, award: n?.award, base, ranks: ranks ?? [] };
  })).filter((x): x is NuriResult => !!x);
  st.calls = rk.calls; st.failed = rk.failed;

  // 4. 계약 (최근 26주)
  const conRows = await byWeeks(CON, "getPrvtCntrctInfoList", HISTORY_WEEKS, pick(CONTRACT_KEYS), st);
  const conBy = new Map<string, NuriContract>();
  for (const it of conRows) { const c = toContract(it); if (c) conBy.set(c.no, c); }
  const contracts = [...conBy.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // 진행 중 공고의 기관과 관계없는 결과·계약까지 다 보내면 파일이 커지므로, 진행 중 공고 기관 것과 최근 4주 것만 남긴다
  const keepResults = keepNuriResults(results, items, now);
  const agencies = new Set(items.map((b) => agencyKey(b.agency)));
  const recent = new Date(now - 28 * 864e5).toISOString().slice(0, 10);
  const keepContracts = contracts.filter((c) => agencies.has(agencyKey(c.agency)) || (c.date ?? "") >= recent);
  const rates = rateStats(results);
  const withRanks = results.filter((r) => r.ranks.length).length;
  const file: NuriBidsFile = { builtAt: new Date().toISOString(), items, results: keepResults, contracts: keepContracts, rates, from: `${weeks(HISTORY_WEEKS).at(-1)![0].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}` };
  const log = `누리장터: 진행 중 공고 ${items.length.toLocaleString()}건 (용역 ${items.filter((b) => b.biz === "용역").length}, 공사 ${items.filter((b) => b.biz === "공사").length}, 물품 ${items.filter((b) => b.biz === "물품").length}, 면허제한 ${items.filter((b) => b.licenseGroups.length).length}, 지역제한 ${items.filter((b) => b.regions.length).length}), 개찰 결과 ${results.length.toLocaleString()}건 중 순위 ${withRanks.toLocaleString()}건(남은 순위 조회 ${rk.budget <= 0 ? "다음 빌드" : "없음"}), 계약 ${contracts.length.toLocaleString()}건, 투찰률 통계 ${rates.length}개 [${rates.map((r) => `${r.biz}·${r.award} ${r.n}건 가운데 ${r.p50}%`).join(", ")}] · 보낸 결과 ${keepResults.length}·계약 ${keepContracts.length} · 호출 ${st.calls}회 실패 ${st.failed}`;
  return { file, log, all: results };
}

/** 화면 파일에 담는 개찰 결과: 지금 공고와 같은 기관의 것, 또는 최근 4주 */
export function keepNuriResults(results: NuriResult[], items: NuriBid[], now = Date.now()): NuriResult[] {
  const agencies = new Set(items.map((b) => agencyKey(b.agency)));
  const recent = new Date(now - 28 * 864e5).toISOString().slice(0, 10);
  return results.filter((r) => agencies.has(agencyKey(r.agency)) || r.openedAt.slice(0, 10) >= recent);
}
