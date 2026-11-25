/**
 * (임시) 민간 공고 배점표 점검: 누리장터 진행 공고의 첨부를 읽어
 * 1) 미리보기용 자료(audit/out/nuri-fixture.json: nuriBids + nuriDocs)
 * 2) 쓰지 못한 배점표(합계가 90~110 밖) 목록과 항목을 남긴다. PR 전에 지운다.
 */
import { mkdirSync, writeFileSync } from "fs";
import { fetchNuriBids } from "../src/lib/nara/nuri";
import { extractNuriSheets, NURI_SHEET_AWARD } from "../src/lib/nara/nuriSheets";
import { download, dropRepeatedEntries, rankFiles, textOf } from "../src/lib/nara/attachText";
import { extractSheet, templateSheet } from "../src/lib/evalscore";
import { textCacheKey } from "../src/lib/nara/docExtract";
import type { Bid, BidAttachment } from "../src/lib/types";

async function main() {
  const mem = new Map<string, string>();
  const cache = { get: (k: string) => mem.get(k), set: (k: string, t: string) => void mem.set(k, t) };
  const { file, log } = await fetchNuriBids();
  console.log(log);
  const st = await extractNuriSheets(file.items, cache, 15 * 60_000);
  console.log(`배점표: 대상 ${st.targets}, 읽음 ${st.read}, 찾음 ${st.found}, 실패 ${st.failed}, 시간초과 ${st.timedOut}`);
  mkdirSync("audit/out", { recursive: true });
  writeFileSync("audit/out/nuri-fixture.json", JSON.stringify({ nuriBids: file, nuriDocs: st.docs }));
  // 쓰지 못한 표: 파일마다 가장 그럴듯한 표의 합계와 항목
  const out: string[] = [];
  const hist: Record<string, number> = {};
  for (const b of file.items) {
    if (!NURI_SHEET_AWARD.test(b.award ?? "") || b.sheet || new Date(b.closeAt).getTime() < Date.now()) continue;
    const files: BidAttachment[] = rankFiles(b.files.map((f) => ({ name: f.name, url: f.url, kind: "규격서·기타" })));
    const seen = new Set(files.map((f) => f.name.trim()));
    const pseudo = { contractMethod: /제안서/.test(b.award ?? "") ? "협상에 의한 계약" : "적격심사", bizType: b.biz === "기타" ? "용역" : b.biz, baseAmount: b.refAmount ?? b.budget ?? 0, category: b.category, lowerLimitRate: 87.745 } as unknown as Bid;
    let best: { total: number; n: number; file: string; items: string } | undefined;
    for (const f of files) {
      let t = cache.get(textCacheKey(f));
      if (t === undefined) { try { const buf = await download(f.url, 20_000); t = buf ? await textOf(f, buf) : ""; } catch { t = ""; } }
      t = dropRepeatedEntries(t, seen);
      if (!t.trim()) continue;
      const s = extractSheet(t, templateSheet(pseudo));
      if (!s) continue;
      const total = Math.round(s.items.reduce((a, i) => a + i.max, 0) * 100) / 100;
      if (!best || s.items.length > best.n) best = { total, n: s.items.length, file: f.name, items: s.items.map((i) => `${i.group}/${i.label}=${i.max}${i.kind === "price" ? "(가격)" : ""}`).join(" | ") };
    }
    const bucket = !best ? "표 없음" : best.total < 90 ? "<90" : best.total <= 110 ? "90~110(제외 규칙)" : best.total <= 170 ? "110~170" : ">170";
    hist[bucket] = (hist[bucket] ?? 0) + 1;
    if (best) out.push(`## ${b.no}-${b.ord} [${b.award}] ${b.title}\n합계 ${best.total} · ${best.file}\n${best.items}\n`);
  }
  console.log("쓰지 못한 공고 분포", JSON.stringify(hist));
  writeFileSync("audit/out/rejected.md", out.join("\n"));
  // 120~170 표의 원문 앞뒤를 보려고, 해당 공고의 본문 일부를 남긴다
  const texts: string[] = [];
  for (const line of out) {
    const m = /^## (\S+)/.exec(line); const tot = /합계 ([\d.]+)/.exec(line);
    if (!m || !tot || Number(tot[1]) <= 110) continue;
    const b = file.items.find((x) => `${x.no}-${x.ord}` === m[1])!;
    const body = b.files.map((f) => cache.get(textCacheKey({ name: f.name, url: f.url, kind: "규격서·기타" })) ?? "").join("\n");
    const i = body.search(/배\s*점|평가\s*항목/);
    texts.push(`## ${m[1]} ${b.title}\n${body.slice(Math.max(0, i - 500), i + 6000)}\n`);
    if (texts.length >= 25) break;
  }
  writeFileSync("audit/out/rejected-text.md", texts.join("\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
