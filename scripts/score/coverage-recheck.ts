/**
 * (임시) 점검 표본 다시 보기: coverage-audit.ts 와 prespec-audit.ts 가 받아 둔 원문으로 지금 코드의 추출·판독 결과를 내고 이전 결과와 비교한다.
 * 사용: ANTHROPIC_API_KEY=... npx tsx --conditions=react-server scripts/score/coverage-recheck.ts [ai]
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "fs";
import { gunzipSync, gzipSync } from "zlib";
import type { Bid, BidAttachment, BizType } from "../../src/lib/types";
import { adoptable, bidSheet, coarseSheet, evalBasisOf } from "../../src/lib/criteria";
import { extractSheetsForBids, textCacheKey } from "../../src/lib/nara/docExtract";
import { PRE_HEAD } from "../../src/lib/nara/attachText";
import { excerpt, hasTableSignal, readSheetWithAI, type AiSheetResult } from "../../src/lib/nara/aiSheet";
import { preSpecFileUrl } from "../../src/lib/preSpecs";
import type { EvalSheet } from "../../src/lib/evalscore";

type Item = Record<string, string>;
interface Dumped { biz: BizType; it: Item; files: { name: string; text?: string; error?: string }[]; pipeline: { adopt: boolean; act: EvalSheet; ai?: AiSheetResult } }
interface Pre { no: string; files: { seq: number; name?: string; text?: string }[] }

const load = <T>(f: string): T => JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as T;
const fmt = (s: EvalSheet) => s.items.map((i) => `${i.label} ${i.max}`).join(" · ");

async function main() {
  const dump = load<Record<string, Dumped>>("audit/out/coverage.json.gz");
  const pre = load<Record<string, Pre>>("audit/out/prespec.json.gz");
  const useAi = process.argv[2] === "ai" && !!process.env.ANTHROPIC_API_KEY;
  const client = useAi ? new Anthropic() : undefined;
  const rows: string[] = [];
  const out: Record<string, unknown> = {};
  const tally = { bids: 0, beforeTable: 0, afterTable: 0, beforeFacts: 0, afterFacts: 0, preRead: 0, aiCalls: 0, aiIn: 0, aiOut: 0 };
  const only = (process.argv[3] ?? "").split(",").filter(Boolean);
  for (const [id, v] of Object.entries(dump)) {
    if (only.length && !only.includes(id)) continue;
    tally.bids++;
    const it = v.it;
    const files: BidAttachment[] = [];
    const std = it.stdNtceDocUrl;
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) files.push({ name: it[`ntceSpecFileNm${n}`] || `첨부파일 ${n}`, url: it[`ntceSpecDocUrl${n}`], kind: it[`ntceSpecDocUrl${n}`] === std ? "공고서" : "규격서·기타" });
    if (std && !files.some((f) => f.url === std)) files.unshift({ name: "표준 공고서", url: std, kind: "공고서" });
    const cache = new Map<string, string>();
    for (const f of files) { const d = v.files.find((x) => x.name === f.name); if (d?.text !== undefined) cache.set(textCacheKey(f), d.text); }
    const p = pre[id];
    if (p) for (const f of p.files) {
      if (!f.name || f.text === undefined) continue;
      const a: BidAttachment = { name: `사전규격 규격서 ${f.seq}`, url: preSpecFileUrl(p.no, f.seq), kind: "사전규격" };
      files.push(a);
      cache.set(textCacheKey(a), `${PRE_HEAD}${f.name} ---\n${f.text}`);
    }
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const amt = Number(it.asignBdgtAmt || it.presmptPrce || 0);
    const bid = { id, title: it.bidNtceNm, agency: it.ntceInsttNm, postedAt: it.bidNtceDt ?? "", contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: v.biz, baseAmount: amt, category: "기타 용역", lowerLimitRate: Number(it.sucsfbidLwltRate) || undefined } as unknown as Bid;
    const basis = evalBasisOf(it);
    let named = "";
    const r = await extractSheetsForBids([bid], { [id]: files }, { concurrency: 1, textCache: { get: (u) => cache.get(u), set: () => undefined }, collect: (_b, t) => { named = t; } });
    const ex = r.sheets[id];
    const preUsed = (ex?.read ?? []).filter((n) => n.startsWith("사전규격")).length;
    if (/사전규격 규격서/.test(named)) tally.preRead++;
    let sheet = ex?.sheet && adoptable(ex.sheet, basis) ? ex.sheet : undefined;
    let ai: AiSheetResult | undefined;
    if ((!sheet || coarseSheet(sheet)) && named && hasTableSignal(named) && client) {
      tally.aiCalls++;
      try {
        const res = await readSheetWithAI(client, { id, title: it.bidNtceNm, contractMethod: bid.contractMethod, agency: it.ntceInsttNm, baseAmount: amt || undefined, estimated: basis?.presmpt || undefined }, excerpt(named), { techRatio: basis?.techRatio, priceRatio: basis?.priceRatio, onRaw: only.length ? (o) => console.log(JSON.stringify(o).slice(0, 3000)) : undefined });
        ai = res as AiSheetResult;
        tally.aiIn += res.usage?.input ?? 0; tally.aiOut += res.usage?.output ?? 0;
        if (res.status === "ok" && res.sheet) sheet = res.sheet;
      } catch (e) { ai = { status: "error", reason: (e as Error).message } as AiSheetResult; }
    } else if (!sheet && !client && v.pipeline.ai?.status === "ok") sheet = v.pipeline.ai.sheet;
    const act = bidSheet(bid, basis, { extracted: sheet, notice: ex?.notice, quant: ex?.quant });
    const before = v.pipeline.adopt || v.pipeline.ai?.status === "ok";
    const after = !!sheet;
    tally.beforeTable += Number(before);
    tally.afterTable += Number(after);
    const bf = v.pipeline.act.noticeFacts?.length ?? 0, af = act.noticeFacts?.length ?? 0;
    tally.beforeFacts += bf; tally.afterFacts += af;
    const beforeSheet = v.pipeline.adopt ? v.pipeline.act : v.pipeline.ai?.status === "ok" ? v.pipeline.ai.sheet : undefined;
    rows.push(`${id}\t${v.biz}\t${nego ? "협상" : "적격"}\t배점표 ${before ? "원문" : "추정"}→${after ? "원문" : "추정"}\t공고서 기준 ${bf}→${af}\t사전규격 ${preUsed}\tAI ${ai?.status ?? "-"}${ai?.reason ? ` (${ai.reason.slice(0, 80)})` : ""}\n    전: ${beforeSheet ? fmt(beforeSheet) : "-"}\n    후: ${sheet ? fmt(sheet) : "-"}\n    기준: ${(act.noticeFacts ?? []).map((f) => `${f.label}=${f.list ? f.list.length + "가지" : f.value.slice(0, 40)}`).join(" | ")}`);
    out[id] = { ex, ai, act };
  }
  console.log(rows.join("\n"));
  console.log(`\n요약 ${JSON.stringify(tally)}`);
  writeFileSync("audit/out/recheck.json.gz", gzipSync(JSON.stringify(out)));
}
main().catch((e) => { console.error(e); process.exit(1); });
