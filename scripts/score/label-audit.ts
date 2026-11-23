/**
 * 임시: 평가항목 이름 정리 전후 비교 (실사이트 공고 첨부로). 배포 전 삭제한다.
 * 실사이트 /attachments/{id}.json 에서 원문 배점표를 쓰는 공고를 골라, 같은 첨부 본문으로 이전/새 규칙 파서 결과를 나란히 출력한다.
 */
import type { BidAttachment } from "../../src/lib/types";
import { download, rankFiles, textOf, dropRepeatedEntries } from "../../src/lib/nara/attachText";
import { extractSheet, templateSheet, type EvalItem, type EvalSheet } from "../../src/lib/evalscore";
import { extractSheet as oldExtract } from "../../src/lib/evalscore.old";
import { adoptable } from "../../src/lib/criteria";

const SITE = "https://nparkup.github.io/vidding";
const isBad = (l: string) => {
  const o = (l.match(/[(（\[]/g) ?? []).length, c = (l.match(/[)）\]]/g) ?? []).length;
  return /^[,，、;·ㆍ\/+&)）:]|[,，、;·ㆍ\/+&(（:=]$/.test(l) || o !== c || /^(및|와|과|의|을|를|은|는)\s/.test(l) || l.replace(/[^가-힣A-Za-z]/g, "").length < 2;
};
const pool = async <T>(xs: T[], n: number, f: (x: T) => Promise<void>) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) await f(xs[i++]); })); };
const show = (s?: EvalSheet) => s ? s.items.map((i: EvalItem) => `${i.label}[${i.group}]${i.max}`).join(" · ") : "(없음)";

async function main() {
  const bids = (await (await fetch(`${SITE}/bids-data.json`)).json()) as { id: string }[];
  const docs = new Map<string, any>();
  let miss = 0;
  await pool(bids.map((b) => b.id), 8, async (id) => {
    for (let t = 0; t < 4; t++) {
      try { const r = await fetch(`${SITE}/attachments/${id}.json`); if (r.status === 404) return; if (r.ok) { const j = await r.json(); if (j.sheet && adoptable(j.sheet, j.qual?.basis)) docs.set(id, j); return; } } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1000 * (t + 1)));
    }
    miss++;
  });
  console.log(`bids ${bids.length}, fetch failed ${miss}`);
  const all = [...docs.keys()];
  const bad = all.filter((id) => docs.get(id).sheet.items.some((i: EvalItem) => isBad(i.label)));
  const good = all.filter((id) => !bad.includes(id)).sort(() => Math.random() - 0.5).slice(0, Number(process.env.GOOD ?? 250));
  console.log(`adopted ${all.length}, bad-label ${bad.length}, good sample ${good.length}`);
  const rows: string[] = [];
  const stat = { same: 0, fixed: 0, stillBad: 0, changedGood: 0, lostAdopt: 0, gainedAdopt: 0, failed: 0 };
  await pool([...bad, ...good], 10, async (id) => {
    const j = docs.get(id);
    const files = rankFiles(j.files as BidAttachment[]);
    const seen = new Set(files.map((f) => f.name.trim()));
    const texts: string[] = [];
    let bestNew: EvalSheet | undefined, bestOld: EvalSheet | undefined;
    const rank = (s: EvalSheet) => ({ 높음: 3, 보통: 2, 낮음: 1 })[s.confidence] * 100 + s.items.length;
    const tpl = templateSheet({ contractMethod: j.bid?.contractMethod, bizType: j.bid?.bizType, baseAmount: j.bid?.baseAmount ?? 0, category: j.bid?.category, lowerLimitRate: j.bid?.lowerLimitRate } as any, j.qual?.basis);
    for (const f of files) {
      try {
        const buf = await download(f.url, 20_000);
        if (!buf) continue;
        let t = await textOf(f, buf);
        t = dropRepeatedEntries(t, seen);
        if (!t.trim()) continue;
        texts.push(t);
        const n = extractSheet(texts.join("\n"), tpl), o = oldExtract(texts.join("\n"), tpl as any) as EvalSheet | undefined;
        if (n && (!bestNew || rank(n) > rank(bestNew))) bestNew = n;
        if (o && (!bestOld || rank(o) > rank(bestOld))) bestOld = o;
      } catch { /* skip */ }
    }
    if (!bestOld && !bestNew) { stat.failed++; return; }
    const keep = (s?: EvalSheet) => { const sum = s ? s.items.reduce((a, i) => a + i.max, 0) : 0; return s && sum >= 90 && sum <= 110 ? s : undefined; };
    const o = keep(bestOld), n = keep(bestNew);
    const ao = !!o && adoptable(o, j.qual?.basis), an = !!n && adoptable(n, j.qual?.basis);
    if (ao && !an) { stat.lostAdopt++; rows.push(`LOST ${id} text:\n` + texts.join("\n").split(/\r?\n/).filter((l) => /(정량|정성|가격|기술능력)/.test(l) && /\d\s*점/.test(l)).slice(0, 12).map((l) => `    | ${l.trim().slice(0, 160)}`).join("\n")); }
    if (!ao && an) stat.gainedAdopt++;
    const wasBad = bad.includes(id);
    if (show(o) === show(n)) { stat.same++; if (wasBad) stat.stillBad++; return; }
    if (wasBad) { if (n && n.items.some((i) => isBad(i.label))) stat.stillBad++; else stat.fixed++; } else stat.changedGood++;
    rows.push(`${wasBad ? "BAD " : "GOOD"} ${id} adopt ${ao}->${an}\n  old: ${show(o)}\n  new: ${show(n)}`);
  });
  console.log(JSON.stringify(stat));
  console.log(rows.sort().join("\n"));
}
main();
