/**
 * (임시) 참가자격 표본: 최근 공고 중 업종 제한이 없는 무작위 1000건의 공고서 본문을 받아 저장한다.
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/qual-sample.ts 20261118,20261119 300
 */
import { mkdirSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";
import type { BidAttachment } from "../../src/lib/types";
import { download, rankFiles, textOf } from "../../src/lib/nara/attachText";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const OPS: Record<string, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };
const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02";

async function list(op: string, day: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let p = 1; p < 15; p++) {
    let j: { response?: { body?: { items?: Item[]; totalCount?: string } } } = {};
    for (let t = 0; t < 4; t++) {
      try { j = await (await fetch(`${BASE}/getBidPblancListInfo${op}02?serviceKey=${KEY}&type=json&numOfRows=999&pageNo=${p}&inqryDiv=1&inqryBgnDt=${day}0000&inqryEndDt=${day}2359`, { signal: AbortSignal.timeout(90_000) })).json(); break; }
      catch { await new Promise((r) => setTimeout(r, 4000 * (t + 1))); }
    }
    const items = Array.isArray(j.response?.body?.items) ? j.response!.body!.items! : [];
    out.push(...items);
    if (!items.length || out.length >= Number(j.response?.body?.totalCount ?? 0)) break;
  }
  return out;
}

let seed = 20261124;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

async function main() {
  const days = (process.argv[2] ?? "").split(",").filter(Boolean);
  const want = Number(process.argv[3] ?? 300);
  const latest = new Map<string, { biz: string; it: Item }>();
  for (const biz of Object.keys(OPS)) for (const d of days) for (const it of await list(OPS[biz], d)) {
    const k = it.bidNtceNo!;
    if (!latest.has(k) || (latest.get(k)!.it.bidNtceOrd ?? "") < (it.bidNtceOrd ?? "")) latest.set(k, { biz, it });
  }
  // 업종 제한이 없는 공고만 (참가자격이 공고서 본문에만 있는 경우)
  const cands = [...latest.values()].filter((r) => (r.it.ntceSpecDocUrl1 || r.it.stdNtceDocUrl) && r.it.indstrytyLmtYn !== "Y");
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  console.log(`전체 ${latest.size}건, 업종 제한 없는 후보 ${cands.length}건`);
  const out: Record<string, unknown> = {};
  let n = 0, idx = 0;
  async function worker() {
    while (n < want && idx < cands.length) {
      const { biz, it } = cands[idx++];
      const id = `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;
      const files: BidAttachment[] = [];
      const std = it.stdNtceDocUrl;
      for (let k = 1; k <= 10; k++) if (it[`ntceSpecDocUrl${k}`]) files.push({ name: it[`ntceSpecFileNm${k}`] || `첨부파일 ${k}`, url: it[`ntceSpecDocUrl${k}`]!, kind: it[`ntceSpecDocUrl${k}`] === std ? "공고서" : "규격서·기타" });
      if (std && !files.some((f) => f.url === std)) files.unshift({ name: "표준 공고서.hwp", url: std, kind: "공고서" });
      const docs = rankFiles(files).filter((f) => f.kind === "공고서" || /공고/.test(f.name)).slice(0, 2);
      if (!docs.length) continue;
      const texts: { name: string; text: string }[] = [];
      for (const f of docs) {
        try { const b = await download(f.url, 30_000); if (b) texts.push({ name: f.name, text: await textOf(f, b) }); } catch { /* 다음 */ }
      }
      if (!texts.some((t) => t.text.length > 300) || n >= want) continue;
      n++;
      out[id] = { biz, method: it.sucsfbidMthdNm, contract: it.cntrctCnclsMthdNm, name: it.bidNtceNm, agency: it.ntceInsttNm, presmpt: it.presmptPrce, files: texts };
      if (n % 25 === 0) console.log(`${n}건`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  mkdirSync("audit/out", { recursive: true });
  writeFileSync("audit/out/qual.json.gz", gzipSync(JSON.stringify(out)));
  console.log(`저장 ${n}건`);
}
main().catch((e) => { console.error(e); process.exit(1); });
