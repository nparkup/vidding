import "server-only";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { call, mapLimit, recentDays } from "./client";
import type { BidAttachment } from "../types";

/**
 * 사전규격 규격서 목록 (공고 첨부 보강용).
 * 조달청 공고 가운데에는 제안요청서·평가기준을 사전규격에만 올리고 본공고에는 공고서만 붙인 공고가 있다
 * (2026-11-24 표본 42건 중 협상 2건: 본공고 첨부에는 배점표가 없고 사전규격 제안요청서에만 있었다).
 * 본공고 목록의 사전규격 번호(bfSpecRgstNo)로 이어 붙이도록, 사전규격 목록을 등록일별로 받아 번호 → 규격서 주소로 묶는다.
 * 지난 날짜는 캐시에 두고(사전규격 규격서는 공개 뒤 바뀌지 않는다) 최근 며칠만 새로 받는다.
 */

const PATH = "/ao/HrcspSsstndrdInfoService";
const OPS = ["getPublicPrcureThngInfoServc", "getPublicPrcureThngInfoCnstwk", "getPublicPrcureThngInfoThng"];
/** 본공고 수집 기간(60일)보다 길게: 사전규격은 보통 본공고 몇 주 전에 올라온다 */
export const PRESPEC_FILE_DAYS = 120;
const FRESH_DAYS = 3;
const ROWS = 999;

type Row = { no: string; urls: string[] };

async function fetchDay(op: string, day: string): Promise<Row[]> {
  const params = { inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359`, numOfRows: String(ROWS) };
  const first = await call(PATH, op, { ...params, pageNo: "1" });
  const items = [...first.items];
  for (let p = 2; p <= Math.ceil(first.total / ROWS); p++) items.push(...(await call(PATH, op, { ...params, pageNo: String(p) })).items);
  return items.flatMap((it) => {
    const no = (it.bfSpecRgstNo ?? "").trim();
    const urls = [1, 2, 3, 4, 5].map((i) => (it[`specDocFileUrl${i}`] ?? "").trim()).filter((u) => /^https:\/\/www\.g2b\.go\.kr\//.test(u));
    return no && urls.length ? [{ no, urls }] : [];
  });
}

/** 사전규격 번호 → 규격서 주소. 실패한 날짜는 빠진다 (그 공고는 본공고 첨부만 읽는다) */
export async function fetchPreSpecFileIndex(opts: { days?: number; cacheDir?: string } = {}): Promise<{ index: Map<string, string[]>; fetched: number; failed: number }> {
  const days = recentDays(opts.days ?? PRESPEC_FILE_DAYS);
  if (opts.cacheDir) mkdirSync(opts.cacheDir, { recursive: true });
  const index = new Map<string, string[]>();
  let fetched = 0, failed = 0;
  const jobs = days.flatMap((d, i) => OPS.map((op) => ({ d, op, fresh: i < FRESH_DAYS })));
  await mapLimit(jobs, 4, async ({ d, op, fresh }) => {
    const file = opts.cacheDir ? join(opts.cacheDir, `${op}-${d}.json`) : "";
    let rows: Row[] | undefined;
    if (file && !fresh && existsSync(file)) {
      try { rows = JSON.parse(readFileSync(file, "utf8")); } catch { rows = undefined; }
    }
    if (!rows) {
      try {
        rows = await fetchDay(op, d);
        fetched++;
        if (file && !fresh) writeFileSync(file, JSON.stringify(rows));
      } catch {
        failed++;
        return;
      }
    }
    // 같은 번호가 여러 날 나오면(변경 등록) 뒤 날짜 것을 쓴다: days 는 최근부터라 처음 넣은 것을 둔다
    for (const r of rows) if (!index.has(r.no)) index.set(r.no, r.urls);
  });
  if (opts.cacheDir) {
    const keep = new Set(jobs.map((j) => `${j.op}-${j.d}.json`));
    for (const f of readdirSync(opts.cacheDir)) if (!keep.has(f)) rmSync(join(opts.cacheDir, f), { force: true });
  }
  return { index, fetched, failed };
}

/** 공고 첨부 목록 뒤에 그 공고의 사전규격 규격서를 붙인다. 이름은 받을 때 알 수 있어 '사전규격 규격서 N' 으로 둔다 */
export function preSpecAttachments(no: string | undefined, index: Map<string, string[]>): BidAttachment[] {
  const urls = no ? index.get(no.trim()) : undefined;
  return (urls ?? []).map((url, i) => ({ name: `사전규격 규격서 ${i + 1}`, url, kind: "사전규격" as const }));
}
