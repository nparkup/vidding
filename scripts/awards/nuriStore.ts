/**
 * 누리장터 개찰 결과 누적 (R2 nuri/results.json.gz).
 * 누리장터 API는 한 번에 7일씩만 주고 빌드는 최근 26주만 다시 받으므로, 받은 결과를 저장소에 쌓아 26주보다 긴 기록으로
 * 1순위 투찰률 통계와 같은 기관의 지난 개찰을 만든다. Cloudflare 토큰이 없으면 아무것도 하지 않는다.
 */
import { gunzipSync, gzipSync } from "zlib";
import { keepNuriResults, rateStats } from "../../src/lib/nara/nuri";
import type { NuriBidsFile, NuriResult } from "../../src/lib/nuri";
import { r2Get, r2Put } from "./r2";

const KEY = "nuri/results.json.gz";
const canUse = () => !!process.env.R2_LOCAL_DIR || (!!process.env.CLOUDFLARE_API_TOKEN && !!process.env.CLOUDFLARE_ACCOUNT_ID);
/** 한 회차(공고번호·차수·개찰 일시) */
const roundKey = (r: NuriResult) => `${r.no}-${r.ord}-${r.openedAt.slice(0, 16)}`;

/** 이번 빌드의 결과를 저장소에 더하고, 쌓인 전체로 화면 파일의 통계·지난 개찰을 바꾼다. 돌려주는 값은 로그 한 줄 */
export async function accumulateNuriResults(file: NuriBidsFile, fresh: NuriResult[]): Promise<string> {
  if (!canUse()) return "누리장터 개찰 누적: 저장소 토큰이 없어 건너뜀";
  const buf = await r2Get(KEY);
  const prev: NuriResult[] = buf ? JSON.parse(gunzipSync(buf).toString()) : [];
  const m = new Map<string, NuriResult>();
  for (const r of prev) m.set(roundKey(r), r);
  let added = 0;
  for (const r of fresh) {
    const k = roundKey(r);
    const p = m.get(k);
    if (!p) added++;
    // 순위를 더 많이 받은 쪽을 남기고, 업무·낙찰방법은 아는 쪽 값을 쓴다
    const keep = !p || r.ranks.length >= p.ranks.length ? r : p;
    m.set(k, { ...keep, biz: keep.biz ?? p?.biz ?? r.biz, award: keep.award ?? p?.award ?? r.award });
  }
  const all = [...m.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  await r2Put(KEY, gzipSync(Buffer.from(JSON.stringify(all))), "application/gzip");
  file.rates = rateStats(all);
  file.results = keepNuriResults(all, file.items);
  const from = all.at(-1)?.openedAt.slice(0, 10);
  if (from && (!file.from || from < file.from)) file.from = from;
  return `누리장터 개찰 누적: 저장소 ${prev.length.toLocaleString()}건 + 새 회차 ${added.toLocaleString()}건 = ${all.length.toLocaleString()}건 (${from ?? "-"}부터), 투찰률 통계 ${file.rates.length}개`;
}
