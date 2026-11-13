import "server-only";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { call } from "./client";
import { BANDS, bandOf, statKey, type AwardStats, type PriorMatch, type RateStat, type StatBiz, type StatMethod } from "../rivalRate";
import type { Bid } from "../types";

export type PriorTarget = Pick<Bid, "id" | "title" | "demandAgency" | "bizType">;

/**
 * 전년도 낙찰률 통계 (평가점수 예측의 '예상 최저 경쟁 투찰률' 기본값).
 *
 * - 낙찰률: 낙찰정보서비스 getScsbidListSttus{Servc,Cnstwk,Thng} (공고 1건당 1행, 조회 기간 최대 7일) → 공고번호·낙찰률
 * - 계약방법·추정가격: 입찰공고정보서비스 getBidPblancListInfo{Servc,Cnstwk,Thng}02 (하루치 한 번) → 공고번호로 붙인다
 *   낙찰 응답에는 계약방법이 없어 공고 목록과 맞춰야 적격심사·협상계약을 나눌 수 있다.
 * - 지금 공고마다 같은 수요기관의 전년도 유사 공고(이름이 비슷한 공고)를 찾아 그 낙찰률을 따로 둔다.
 *   검색 API는 한 번에 7일까지만 조회돼 공고 하나의 전년도 공고를 찾는 데도 약 52회가 들어,
 *   공고마다 따로 찾지 않고 한 번 받아 둔 1년치 공고 목록에서 찾는다.
 * - 전년도 자료는 바뀌지 않으므로 받은 날·주는 캐시 폴더에 두고 다시 받지 않는다(GitHub Actions 캐시로 빌드 간 유지).
 *   빌드 한 번에 부르는 횟수를 제한해 하루 호출 한도를 넘지 않게 하고, 며칠에 걸쳐 1년치를 채운다.
 */

const OPS: Record<StatBiz, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };
const ROWS = 999;

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

function methodOf(name?: string): StatMethod | undefined {
  if (!name) return undefined;
  if (/협상/.test(name)) return "협상에 의한 계약";
  if (/적격/.test(name)) return "적격심사";
  return undefined;
}

/** 전년도 1월 1일부터 7일씩 (마지막 주는 12월 31일까지) */
function weeksOf(year: number) {
  const out: { from: string; to: string }[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 7 * 86400e3)) {
    const end = new Date(Math.min(d.getTime() + 6 * 86400e3, Date.UTC(year, 11, 31)));
    out.push({ from: ymd(d), to: ymd(end) });
  }
  return out;
}

/** 공고는 낙찰보다 먼저 나오므로 전년도 직전 31일부터 받는다 */
function noticeDays(year: number) {
  const out: string[] = [];
  for (let d = new Date(Date.UTC(year, 0, 1) - 31 * 86400e3); d.getUTCFullYear() <= year; d = new Date(d.getTime() + 86400e3)) out.push(ymd(d));
  return out;
}

async function allPages(path: string, op: string, params: Record<string, string>) {
  const first = await call(path, op, { ...params, numOfRows: String(ROWS), pageNo: "1" });
  const items = [...first.items];
  for (let p = 2; p <= Math.ceil(first.total / ROWS); p++) items.push(...(await call(path, op, { ...params, numOfRows: String(ROWS), pageNo: String(p) })).items);
  return { items, calls: Math.max(1, Math.ceil(first.total / ROWS)) };
}

export async function buildAwardStats(cacheDir: string, opts: { maxCalls?: number; maxMs?: number; now?: Date; targets?: PriorTarget[] } = {}): Promise<{ stats: AwardStats; fetched: number; stopped?: string }> {
  const now = opts.now ?? new Date(Date.now() + 9 * 3600e3);
  const year = now.getUTCFullYear() - 1;
  const dir = join(cacheDir, String(year));
  mkdirSync(dir, { recursive: true });
  const budget = opts.maxCalls ?? 300;
  let fetched = 0;
  let stopped: string | undefined;

  // 받을 목록: 최근 주부터 거꾸로, 업무마다 그 주의 낙찰과 같은 주의 공고 날을 함께 넣는다.
  // 공고는 낙찰보다 1~4주 앞서므로 거꾸로 채우면 쌓이는 대로 바로 맞춰진다. 중간에 끊겨도 다음 빌드가 이어 받는다
  const jobs: { file: string; run: () => Promise<{ data: unknown; calls: number }> }[] = [];
  const awardJob = (op: string, w: { from: string; to: string }) => ({
    file: `award-${op}-${w.from}.json`,
    run: async () => {
      const r = await allPages("/as/ScsbidInfoService", `getScsbidListSttus${op}`, { inqryDiv: "1", inqryBgnDt: `${w.from}0000`, inqryEndDt: `${w.to}2359` });
      return { data: r.items.map((i) => [i.bidNtceNo, Number(i.sucsfbidRate) || 0]).filter((x) => x[1]), calls: r.calls };
    },
  });
  const noticeJob = (op: string, day: string) => ({
    file: `notice-${op}-${day}.json`,
    run: async () => {
      const r = await allPages("/ad/BidPublicInfoService02", `getBidPblancListInfo${op}02`, { inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359` });
      const rows = r.items.map((i) => { const m = methodOf(i.sucsfbidMthdNm); return [i.bidNtceNo, m === "협상에 의한 계약" ? "N" : m === "적격심사" ? "Q" : "", Number(i.presmptPrce) || 0, i.dminsttNm ?? "", i.bidNtceNm ?? ""]; });
      return { data: rows.filter((x) => x[1]), calls: r.calls };
    },
  });
  const days = noticeDays(year);
  for (const w of [...weeksOf(year)].reverse()) {
    for (const op of Object.values(OPS)) {
      jobs.push(awardJob(op, w));
      for (const d of days.filter((d) => d >= w.from && d <= w.to)) jobs.push(noticeJob(op, d));
    }
  }
  for (const d of days.filter((d) => d < `${year}0101`).reverse()) for (const op of Object.values(OPS)) jobs.push(noticeJob(op, d));

  // 동시에 4개씩 (공공데이터포털 초당 제한 안쪽), 호출 수·시간 한도 안에서
  const deadline = Date.now() + (opts.maxMs ?? 4 * 60_000);
  const todo = jobs.filter((j) => !existsSync(join(dir, j.file)));
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < todo.length && !stopped && fetched < budget && Date.now() < deadline) {
      const job = todo[next++];
      try {
        const { data, calls } = await job.run();
        fetched += calls;
        writeFileSync(join(dir, job.file), JSON.stringify(data));
      } catch (e) {
        // 하루 한도 초과·인증 오류면 이번 빌드는 여기까지 (받은 것은 남는다)
        stopped = e instanceof Error ? e.message : String(e);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }));

  return { stats: aggregate(dir, year, opts.targets), fetched, stopped };
}

/** 캐시 폴더의 공고·낙찰 자료를 공고번호로 맞춰 업무·계약방법·금액대별 낙찰률 통계를 만든다 */
export function aggregate(dir: string, year: number, targets: PriorTarget[] = []): AwardStats {
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const groups = new Map<string, number[]>();
  const add = (k: string, r: number) => { const a = groups.get(k) ?? []; a.push(r); groups.set(k, a); };
  const cover: { weeks: number; days: number }[] = [];
  const prior: Record<string, PriorMatch[]> = {};

  for (const [biz, op] of Object.entries(OPS) as [StatBiz, string][]) {
    const notices = new Map<string, { m: StatMethod; p: number; org: string; title: string }>();
    for (const f of files.filter((f) => f.startsWith(`notice-${op}-`))) {
      for (const [no, m, p, org = "", title = ""] of JSON.parse(readFileSync(join(dir, f), "utf8")) as [string, string, number, string?, string?][]) {
        notices.set(no, { m: m === "N" ? "협상에 의한 계약" : "적격심사", p, org, title });
      }
    }
    const seen = new Set<string>();
    const awardedByOrg = new Map<string, { no: string; title: string; rate: number; method: StatMethod; key: string }[]>();
    const awardFiles = files.filter((f) => f.startsWith(`award-${op}-`));
    cover.push({ weeks: awardFiles.length, days: files.filter((f) => f.startsWith(`notice-${op}-`)).length });
    for (const f of awardFiles) {
      for (const [no, rate] of JSON.parse(readFileSync(join(dir, f), "utf8")) as [string, number][]) {
        const n = notices.get(no);
        if (!n || seen.has(no) || !(rate > 50 && rate <= 110)) continue;
        seen.add(no);
        add(statKey(biz, n.m, bandOf(n.p)), rate);
        add(statKey(biz, n.m, "*"), rate);
        if (n.org) {
          const a = awardedByOrg.get(n.org) ?? [];
          a.push({ no, title: n.title, rate, method: n.m, key: titleKey(n.title) });
          awardedByOrg.set(n.org, a);
        }
      }
    }
    // 지금 공고와 수요기관이 같고 공고명이 비슷한 전년도 낙찰 공고
    for (const t of targets) {
      if ((t.bizType === "공사" || t.bizType === "물품" ? t.bizType : "용역") !== biz) continue;
      const pool = awardedByOrg.get(t.demandAgency);
      if (!pool) continue;
      const key = titleKey(t.title);
      const hits = pool
        .map((a) => ({ a, s: similarity(key, a.key) }))
        .filter((x) => x.s >= SIMILAR)
        .sort((x, y) => y.s - x.s)
        .slice(0, 3)
        .map(({ a, s }) => ({ no: a.no, title: a.title, rate: a.rate, method: a.method, similarity: Math.round(s * 100) / 100 }));
      if (hits.length) prior[t.id] = hits;
    }
  }

  const strata: Record<string, RateStat> = {};
  for (const [k, rates] of groups) {
    const s = [...rates].sort((a, b) => a - b);
    const mid = s.length / 2;
    strata[k] = {
      n: s.length,
      mean: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 1000) / 1000,
      median: Math.round((s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2) * 1000) / 1000,
    };
  }
  return { year, coverage: {
      weeks: Math.min(...cover.map((c) => c.weeks)),
      totalWeeks: weeksOf(year).length,
      noticeDays: Math.min(...cover.map((c) => c.days)),
      totalNoticeDays: noticeDays(year).length,
    }, strata, prior, builtAt: new Date().toISOString() };
}

/** 공고명 비교용: 연도·차수·괄호 기호·공백을 빼서 해마다 반복되는 같은 사업이 같은 이름이 되게 한다 */
export function titleKey(title: string) {
  return title
    .replace(/(19|20)\d{2}\s*(년도|년)?/g, "")
    .replace(/\d{2}\s*(년도|년)/g, "")
    .replace(/제?\d+\s*(차|회|분기)/g, "")
    .replace(/[\s()\[\]{}<>「」『』【】〔〕·,.\-_/'"‘’“”]/g, "");
}

/** 공고명 유사도: 두 글자 묶음(bigram)의 Dice 계수, 0~1 */
export function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b);
  let common = 0;
  for (const [g, c] of ga) common += Math.min(c, gb.get(g) ?? 0);
  return (2 * common) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}

/** 이 이상 비슷해야 같은 사업의 전년도 공고로 본다 */
const SIMILAR = 0.6;

export const BAND_LABELS = Object.fromEntries(BANDS.map((b) => [b.key, b.label]));
