/**
 * 공고 첨부 평가표 대조: 실제 공고의 첨부파일에서 읽은 평가 기준과, 평가점수 예측이 실제로 쓰는 기준을 나란히 출력한다.
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/sheet-audit.ts [공고일 YYYYMMDD,…] [묶음당 공고 수]
 * 나라장터 첨부 서버(g2b.go.kr)에 닿는 곳(GitHub Actions)에서 돌린다.
 */
import { mkdirSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";
import type { Bid, BidAttachment, BizType } from "../../src/lib/types";
import { evalBasisOf, enrichSheet } from "../../src/lib/criteria";
import { extractSheet, templateSheet, predict, DEFAULT_COMPANY, type EvalSheet } from "../../src/lib/evalscore";
import { download, textOf } from "../../src/lib/nara/docExtract";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const OPS: Record<string, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };

async function list(op: string, day: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let p = 1; p < 10; p++) {
    const q = new URLSearchParams({ type: "json", numOfRows: "999", pageNo: String(p), inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359` });
    let j: { response?: { body?: { items?: unknown; totalCount?: string } } } = {};
    for (let t = 0; t < 5; t++) {
      try { j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(90_000) })).json(); break; }
      catch (e) { if (t === 4) throw e; await new Promise((r) => setTimeout(r, 5000 * (t + 1))); }
    }
    const b = j.response?.body;
    const items: Item[] = Array.isArray(b?.items) ? (b!.items as Item[]) : [];
    if (!b) break;
    out.push(...items);
    if (!items.length || out.length >= Number(b.totalCount)) break;
  }
  return out;
}

const LOCAL = /(특별시|광역시|특별자치|도청|시청|군청|구청|교육청|교육지원청|[가-힣]+(시|군|구)$|[가-힣]+(시|군|구)\s)/;
const fmt = (s: EvalSheet) => s.items.map((i) => `  - [${i.kind}${i.group ? `/${i.group}` : ""}] ${i.label} ${i.max}점${i.lookup ? " (등급표)" : ""}${i.perfLinear ? ` (실적계수 ${i.perfLinear})` : ""}${i.bands ? `\n      구간: ${i.bands.map((b) => `${b.cond}=${b.points}`).join(" | ")}` : ""}${i.recognition ? `\n      인정: ${i.recognition.join(" / ")}` : ""}`).join("\n");

async function main() {
  const days = (process.argv[2] ?? "").split(",").filter(Boolean);
  const per = Number(process.argv[3] ?? 4);
  const rows: { biz: BizType; it: Item }[] = [];
  for (const biz of Object.keys(OPS) as BizType[]) for (const d of days) for (const it of await list(OPS[biz], d)) rows.push({ biz, it });
  const cands = rows.filter((r) => /^(적격|협상)/.test(r.it.sucsfbidMthdNm ?? "") && r.it.ntceSpecDocUrl1);
  console.log(`대상 공고 ${cands.length}건 (적격·협상, 첨부 있음)`);
  const pick: typeof cands = [];
  const seen = new Set<string>();
  for (const biz of Object.keys(OPS)) for (const loc of [true, false]) for (const nego of [false, true]) {
    const g = cands.filter((r) => r.biz === biz && LOCAL.test(r.it.ntceInsttNm ?? "") === loc && /^협상/.test(r.it.sucsfbidMthdNm ?? "") === nego);
    const n = nego ? Math.ceil(per / 2) : per;
    for (let i = 0; i < n && i < g.length; i++) {
      const r = g[Math.floor((i * g.length) / n)];
      if (!seen.has(r.it.bidNtceNo!)) { seen.add(r.it.bidNtceNo!); pick.push(r); }
    }
  }
  const summary: string[] = [];
  const dump: Record<string, unknown> = {};
  for (const { biz, it } of pick) {
    const id = `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;
    const files: BidAttachment[] = [];
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) files.push({ name: it[`ntceSpecFileNm${n}`] || `첨부 ${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: "규격서·기타" });
    const texts: { name: string; text: string }[] = [];
    for (const f of files) {
      if (!/\.(pdf|hwpx|hwp)$/i.test(f.name)) continue;
      try { const b = await download(f.url, 30_000); if (b) texts.push({ name: f.name, text: await textOf(f, b) }); } catch { /* skip */ }
    }
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const amt = Number(it.asignBdgtAmt || it.presmptPrce || 0);
    const bid = { id, contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: biz, baseAmount: amt, category: "기타 용역", lowerLimitRate: 87.745 } as unknown as Bid;
    const basis = evalBasisOf(it);
    const tpl = templateSheet(bid, basis);
    const ex = extractSheet(texts.map((t) => t.text).join("\n"), tpl);
    const act = ex ? enrichSheet(ex, tpl) : tpl;
    const p = predict(act, bid, DEFAULT_COMPANY);
    console.log(`\n==================== ${id} [${biz}] ${it.ntceInsttNm} / ${it.dminsttNm}`);
    console.log(`${it.bidNtceNm}\n낙찰방법: ${it.sucsfbidMthdNm} | 하한율 ${it.sucsfbidLwltRate} | 금액 ${amt.toLocaleString()} | 추정 ${it.presmptPrce}`);
    for (const t of texts) console.log(`파일: ${t.name} (${t.text.length}자, '배점' ${(t.text.match(/배\s*점/g) ?? []).length}회)`);
    // 평가 기준 부분 원문: '배점' 이 처음 나오는 표 머리부터 90줄
    const lines = texts.flatMap((t) => [`<<${t.name}>>`, ...t.text.split(/\r?\n/)]);
    const idx = lines.findIndex((l) => /배\s*점/.test(l) && /(평가\s*항목|평가\s*요소|구\s*분|심사\s*항목|심사\s*분야)/.test(l));
    const from = idx >= 0 ? Math.max(0, idx - 8) : lines.findIndex((l) => /(적격심사|평가기준|심사기준)/.test(l));
    console.log(`--- 원문 (${idx >= 0 ? "배점표" : "심사기준 언급"} 부근) ---`);
    if (from >= 0) console.log(lines.slice(from, from + 90).map((l) => `| ${l.slice(0, 160)}`).join("\n"));
    else console.log("| (평가 기준 문구 없음)");
    console.log(`--- 기준표 (${tpl.title}) 통과 ${JSON.stringify(tpl.pass)} 하한 ${tpl.lowerLimit}\n${fmt(tpl)}`);
    console.log(ex ? `--- 추출 (신뢰도 ${ex.confidence}) 통과 ${JSON.stringify(ex.pass)} 신인도 ${ex.trust?.name}\n${fmt(ex)}\n  notes: ${ex.notes.join(" ")}` : "--- 추출: 없음");
    console.log(`--- 예측에 쓰인 기준 (${act.source}) 통과 ${JSON.stringify(act.pass)} 하한 ${act.lowerLimit} 가격 ${act.price?.text ?? "-"}\n${fmt(act)}\n  예측 합계 ${p.total} / 투찰 구간 ${JSON.stringify(p.rateWindow)}`);
    summary.push(`${id}\t${biz}\t${LOCAL.test(it.ntceInsttNm ?? "") ? "지자체" : "국가"}\t${nego ? "협상" : "적격"}\t파일${texts.length}/${files.length}\t추출 ${ex ? `${ex.confidence} ${ex.items.length}항목 합${ex.items.reduce((s, i) => s + i.max, 0)}` : "없음"}\t${(it.ntceInsttNm ?? "").slice(0, 16)}`);
    dump[id] = { biz, it, texts };
  }
  console.log(`\n==================== 요약\n${summary.join("\n")}`);
  // 원문은 로컬에서 추출 규칙을 다시 돌려 볼 수 있도록 저장한다 (AUDIT_OUT)
  const out = process.env.AUDIT_OUT ?? "sheet-audit.json.gz";
  if (out.includes("/")) mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(out, gzipSync(JSON.stringify(dump)));
}
main().catch((e) => { console.error(e); process.exit(1); });
