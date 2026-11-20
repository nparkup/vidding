/**
 * 사이트 빌드(scripts/fetch-bids.ts)가 낙찰 저장소(R2)에서 읽는 것:
 * - 예상 최저 경쟁 투찰률 통계 (최근 1년 업무·계약방법·금액대·업종별 낙찰률 + 같은 수요기관의 과거 유사 공고)
 * - 지금 공고의 세부품명·중분류 (유사 실적 비교 기준. 조회 때 조달청 API를 부르지 않게 미리 붙인다)
 * Cloudflare 토큰이 없거나 저장소가 아직 비어 있으면 null 을 돌려주고, 빌드는 예전 방식으로 간다.
 */
import { gunzipSync } from "zlib";
import { OPS, addDays, kstNow, mondayOf, type AwardMeta } from "../../src/lib/awards/format";
import { similarity, titleKey, type PriorTarget } from "../../src/lib/nara/awardStats";
import type { AwardStats, PriorMatch, RateStat } from "../../src/lib/rivalRate";
import type { Bid } from "../../src/lib/types";
import { r2Get } from "./r2";
import { buildRateRows, type RateInput, type RateTable } from "../../src/lib/rateTable";
import { agencyBucket, analyzeBid, keywords, kwBucket, type AgencyIndexFile, type AwardAnalysis, type KwIndexFile, type KwLookup, type SimilarIndexFile } from "../../src/lib/awards/analysis";

const canUse = () => !!process.env.R2_LOCAL_DIR || (!!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID);

export async function awardMeta(): Promise<AwardMeta | null> {
  if (!canUse()) return null;
  const b = await r2Get("stats/meta.json");
  return b ? (JSON.parse(b.toString()) as AwardMeta) : null;
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
    const gz = await r2Get(`idx/agency/${k}.json.gz`).catch(() => null);
    const file = gz ? (JSON.parse(gunzipSync(gz).toString("utf8")) as AgencyIndexFile) : null;
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
