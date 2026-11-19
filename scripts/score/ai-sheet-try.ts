/**
 * AI 배점표 판독 시험: 공고번호(또는 로컬 PDF·HWP 파일)를 받아 규칙 파서 결과와 AI 판독 결과를 나란히 출력한다. 배포는 하지 않는다.
 * 사용: ANTHROPIC_API_KEY=... DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/ai-sheet-try.ts R26BK01826659[,공고번호…]
 *       ANTHROPIC_API_KEY=... npx tsx --conditions=react-server scripts/score/ai-sheet-try.ts ./공고.pdf
 * 나라장터 첨부 서버(g2b.go.kr)는 GitHub Actions 에서만 닿는다 (sheet-audit.yml 의 ids 입력).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import type { Bid, BidAttachment } from "../../src/lib/types";
import { adoptable, evalBasisOf, type EvalBasis } from "../../src/lib/criteria";
import { extractSheet, templateSheet, type EvalSheet } from "../../src/lib/evalscore";
import { download, rankFiles, textOf } from "../../src/lib/nara/docExtract";
import { DEFAULT_AI_MODEL, excerpt, hasTableSignal, readSheetWithAI } from "../../src/lib/nara/aiSheet";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";

async function findNotice(no: string): Promise<{ it: Item; biz: string } | undefined> {
  for (const [biz, op] of [["용역", "Servc"], ["공사", "Cnstwk"], ["물품", "Thng"]]) {
    const q = new URLSearchParams({ type: "json", numOfRows: "10", pageNo: "1", inqryDiv: "2", bidNtceNo: no });
    try {
      const j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(60_000) })).json();
      const items: Item[] = j?.response?.body?.items ?? [];
      const it = items.sort((a, b) => (b.bidNtceOrd ?? "").localeCompare(a.bidNtceOrd ?? ""))[0];
      if (it) return { it, biz };
    } catch { /* 다음 업무 */ }
  }
  return undefined;
}

const fmt = (s: EvalSheet) => s.items.map((i) => `  - [${i.kind}/${i.group}] ${i.label} ${i.max}점${i.bands ? `\n      구간: ${i.bands.map((b) => `${b.cond}=${b.points}`).join(" | ")}` : ""}${i.criteria ? `\n      요소: ${i.criteria.join(" / ")}` : ""}`).join("\n");

async function one(label: string, bid: Bid, files: { name: string; text: string }[], basis: EvalBasis | undefined, client: Anthropic | undefined) {
  const named = files.map((f) => `=== 파일: ${f.name} ===\n${f.text}`).join("\n");
  const all = files.map((f) => f.text).join("\n");
  console.log(`\n==================== ${label}\n${bid.title} | ${bid.contractMethod} | 기술:가격 ${basis?.techRatio ?? "-"}:${basis?.priceRatio ?? "-"}`);
  for (const f of files) console.log(`파일: ${f.name} (${f.text.length}자)`);
  const rule = extractSheet(all, templateSheet(bid, basis));
  console.log(`--- 규칙 파서: ${rule ? `${rule.items.length}개 항목, 화면 사용 ${adoptable(rule, basis) ? "가능" : "불가"}` : "없음"}`);
  if (rule) console.log(fmt(rule));
  const ex = excerpt(named);
  console.log(`--- 보낼 본문 ${ex.length}자 (원문 ${named.length}자), 배점표 신호 ${hasTableSignal(named) ? "있음" : "없음"}`);
  if (!client) { console.log("ANTHROPIC_API_KEY 없음: AI 판독 생략"); return; }
  const t0 = Date.now();
  const r = await readSheetWithAI(client, bid, ex, { model: process.env.AI_SHEET_MODEL || DEFAULT_AI_MODEL, techRatio: basis?.techRatio, priceRatio: basis?.priceRatio });
  const ok = r.sheet && adoptable(r.sheet, basis);
  console.log(`--- AI 판독 (${r.model}, ${((Date.now() - t0) / 1000).toFixed(0)}초, 토큰 입력 ${r.usage?.input} / 출력 ${r.usage?.output}): ${r.status}${r.reason ? ` - ${r.reason}` : ""}${r.sheet ? `, 화면 사용 ${ok ? "가능" : "불가"}` : ""}`);
  if (r.sheet) console.log(`통과 ${JSON.stringify(r.sheet.pass)} | 위원 ${r.sheet.panelRule ?? "-"} | ${r.sheet.notes.join(" / ")}\n${fmt(r.sheet)}`);
}

async function main() {
  const args = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 3, timeout: 5 * 60_000 }) : undefined;
  for (const a of args) {
    if (existsSync(a)) {
      const f = { name: basename(a), url: "" } as BidAttachment;
      const bid = { id: basename(a), title: basename(a), contractMethod: "협상에 의한 계약", bizType: "용역", baseAmount: 0, category: "기타 용역", lowerLimitRate: 0, agency: "" } as unknown as Bid;
      await one(a, bid, [{ name: f.name, text: await textOf(f, readFileSync(a)) }], undefined, client);
      continue;
    }
    const found = await findNotice(a);
    if (!found) { console.log(`\n${a}: 공고를 찾지 못함`); continue; }
    const { it, biz } = found;
    const att: BidAttachment[] = [];
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) att.push({ name: it[`ntceSpecFileNm${n}`] || `첨부 ${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: "규격서·기타" });
    const files: { name: string; text: string }[] = [];
    for (const f of rankFiles(att)) {
      try { const b = await download(f.url, 30_000); if (b) files.push({ name: f.name, text: await textOf(f, b) }); } catch (e) { console.log(`받기 실패 ${f.name}: ${e instanceof Error ? e.message : e}`); }
    }
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const bid = { id: `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`, title: it.bidNtceNm ?? a, agency: it.ntceInsttNm ?? "", contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: biz, baseAmount: Number(it.asignBdgtAmt || it.presmptPrce || 0), category: "기타 용역", lowerLimitRate: Number(it.sucsfbidLwltRate || 0) } as unknown as Bid;
    await one(`${bid.id} ${it.ntceInsttNm} (${it.sucsfbidMthdNm})`, bid, files, evalBasisOf(it), client);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
