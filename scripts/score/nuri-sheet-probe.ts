/** 임시 측정: 진행 중인 누리장터 공고 첨부에서 배점표를 읽을 수 있는 비율 (PR 전 삭제) */
import type { Bid, BidAttachment } from "../../src/lib/types";
import { call, mapLimit } from "../../src/lib/nara/client";
import { extractSheet, templateSheet } from "../../src/lib/evalscore";
import { readNoticeCriteria } from "../../src/lib/noticeCriteria";
import { download, rankFiles, textOf } from "../../src/lib/nara/attachText";

type Item = Record<string, string | undefined>;
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (t: number) => { const d = new Date(t + 9 * 3600e3); return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`; };
const OPS: [string, string][] = [["용역", "Servc"], ["공사", "Cnstwk"], ["물품", "Thng"], ["기타", "Etc"]];

async function main() {
  const rows: { biz: string; it: Item }[] = [];
  for (let w = 0; w < 12; w++) {
    const to = Date.now() - w * 7 * 864e5, from = to - 6 * 864e5;
    for (const [biz, op] of OPS) {
      try {
        const f = await call("/ao/PrvtBidNtceService", `getPrvtBidPblancListInfo${op}`, { inqryDiv: "1", inqryBgnDt: `${ymd(from)}0000`, inqryEndDt: `${ymd(to)}2359`, numOfRows: "999" });
        for (const it of f.items as Item[]) rows.push({ biz, it });
      } catch (e) { console.warn(op, w, e instanceof Error ? e.message : e); }
    }
  }
  const now = Date.now();
  const latest = new Map<string, { biz: string; it: Item }>();
  for (const r of rows) { const k = r.it.bidNtceNo!; const o = latest.get(k); if (!o || (o.it.bidNtceOrd ?? "") < (r.it.bidNtceOrd ?? "")) latest.set(k, r); }
  const open = [...latest.values()].filter((r) => { const c = r.it.bidClseDt; return c && new Date(c.replace(" ", "T") + "+09:00").getTime() > now; });
  console.log(`수집 ${rows.length}행, 공고 ${latest.size}건, 진행 중 ${open.length}건`);
  const tally = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" | "); };
  console.log("낙찰방법:", tally(open.map((r) => r.it.sucsfbidMthdNm ?? "(없음)")));
  console.log("업무:", tally(open.map((r) => r.biz)));
  const ext: string[] = [];
  const res = await mapLimit(open, 6, async ({ biz, it }) => {
    const files: BidAttachment[] = [];
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) files.push({ name: it[`ntceSpecDocNm${n}`] || `첨부${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: "규격서·기타" });
    for (const f of files) ext.push((f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "?").toLowerCase());
    const read = rankFiles(files);
    let ok = 0, fail = 0, baejeom = 0;
    const texts: string[] = [];
    for (const f of read) {
      try { const b = await download(f.url, 30_000); if (!b) { fail++; continue; } const t = await textOf(f, b); ok++; texts.push(t); baejeom += (t.match(/배\s*점/g) ?? []).length; } catch { fail++; }
    }
    const all = texts.join("\n");
    const award = it.sucsfbidMthdNm ?? "";
    const nego = /협상|제안/.test(award);
    const bid = { id: it.bidNtceNo, contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: biz === "기타" ? "용역" : biz, baseAmount: Number(it.refAmt || it.asignBdgtAmt || 0), category: "기타 용역", lowerLimitRate: 87.745 } as unknown as Bid;
    const sheet = all ? extractSheet(all, templateSheet(bid)) : undefined;
    const sum = sheet ? sheet.items.reduce((a, i) => a + i.max, 0) : 0;
    const good = !!sheet && sum >= 90 && sum <= 110;
    const notice = all ? readNoticeCriteria(all) : undefined;
    return { no: it.bidNtceNo!, biz, award, title: it.ntceNm ?? "", files: files.length, readable: read.length, ok, fail, baejeom, good, conf: sheet?.confidence, items: sheet?.items.length ?? 0, sum, notice: !!notice && Object.keys(notice).length > 0 };
  });
  console.log("첨부 확장자:", tally(ext));
  const n = res.length;
  const c = (f: (r: (typeof res)[number]) => boolean) => res.filter(f).length;
  console.log(`첨부 있음 ${c((r) => r.files > 0)}/${n}, 읽을 형식 있음 ${c((r) => r.readable > 0)}, 본문 읽힘 ${c((r) => r.ok > 0)}, '배점' 글자 ${c((r) => r.baejeom > 0)}, 배점표(합계 90~110) ${c((r) => r.good)}, 공고 기준 문장 ${c((r) => r.notice)}`);
  const byAward = new Map<string, typeof res>();
  for (const r of res) byAward.set(r.award || "(없음)", [...(byAward.get(r.award || "(없음)") ?? []), r]);
  for (const [a, xs] of byAward) console.log(`  [${a}] ${xs.length}건: 본문 ${xs.filter((r) => r.ok).length}, 배점 글자 ${xs.filter((r) => r.baejeom).length}, 배점표 ${xs.filter((r) => r.good).length}`);
  console.log("\n공고별:");
  for (const r of res) console.log(`${r.no} [${r.biz}/${r.award}] 첨부${r.files} 읽음${r.ok} 실패${r.fail} 배점${r.baejeom} 표${r.good ? `O(${r.conf},${r.items}항목,${r.sum})` : r.items ? `X(합${r.sum})` : "-"} ${r.title.slice(0, 40)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
