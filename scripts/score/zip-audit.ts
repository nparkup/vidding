/**
 * 압축(ZIP 등) 첨부가 있는 실제 공고로 평가표 추출을 시험한다. 배포는 하지 않는다.
 * 사용: DATA_GO_KR_SERVICE_KEY=... [ANTHROPIC_API_KEY=...] npx tsx --conditions=react-server scripts/score/zip-audit.ts [최근 영업일 수=10] [최대 공고 수=40]
 * 나라장터 첨부 서버(g2b.go.kr)는 GitHub Actions 에서만 닿는다 (sheet-audit.yml 의 zip 입력).
 * 공고마다 (1) 압축 첨부의 구조(항목 수·파일명·압축 방식)와 읽힌 글자 수, (2) 압축 첨부를 빼고 읽었을 때와 넣고 읽었을 때의 평가표 결과를 나란히 출력한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BidAttachment } from "../../src/lib/types";
import { evalBasisOf } from "../../src/lib/criteria";
import { methodProfile } from "../../src/lib/bidMethod";
import { download, textOf, zipInfo } from "../../src/lib/nara/attachText";
import { readSheetLive, type LiveDocs, type LiveResult } from "../../src/lib/nara/liveSheet";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const ARCHIVE = /\.(zip|egg|alz|7z|rar|tar|gz)$/i;

async function list(op: string, day: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ type: "json", numOfRows: "999", pageNo: String(page), inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359` });
    try {
      const j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(90_000) })).json();
      const items: Item[] = j?.response?.body?.items ?? [];
      out.push(...items);
      if (items.length < 999) break;
    } catch { break; }
  }
  return out;
}

const filesOf = (it: Item): BidAttachment[] => {
  const files: BidAttachment[] = [];
  for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) files.push({ name: it[`ntceSpecFileNm${n}`] || `첨부파일 ${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: "규격서·기타" });
  return files;
};

const show = (r: LiveResult) => r.sheet ? `${r.status}(${r.by}) ${r.sheet.items.length}항목 합${r.sheet.items.reduce((a, i) => a + i.max, 0)}` : `${r.status}${r.reason ? ` - ${r.reason}` : ""}`;

async function byId(no: string): Promise<{ it: Item; biz: string } | undefined> {
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

async function main() {
  // 공고번호를 주면 그 공고만 (예: R26BK01846123+R26BK01845329), 아니면 최근 영업일에서 고른다
  const ids = /^R\d/.test(process.argv[2] ?? "") ? process.argv[2].split(/[+ ]/).filter(Boolean) : [];
  const days = ids.length ? 0 : Number(process.argv[2] || 10), max = ids.length || Number(process.argv[3] || 40);
  const ext: Record<string, number> = {};
  const cands: { it: Item; biz: string }[] = [];
  for (const no of ids) { const f = await byId(no); if (f) cands.push(f); }
  let total = 0;
  for (let back = 1, got = 0; got < days && back < days * 2 + 6; back++) {
    const d = new Date(Date.now() + 9 * 3600_000 - back * 86400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    got++;
    const day = d.toISOString().slice(0, 10).replace(/-/g, "");
    for (const [biz, op] of [["용역", "Servc"], ["공사", "Cnstwk"], ["물품", "Thng"]]) {
      const items = await list(op, day);
      total += items.length;
      for (const it of items) {
        const fs = filesOf(it);
        for (const f of fs) { const e = /\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1]?.toLowerCase() ?? "(확장자 없음)"; ext[e] = (ext[e] ?? 0) + 1; }
        if (!fs.some((f) => ARCHIVE.test(f.name))) continue;
        const m = it.sucsfbidMthdNm ?? "";
        if (!/적격|협상/.test(m)) continue;
        const prof = methodProfile({ contractMethod: /^협상/.test(m) ? "협상에 의한 계약" : "적격심사", awardRaw: m, contractType: it.cntrctCnclsMthdNm });
        if (!prof.open) continue;
        cands.push({ it, biz });
      }
    }
  }
  const uniq = [...new Map(cands.map((c) => [`${c.it.bidNtceNo}-${c.it.bidNtceOrd ?? "000"}`, c])).values()];
  console.log(`공고 ${total}건, 첨부 확장자: ${Object.entries(ext).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`압축 첨부가 있는 적격심사·협상 공고 ${uniq.length}건 중 ${Math.min(max, uniq.length)}건 시험`);

  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 3, timeout: 5 * 60_000 }) : undefined;
  const summary: string[] = [];
  const tally = { bids: 0, withoutOk: 0, withOk: 0, zips: 0, zipRead: 0, zipEmpty: 0, zipFail: 0 };
  for (const { it, biz } of uniq.slice(0, max)) {
    const id = `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;
    const files = filesOf(it);
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const bid = { id, title: it.bidNtceNm ?? "", agency: it.ntceInsttNm ?? "", bizType: biz, category: "기타 용역", contractMethod: nego ? "협상에 의한 계약" : "적격심사", baseAmount: Number(it.asignBdgtAmt || it.presmptPrce || 0), lowerLimitRate: Number(it.sucsfbidLwltRate || 0) } as NonNullable<LiveDocs["bid"]>;
    const basis = evalBasisOf(it);
    console.log(`\n=== ${id} ${it.ntceInsttNm} | ${it.bidNtceNm} | ${it.sucsfbidMthdNm}`);
    tally.bids++;
    for (const f of files.filter((x) => ARCHIVE.test(x.name))) {
      tally.zips++;
      const t0 = Date.now();
      try {
        const buf = await download(f.url, 60_000);
        if (!buf) { console.log(`  [압축] ${f.name}: 받지 못함`); tally.zipFail++; continue; }
        const info = zipInfo(buf);
        console.log(`  [압축] ${f.name}: ${(buf.length / 1e6).toFixed(1)}MB, 머리 ${buf.subarray(0, 4).toString("hex")}, 항목 ${info.length}`);
        for (const e of info.slice(0, 30)) console.log(`     - ${e.name} | 방식 ${e.method} | 플래그 ${e.flags.toString(16)} | ${e.csize}→${e.usize}`);
        const text = await textOf(f, buf);
        console.log(`  읽은 글자 ${text.length} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
        for (const h of text.match(/^--- 압축 안 파일: .*$/gm) ?? []) console.log(`     ${h} `);
        if (text.trim()) tally.zipRead++; else tally.zipEmpty++;
      } catch (e) { console.log(`  [압축] ${f.name}: 오류 ${(e as Error).message}`); tally.zipFail++; }
    }
    const docs = (fs: BidAttachment[]): LiveDocs => ({ files: fs, qual: { basis }, bid });
    const allow = () => true;
    const without = await readSheetLive(client, docs(files.filter((f) => !ARCHIVE.test(f.name))), { id, allowUrl: allow, model: process.env.AI_SHEET_MODEL || undefined });
    const withZip = await readSheetLive(client, docs(files), { id, allowUrl: allow, model: process.env.AI_SHEET_MODEL || undefined });
    if (without.status === "ok") tally.withoutOk++;
    if (withZip.status === "ok") tally.withOk++;
    console.log(`  압축 빼고: ${show(without)}\n  압축 포함: ${show(withZip)}${withZip.failed.length ? ` | 실패 ${withZip.failed.join(", ")}` : ""}`);
    if (withZip.sheet) for (const i of withZip.sheet.items) console.log(`     · ${i.label} ${i.max}점`);
    summary.push(`${id} | 압축 빼고 ${show(without)} | 압축 포함 ${show(withZip)}`);
  }
  console.log(`\n==================== 요약\n${summary.join("\n")}`);
  console.log(`공고 ${tally.bids}건: 배점표 원문 사용 압축 빼고 ${tally.withoutOk}건 → 압축 포함 ${tally.withOk}건 | 압축 첨부 ${tally.zips}개: 읽음 ${tally.zipRead}, 글 없음 ${tally.zipEmpty}, 실패 ${tally.zipFail}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
