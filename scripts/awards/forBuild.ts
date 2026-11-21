/**
 * 사이트 빌드(scripts/fetch-bids.ts)가 낙찰 저장소(R2)에서 읽는 것:
 * - 예상 최저 경쟁 투찰률 통계 (최근 1년 업무·계약방법·금액대·업종별 낙찰률 + 같은 수요기관의 과거 유사 공고)
 * - 지금 공고의 세부품명·중분류 (유사 실적 비교 기준. 조회 때 조달청 API를 부르지 않게 미리 붙인다)
 * Cloudflare 토큰이 없거나 저장소가 아직 비어 있으면 null 을 돌려주고, 빌드는 예전 방식으로 간다.
 */
import { gunzipSync } from "zlib";
import { OPS, addDays, kstNow, mondayOf, type AwardBiz, type AwardMeta } from "../../src/lib/awards/format";
import { RECENT_AWARD_DAYS, RECENT_TOP, type RecentAwardRow, type RecentAwardsFile, type RecentTop } from "../../src/lib/recentAwards";
import { similarity, titleKey, type PriorTarget } from "../../src/lib/nara/awardStats";
import type { AwardStats, PriorMatch, RateStat } from "../../src/lib/rivalRate";
import type { Bid } from "../../src/lib/types";
import { r2Get } from "./r2";
import { buildRateRows, type RateInput, type RateTable } from "../../src/lib/rateTable";
import { agencySummary, type AgencySummary } from "../../src/lib/awards/agency";
import { agencyBucket, analyzeBid, keywords, kwBucket, type AgencyIndexFile, type AwardAnalysis, type KwIndexFile, type KwLookup, type SimilarIndexFile } from "../../src/lib/awards/analysis";

const canUse = () => !!process.env.R2_LOCAL_DIR || (!!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID);

export async function awardMeta(): Promise<AwardMeta | null> {
  if (!canUse()) return null;
  const b = await r2Get("stats/meta.json");
  return b ? (JSON.parse(b.toString()) as AwardMeta) : null;
}

/** 아파트(K-apt) 누적 공고·낙찰 건수 (scripts/awards/apt.ts 가 쓴다) */
export async function aptMeta(): Promise<{ notices: number; awards: number; noticeFrom: string; builtAt: string } | null> {
  if (!canUse()) return null;
  const b = await r2Get("stats/apt-meta.json");
  if (!b) return null;
  const m = JSON.parse(b.toString()) as { notices: number; awards: number; noticeFrom: string; builtAt: string };
  return { notices: m.notices, awards: m.awards, noticeFrom: m.noticeFrom, builtAt: m.builtAt };
}

/** 저장소에 최근 1년 낙찰이 다 있으면 통계를 만들고, 아니면 null */
export async function awardStatsFromR2(targets: PriorTarget[]): Promise<AwardStats | null> {
  const meta = await awardMeta();
  if (!meta || meta.weeks < 52) return null;
  const rates = await r2Get("stats/rates.json");
  const agencyGz = await r2Get("stats/agency.json.gz");
  if (!rates || !agencyGz) return null;
  const r = JSON.parse(rates.toString()) as { windows: Record<string, { from: string; strata: Record<string, RateStat> }> };
  const agency = JSON.parse(gunzipSync(agencyGz).toString("utf8")) as Record<string, [string, string, number, "Q" | "N", string][]>;

  // 지금 공고와 수요기관이 같고 공고명이 비슷한 과거 낙찰 공고 (저장 기간 전체) (비슷한 순, 같으면 최근 순)
  const prior: Record<string, PriorMatch[]> = {};
  const keyMemo = new Map<string, string>();
  const keyOf = (t: string) => keyMemo.get(t) ?? (keyMemo.set(t, titleKey(t)), keyMemo.get(t)!);
  for (const t of targets) {
    const pool = agency[t.demandAgency];
    if (!pool) continue;
    const key = titleKey(t.title);
    const hits = pool
      .filter(([no]) => no !== t.id.split("-")[0])
      .map((a) => ({ a, s: similarity(key, keyOf(a[1])) }))
      .filter((x) => x.s >= 0.6)
      .sort((x, y) => y.s - x.s || y.a[4].localeCompare(x.a[4]))
      .slice(0, 3)
      .map(({ a, s }): PriorMatch => ({ no: a[0], title: a[1], rate: a[2], method: a[3] === "N" ? "협상에 의한 계약" : "적격심사", similarity: Math.round(s * 100) / 100 }));
    if (hits.length) prior[t.id] = hits;
  }
  const weeks = Math.min(52, meta.weeks);
  return {
    year: kstNow().getUTCFullYear(),
    label: "최근 1년",
    coverage: { weeks, totalWeeks: 52, noticeDays: weeks * 7, totalNoticeDays: 364 },
    strata: r.windows["1y"]?.strata ?? {},
    prior,
    builtAt: new Date().toISOString(),
  };
}

/** 최근 weeks 주 공고 원자료에서 공고번호 → 분류. 저장소가 없으면 빈 맵 */
export async function recentNoticeClasses(weeks = 10): Promise<Map<string, NonNullable<Bid["cls"]>>> {
  const out = new Map<string, NonNullable<Bid["cls"]>>();
  if (!(await awardMeta())) return out;
  const cur = mondayOf(kstNow());
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(cur, -7 * i);
    for (const op of Object.values(OPS)) {
      const b = await r2Get(`raw/notice/${op}/${w}.json.gz`).catch(() => null);
      if (!b) continue;
      for (const r of JSON.parse(gunzipSync(b).toString("utf8")) as unknown[][]) {
        const [no, , , , clsNo, clsNm, mid, lrg, work] = r as string[];
        if (!clsNo && !mid && !work) continue;
        out.set(no, { no: clsNo || undefined, nm: clsNm || undefined, mid: mid || undefined, lrg: lrg || undefined, work: work || undefined });
      }
    }
  }
  return out;
}

/**
 * 지금 공고마다 낙찰 결과 분석 (전년도 같은 사업, 과거 같은 사업 추이, 비슷한 공고). src/lib/awards/analysis.ts
 * 색인(idx/)이 아직 없으면 null. 수요기관 색인은 지금 공고들의 수요기관이 들어 있는 파일만 받는다
 */
export async function awardAnalysesFromR2(items: Bid[]): Promise<Record<string, AwardAnalysis> | null> {
  if (!(await awardMeta())) return null;
  const simGz = await r2Get("idx/similar.json.gz");
  if (!simGz) return null;
  const similar = JSON.parse(gunzipSync(simGz).toString("utf8")) as SimilarIndexFile;
  const need = new Map<string, Bid[]>();
  for (const b of items) {
    const k = agencyBucket(b.demandAgency);
    (need.get(k) ?? need.set(k, []).get(k)!).push(b);
  }
  const range = { from: "", to: similar.to };
  // 공고명 핵심어 색인: 지금 공고들의 핵심어가 든 파일만 받는다 (색인이 아직 없으면 핵심어 비교 없이 간다)
  const kwFiles = new Map<string, KwIndexFile>();
  for (const k of new Set(items.flatMap((b) => keywords(b.title).map(kwBucket)))) {
    const gz = await r2Get(`idx/kw/${k}.json.gz`).catch(() => null);
    if (gz) kwFiles.set(k, JSON.parse(gunzipSync(gz).toString("utf8")) as KwIndexFile);
  }
  const anyKw = [...kwFiles.values()][0];
  const kw: KwLookup | undefined = anyKw ? { n: anyKw.n, get: (k) => kwFiles.get(kwBucket(k))?.kw[k] } : undefined;
  const out: Record<string, AwardAnalysis> = {};
  for (const [k, bids] of need) {
    const file = await agencyFile(k);
    for (const b of bids) {
      const rows = file?.agencies[b.demandAgency];
      if (rows?.length && (!range.from || rows[rows.length - 1][2] < range.from)) range.from = rows[rows.length - 1][2];
      out[b.id] = analyzeBid(b, rows, similar.groups, range, { kw });
    }
  }
  return out;
}

/**
 * 발주 기준·금액 구간별 낙찰하한율 집계 (기준표 화면). 최근 weeks 주 공고 원자료에서 공고번호마다 최신 차수만 센다.
 * 저장소가 없거나 비어 있으면 null (빌드는 진행 중 공고로 만든다)
 */
export async function rateTableFromR2(weeks = 26): Promise<RateTable | null> {
  if (!(await awardMeta())) return null;
  const cur = mondayOf(kstNow());
  const latest = new Map<string, { ord: string; input: RateInput }>();
  let from = "";
  let to = "";
  for (let i = weeks - 1; i >= 0; i--) {
    const w = addDays(cur, -7 * i);
    for (const [biz, op] of Object.entries(OPS) as [RateInput["biz"], string][]) {
      const b = await r2Get(`raw/notice/${op}/${w}.json.gz`).catch(() => null);
      if (!b) continue;
      if (!from) from = w;
      to = w;
      for (const r of JSON.parse(gunzipSync(b).toString("utf8")) as unknown[][]) {
        const [no, ord, method, price, , , , , , , , lwlt] = r as [string, string, string, number, ...unknown[]];
        const prev = latest.get(no);
        if (prev && prev.ord >= ord) continue;
        latest.set(no, { ord, input: { biz, method, presmpt: price || undefined, lwlt: (lwlt as number) || undefined } });
      }
    }
  }
  if (!latest.size) return null;
  const inputs = [...latest.values()].map((x) => x.input);
  return { builtAt: new Date().toISOString(), from, to, source: "낙찰 저장소", notices: inputs.filter((x) => (x.lwlt ?? 0) > 0).length, rows: buildRateRows(inputs) };
}

/** 수요기관 색인 파일 (빌드 한 번에 같은 파일을 두 번 받지 않게 기억한다) */
const agencyFiles = new Map<string, Promise<AgencyIndexFile | null>>();
function agencyFile(k: string): Promise<AgencyIndexFile | null> {
  let p = agencyFiles.get(k);
  if (!p) {
    p = r2Get(`idx/agency/${k}.json.gz`).catch(() => null).then((gz) => (gz ? (JSON.parse(gunzipSync(gz).toString("utf8")) as AgencyIndexFile) : null));
    agencyFiles.set(k, p);
  }
  return p;
}

/** 지금 공고의 수요기관마다 발주처 분석 (src/lib/awards/agency.ts). 키는 수요기관 이름. 색인이 없으면 null */
export async function agencySummariesFromR2(items: Bid[]): Promise<Record<string, AgencySummary> | null> {
  if (!(await awardMeta())) return null;
  const today = kstNow().toISOString().slice(0, 10);
  const names = [...new Set(items.map((b) => b.demandAgency).filter(Boolean))];
  const out: Record<string, AgencySummary> = {};
  for (const name of names) {
    const file = await agencyFile(agencyBucket(name));
    const rows = file?.agencies[name];
    const s = rows?.length ? agencySummary(name, rows, today) : undefined;
    if (s) out[name] = s;
  }
  return out;
}

/** R2 원자료 한 파일 (빌드 한 번에 같은 파일을 두 번 받지 않게 기억한다). 없으면 [] */
const rawMemo = new Map<string, Promise<unknown[][]>>();
function rawRows(key: string): Promise<unknown[][]> {
  let p = rawMemo.get(key);
  if (!p) {
    p = r2Get(key).catch(() => null).then((b) => (b ? (JSON.parse(gunzipSync(b).toString("utf8")) as unknown[][]) : []));
    rawMemo.set(key, p);
  }
  return p;
}

/**
 * 최근 낙찰 결과 목록 (/awards): 최근 RECENT_AWARD_DAYS일 최종낙찰분.
 * 낙찰 원자료에 같은 공고의 계약방법·낙찰하한율(공고), 기초금액, 예정가격, 개찰 순위 1~3위를 붙인다.
 * 공고·기초금액은 공고가 나온 주에 들어 있어 낙찰 주보다 NOTICE_WEEKS 주 앞까지 본다. 저장소가 없으면 null
 */
export async function recentAwardsFromR2(days = RECENT_AWARD_DAYS): Promise<RecentAwardsFile | null> {
  if (!(await awardMeta())) return null;
  const NOTICE_WEEKS = 10;
  const today = kstNow();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const cur = mondayOf(today);
  const awardWeeks: string[] = [];
  for (let w = cur; w >= mondayOf(new Date(Date.parse(from))); w = addDays(w, -7)) awardWeeks.push(w);
  const leadWeeks: string[] = [];
  for (let i = 0; i < awardWeeks.length + NOTICE_WEEKS; i++) leadWeeks.push(addDays(cur, -7 * i));

  const rows: RecentAwardRow[] = [];
  for (const [biz, op] of Object.entries(OPS) as [AwardBiz, string][]) {
    // 공고: 공고번호 → 마지막 차수의 계약방법·낙찰하한율
    const notice = new Map<string, { ord: string; method: string; lwlt: number }>();
    const base = new Map<string, { ord: string; amt: number }>();
    const plan = new Map<string, { ord: string; plnprc: number; base: number }>();
    const keep = <T extends { ord: string }>(m: Map<string, T>, k: string, v: T) => { const p = m.get(k); if (!p || p.ord <= v.ord) m.set(k, v); };
    for (const w of leadWeeks) {
      for (const r of await rawRows(`raw/notice/${op}/${w}.json.gz`)) {
        const [no, ord, method, , , , , , , , , lwlt] = r as [string, string, string, number, string, string, string, string, string, string, string, number?];
        keep(notice, no, { ord, method: method ?? "", lwlt: lwlt || 0 });
      }
      for (const r of await rawRows(`raw/base/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, amt] = r as [string, string, string, number];
        keep(base, `${no}|${clsfc}`, { ord, amt });
        keep(base, no, { ord, amt });
      }
      for (const r of await rawRows(`raw/plan/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, rbid, plnprc, bssamt] = r as [string, string, string, string, number, number];
        keep(plan, `${no}|${clsfc}|${rbid}`, { ord, plnprc, base: bssamt });
        keep(plan, `${no}|${clsfc}`, { ord, plnprc, base: bssamt });
      }
    }
    const seen = new Set<string>();
    for (const w of awardWeeks) {
      const top = new Map<string, RecentTop[]>();
      for (const [no, ord, list] of (await rawRows(`raw/rank/${op}/${w}.json.gz`)) as [string, string, [string, string, number, string, string, number, number][]][]) {
        for (const [clsfc, rbid, rank, , name, amt, rt] of list) {
          if (rank > RECENT_TOP) continue;
          const k = `${no}|${ord}|${clsfc}|${rbid}`;
          (top.get(k) ?? top.set(k, []).get(k)!).push([rank, name, amt, rt]);
        }
      }
      for (const r of await rawRows(`raw/award/${op}/${w}.json.gz`)) {
        const [no, ord, clsfc, rbid, title, bidders, winner, bizno, amount, rate, agency, date] =
          r as [string, string, string, string, string, number, string, string, number, number, string, string];
        if (!date || date < from || date > to || !winner) continue;
        const id = `${no}-${ord}-${clsfc}-${rbid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const nt = notice.get(no);
        const pl = plan.get(`${no}|${clsfc}|${rbid}`) ?? plan.get(`${no}|${clsfc}`);
        const bs = base.get(`${no}|${clsfc}`)?.amt || pl?.base || base.get(no)?.amt || 0;
        rows.push([
          no, ord, biz, title, agency, date, bidders || 0, winner, bizno, amount || 0, rate || 0, bs, pl?.plnprc || 0,
          nt?.method ?? "", nt?.lwlt || 0,
          (top.get(`${no}|${ord}|${clsfc}|${rbid || "000"}`) ?? []).sort((a, b) => a[0] - b[0]),
        ]);
      }
    }
  }
  rows.sort((a, b) => b[5].localeCompare(a[5]) || b[9] - a[9]);
  return { from, to, builtAt: new Date().toISOString(), rows };
}
