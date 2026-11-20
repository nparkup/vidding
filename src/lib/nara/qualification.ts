import "server-only";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { call, COLLECT_DAYS, mapLimit, recentDays } from "./client";
import { NARA_APIS } from "./endpoints";
import type { BidQual, LicenseReq } from "../eligibility";
import { evalBasisOf } from "../criteria";
import { baseAmountOf, noticeInfoOf } from "../noticeInfo";

/**
 * 공고별 입찰 참가자격 자료 (업종 제한·참가지역 제한) 수집.
 * 입찰공고정보서비스의 면허제한(getBidPblancListInfoLicenseLimit02)·참가가능지역(getBidPblancListInfoPrtcptPsblRgn02)을
 * 등록일 기준 하루 단위로 한꺼번에 받고, 목록 원본의 업종제한 여부·지역제한 판단 기준·자격 등록 마감을 합친다.
 * 지난 날짜의 응답은 바뀌지 않으므로 캐시에 두고 다음 빌드가 다시 받지 않는다.
 */

const BID = NARA_APIS.find((a) => a.key === "bidPublic")!;
const OPS = BID.operations as Record<string, string>;
const ROWS = 999;
/** 오늘 포함 이 기간 안의 날짜는 정정공고가 붙을 수 있어 매번 새로 받는다 */
const FRESH_DAYS = 3;

type Item = Record<string, string | undefined>;

const idOf = (it: Item) => `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;

/** "[고압가스특정제조/1473],[가스도매사업/4601]" 또는 "토목공사업/0001" → { name, code } */
export function parseLicense(s: string): { name: string; code: string } {
  const t = s.replace(/^\[|\]$/g, "").trim();
  const m = t.match(/^(.*)\/(\d{4})$/);
  return m ? { name: m[1].trim(), code: m[2] } : { name: t, code: "" };
}

export function parseAllowed(s?: string): { name: string; code: string }[] {
  if (!s?.trim()) return [];
  return (s.match(/\[[^\]]+\]/g) ?? []).map(parseLicense).filter((x) => x.name || x.code);
}

/** 면허제한 행 → 그룹 (같은 lmtGrpNo 는 '모두', 그룹끼리는 '또는'). 같은 업종이 한 그룹에 두 번 오면 하나로 */
export function groupLicenses(rows: Item[]): LicenseReq[][] {
  const groups = new Map<string, Map<string, LicenseReq>>();
  const sorted = [...rows].sort((a, b) => Number(a.lmtGrpNo ?? 0) - Number(b.lmtGrpNo ?? 0) || Number(a.lmtSno ?? 0) - Number(b.lmtSno ?? 0));
  for (const r of sorted) {
    if (!r.lcnsLmtNm?.trim()) continue;
    const g = groups.get(r.lmtGrpNo ?? "1") ?? new Map<string, LicenseReq>();
    const lic = parseLicense(r.lcnsLmtNm);
    const key = lic.code || lic.name;
    const prev = g.get(key);
    const alt = parseAllowed(r.permsnIndstrytyList);
    if (prev) for (const a of alt) { if (!prev.alt.some((x) => x.code === a.code)) prev.alt.push(a); }
    else g.set(key, { ...lic, alt });
    groups.set(r.lmtGrpNo ?? "1", g);
  }
  return [...groups.values()].map((g) => [...g.values()]).filter((g) => g.length);
}

/** 용역·공사·물품별 기초금액 오퍼레이션 */
const BASE_OPS = ["getBidPblancListInfoServcBsisAmount02", "getBidPblancListInfoCnstwkBsisAmount02", "getBidPblancListInfoThngBsisAmount02"];
const baseOpOf = (bizType: string) => BASE_OPS[bizType === "공사" ? 1 : bizType === "물품" ? 2 : 0];

/** 목록 원본 + 면허제한 행 + 지역 행 (+ 기초금액 행) → BidQual. 자료를 못 받은 쪽은 null(모름) */
export function buildQual(it: Item, licRows: Item[] | null, rgnRows: Item[] | null, baseRows: Item[] = []): BidQual {
  const groups = licRows ? groupLicenses(licRows) : [];
  // 용역·공사는 목록에 업종제한 여부(Y/N)가 있다. 물품은 비어 있어 면허제한 행이 있는지로 본다
  const flag = it.indstrytyLmtYn;
  const licenseLimited = flag === "Y" ? (licRows === null ? null : true) : flag === "N" && !groups.length ? false : licRows === null ? null : groups.length > 0;
  const regions = rgnRows ? [...new Set(rgnRows.map((r) => r.prtcptPsblRgnNm?.trim() ?? "").filter(Boolean))] : [];
  return {
    licenseLimited,
    licenseGroups: groups,
    regionLimited: rgnRows === null ? null : regions.length > 0,
    regions,
    regionBasis: it.rgnLmtBidLocplcJdgmBssNm?.trim() || undefined,
    registerBy: it.bidQlfctRgstDt?.trim() || undefined,
    basis: evalBasisOf(it),
    info: withBase(noticeInfoOf(it), baseRows),
  };
}

function withBase(info: ReturnType<typeof noticeInfoOf>, rows: Item[]) {
  const b = baseAmountOf(rows);
  return b ? { ...info, ...b } : info;
}

async function fetchDay(op: string, day: string): Promise<Item[]> {
  const params = { inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359`, numOfRows: String(ROWS) };
  const first = await call(BID.path, op, { ...params, pageNo: "1" });
  const items = [...first.items];
  const pages = Math.ceil(first.total / ROWS);
  for (let p = 2; p <= pages; p++) items.push(...(await call(BID.path, op, { ...params, pageNo: String(p) })).items);
  return items;
}

/** 필요한 필드만 남겨 캐시 크기를 줄인다 */
const KEEP = ["bidNtceNo", "bidNtceOrd", "lmtGrpNo", "lmtSno", "lcnsLmtNm", "permsnIndstrytyList", "prtcptPsblRgnNm", "bidClsfcNo", "bssamt", "rsrvtnPrceRngBgnRate", "rsrvtnPrceRngEndRate",
  // 공사 A값 (투찰금액 계산에서 깎지 않는 금액)
  "bidPrceCalclAYn", "mrfnHealthInsrprm", "npnInsrprm", "odsnLngtrmrcprInsrprm", "rtrfundNon", "sftyMngcst", "sftyChckMngcst", "qltyMngcst", "qltyMngcstAObjYn"];
const slim = (it: Item): Item => Object.fromEntries(KEEP.filter((k) => it[k]).map((k) => [k, it[k]]));

/**
 * 최근 N일 등록분의 면허제한·참가가능지역 행을 날짜별로 받아 공고 id → 행 목록으로 묶는다.
 * 실패한 날짜는 failedDays 에 남겨, 그날 등록된 공고는 '모름'으로 처리한다.
 */
async function collectRows(op: string, days: string[], cacheDir?: string): Promise<{ rows: Map<string, Item[]>; failedDays: Set<string>; fetched: number }> {
  const rows = new Map<string, Item[]>();
  const failedDays = new Set<string>();
  let fetched = 0;
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  await mapLimit(days.map((d, i) => ({ d, fresh: i < FRESH_DAYS })), 4, async ({ d, fresh }) => {
    const file = cacheDir ? join(cacheDir, `${op}-${d}.json`) : "";
    let items: Item[] | undefined;
    if (file && !fresh && existsSync(file)) {
      try { items = JSON.parse(readFileSync(file, "utf8")); } catch { items = undefined; }
    }
    if (!items) {
      try {
        items = (await fetchDay(op, d)).map(slim);
        fetched++;
        if (file && !fresh) writeFileSync(file, JSON.stringify(items));
      } catch {
        failedDays.add(d);
        return;
      }
    }
    for (const it of items) {
      const id = idOf(it);
      const list = rows.get(id) ?? [];
      list.push(it);
      rows.set(id, list);
    }
  });
  // 수집 기간에서 벗어난 날짜의 캐시는 지운다 (캐시가 끝없이 커지지 않게)
  if (cacheDir) {
    const keep = new Set(days.map((d) => `${op}-${d}.json`));
    for (const f of readdirSync(cacheDir)) if (!keep.has(f)) rmSync(join(cacheDir, f), { force: true });
  }
  return { rows, failedDays, fetched };
}

/**
 * 정적 빌드용: 공고 목록 원본(입찰공고정보서비스 용역·공사·물품 목록)을 받아 공고별 참가자격 자료를 만든다.
 * listItems: id → { item, day } (첨부파일 수집 때 함께 받은 목록 원본과 그 조회 날짜)
 */
export async function fetchQualBulk(
  listItems: Map<string, { item: Item; day: string }>,
  opts: { days?: number; cacheDir?: string } = {},
): Promise<{ quals: Record<string, BidQual>; stats: { bids: number; licenseLimited: number; regionLimited: number; unknown: number; withBase: number; fetched: number; failedDays: number; baseFailedDays: number } }> {
  const days = recentDays(opts.days ?? COLLECT_DAYS);
  const [lic, rgn] = await Promise.all([
    collectRows(OPS.license, days, opts.cacheDir && join(opts.cacheDir, "license")),
    collectRows(OPS.region, days, opts.cacheDir && join(opts.cacheDir, "region")),
  ]);
  // 기초금액은 공고 뒤에 따로 공개되고 바뀔 수 있어 캐시하지 않고 매번 받는다 (하루 용역·공사·물품 각 1~2쪽). 실패한 날은 기초금액만 빠진다
  const bases = await Promise.all(BASE_OPS.map((op) => collectRows(op, days)));
  // 공고번호 → [차수, 행] (정정공고로 차수가 올라가기 전에 공개된 기초금액도 찾도록)
  const baseByNo = new Map<string, [string, Item[]][]>();
  for (const b of bases) for (const [id, rows] of b.rows) {
    const [no, ord = "000"] = id.split("-");
    (baseByNo.get(no) ?? baseByNo.set(no, []).get(no)!).push([ord, rows]);
  }
  const baseRows = (id: string): Item[] => {
    const [no, ord = "000"] = id.split("-");
    const cand = (baseByNo.get(no) ?? []).filter(([o]) => o <= ord).sort(([a], [c]) => c.localeCompare(a));
    return cand[0]?.[1] ?? [];
  };
  const quals: Record<string, BidQual> = {};
  const stats = { bids: 0, licenseLimited: 0, regionLimited: 0, unknown: 0, withBase: 0, fetched: lic.fetched + rgn.fetched, failedDays: lic.failedDays.size + rgn.failedDays.size, baseFailedDays: bases.reduce((a, b) => a + b.failedDays.size, 0) };
  for (const [id, { item, day }] of listItems) {
    const q = buildQual(
      item,
      lic.rows.get(id) ?? (lic.failedDays.has(day) ? null : []),
      rgn.rows.get(id) ?? (rgn.failedDays.has(day) ? null : []),
      baseRows(id),
    );
    quals[id] = q;
    stats.bids++;
    if (q.licenseLimited) stats.licenseLimited++;
    if (q.regionLimited) stats.regionLimited++;
    if (q.licenseLimited === null || q.regionLimited === null) stats.unknown++;
    if (q.info?.base) stats.withBase++;
  }
  return { quals, stats };
}

/** 서버 배포용: 공고 한 건의 참가자격 자료를 바로 조회한다 (공고번호·차수로 조회, inqryDiv=2) */
export async function bidQualification(bidNtceNo: string, bidNtceOrd = "000", bizType = "용역"): Promise<BidQual | undefined> {
  const listOp = bizType === "공사" ? OPS.constructionList : bizType === "물품" ? OPS.goodsList : OPS.serviceList;
  const byNo = { inqryDiv: "2", bidNtceNo, bidNtceOrd, numOfRows: "100" };
  const [list, lic, rgn, base] = await Promise.all([
    call(BID.path, listOp, { inqryDiv: "2", bidNtceNo, numOfRows: "10" }),
    call(BID.path, OPS.license, byNo).catch(() => null),
    call(BID.path, OPS.region, byNo).catch(() => null),
    call(BID.path, baseOpOf(bizType), byNo).catch(() => null),
  ]);
  const it = list.items.find((i) => (i.bidNtceOrd ?? "000") === bidNtceOrd);
  if (!it) return undefined;
  const same = (rows: Item[]) => rows.filter((r) => r.bidNtceNo === bidNtceNo && (r.bidNtceOrd ?? "000") === bidNtceOrd);
  return buildQual(it, lic ? same(lic.items) : null, rgn ? same(rgn.items) : null, base ? same(base.items) : []);
}
