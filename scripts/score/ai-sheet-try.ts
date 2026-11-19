/**
 * AI 배점표 판독 시험: 공고번호(또는 로컬 PDF·HWP 파일)를 받아 규칙 파서 결과와 AI 판독 결과를 나란히 출력한다. 배포는 하지 않는다.
 * 사용: ANTHROPIC_API_KEY=... DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/ai-sheet-try.ts R26BK01826659[,공고번호…]
 *       ANTHROPIC_API_KEY=... npx tsx --conditions=react-server scripts/score/ai-sheet-try.ts ./공고.pdf
 * 나라장터 첨부 서버(g2b.go.kr)는 GitHub Actions 에서만 닿는다 (sheet-audit.yml 의 ids 입력). DUMP_TEXT=1 이면 첨부 원문 전체를 출력한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import type { Bid, BidAttachment } from "../../src/lib/types";
import { adoptable, evalBasisOf, type EvalBasis } from "../../src/lib/criteria";
import { extractSheet, templateSheet, type EvalSheet } from "../../src/lib/evalscore";
import { download, rankFiles, textOf } from "../../src/lib/nara/docExtract";
import { methodProfile } from "../../src/lib/bidMethod";
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

/** 최근 영업일 공고에서 업무별로 무작위로 고른다 (첨부가 있는 공고만) */
async function randomNotices(n: number): Promise<string[]> {
  const pool: Record<string, Item[]> = { Servc: [], Cnstwk: [], Thng: [] };
  for (let back = 1; back <= 6; back++) {
    const d = new Date(Date.now() + 9 * 3600_000 - back * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
    for (const op of Object.keys(pool)) {
      const q = new URLSearchParams({ type: "json", numOfRows: "200", pageNo: "1", inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359` });
      try {
        const j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(60_000) })).json();
        const items: Item[] = j?.response?.body?.items ?? [];
        pool[op].push(...items.filter((it) => it.ntceSpecDocUrl1 && it.bidNtceNo));
      } catch { /* 다음 */ }
    }
  }
  const share: Record<string, number> = { Servc: Math.ceil(n * 0.4), Cnstwk: Math.round(n * 0.3), Thng: 0 };
  share.Thng = n - share.Servc - share.Cnstwk;
  const out: string[] = [];
  for (const [op, k] of Object.entries(share)) {
    const uniq = [...new Map(pool[op].map((it) => [it.bidNtceNo!, it])).values()];
    // 협상·적격심사 등 낙찰방법이 고루 섞이도록 낙찰방법별로 돌아가며 뽑는다
    const byMethod = new Map<string, Item[]>();
    for (const it of uniq.sort(() => Math.random() - 0.5)) {
      const m = (it.sucsfbidMthdNm ?? "").slice(0, 8);
      byMethod.set(m, [...(byMethod.get(m) ?? []), it]);
    }
    const lists = [...byMethod.values()];
    for (let i = 0, got = 0; got < k && lists.some((l) => l.length); i++) {
      const l = lists[i % lists.length];
      const it = l.shift();
      if (it) { out.push(it.bidNtceNo!); got++; }
    }
  }
  console.log(`무작위 공고 ${out.length}건 (용역 ${share.Servc}, 공사 ${share.Cnstwk}, 물품 ${share.Thng} 목표; 후보 용역 ${pool.Servc.length}, 공사 ${pool.Cnstwk.length}, 물품 ${pool.Thng.length})`);
  return out;
}

const summary: string[] = [];

/** 입찰방식·계약방법·낙찰방법 조합이 실제로 어떻게 나오는지 최근 공고로 센다 (census, 또는 fields:공고번호) */
async function census(ids: string[]) {
  for (const no of ids) {
    const f = await findNotice(no);
    console.log(`\n=== ${no} 입찰공고정보서비스 필드`);
    if (f) for (const [k, v] of Object.entries(f.it)) if (v && !/^ntceSpec|Url/.test(k)) console.log(`  ${k}: ${String(v).slice(0, 120)}`);
    const d = f?.it.bidNtceDt?.slice(0, 10).replace(/-/g, "");
    if (d) {
      const q = new URLSearchParams({ type: "json", numOfRows: "999", pageNo: "1", bidNtceBgnDt: `${d}0000`, bidNtceEndDt: `${d}2359` });
      for (let page = 1; page <= 10; page++) {
        q.set("pageNo", String(page));
        try {
          const j = await (await fetch(`https://apis.data.go.kr/1230000/ao/PubDataOpnStdService/getDataSetOpnStdBidPblancInfo?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(60_000) })).json();
          const items: Item[] = j?.response?.body?.items ?? [];
          const hit = items.find((it) => it.bidNtceNo === no);
          if (hit) { console.log(`=== ${no} 표준서비스 필드`); for (const [k, v] of Object.entries(hit)) if (v) console.log(`  ${k}: ${String(v).slice(0, 120)}`); break; }
          if (items.length < 999) break;
        } catch { break; }
      }
    }
  }
  if (ids.length) return;
  const combo = new Map<string, { n: number; ex: string }>();
  let total = 0;
  for (let back = 1; back <= 5; back++) {
    const d = new Date(Date.now() + 9 * 3600_000 - back * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
    for (const op of ["Servc", "Cnstwk", "Thng"]) {
      for (let page = 1; page <= 5; page++) {
        const q = new URLSearchParams({ type: "json", numOfRows: "999", pageNo: String(page), inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359` });
        try {
          const j = await (await fetch(`https://apis.data.go.kr/1230000/ad/BidPublicInfoService02/getBidPblancListInfo${op}02?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(60_000) })).json();
          const items: Item[] = j?.response?.body?.items ?? [];
          for (const it of items) {
            total++;
            const k = [op, it.bidMethdNm ?? "-", it.cntrctCnclsMthdNm ?? "-", (it.sucsfbidMthdNm ?? "-").replace(/\s+/g, " ").slice(0, 40)].join(" | ");
            const c = combo.get(k) ?? { n: 0, ex: it.bidNtceNo ?? "" };
            c.n++; combo.set(k, c);
          }
          if (items.length < 999) break;
        } catch { break; }
      }
    }
  }
  console.log(`\n=== 최근 5일 공고 ${total}건: 업무 | 입찰방식(bidMethdNm) | 계약방법(cntrctCnclsMthdNm) | 낙찰방법(sucsfbidMthdNm 앞 40자) | 건수 | 예시`);
  for (const [k, c] of [...combo].sort((a, b) => b[1].n - a[1].n)) console.log(`${k} | ${c.n} | ${c.ex}`);
}

const fmt = (s: EvalSheet) => s.items.map((i) => `  - [${i.kind}/${i.group}] ${i.label} ${i.max}점${i.bands ? `\n      구간: ${i.bands.map((b) => `${b.cond}=${b.points}`).join(" | ")}` : ""}${i.criteria ? `\n      요소: ${i.criteria.join(" / ")}` : ""}`).join("\n");

async function one(label: string, bid: Bid, files: { name: string; text: string }[], basis: EvalBasis | undefined, client: Anthropic | undefined) {
  const named = files.map((f) => `=== 파일: ${f.name} ===\n${f.text}`).join("\n");
  const all = files.map((f) => f.text).join("\n");
  console.log(`\n==================== ${label}\n${bid.title} | ${bid.contractMethod} | 기술:가격 ${basis?.techRatio ?? "-"}:${basis?.priceRatio ?? "-"}`);
  for (const f of files) console.log(`파일: ${f.name} (${f.text.length}자)`);
  if (process.env.DUMP_TEXT) for (const f of files) console.log(`\n##### 원문 ${f.name}\n${f.text}\n##### 끝 ${f.name}`);
  const rule = extractSheet(all, templateSheet(bid, basis));
  console.log(`--- 규칙 파서: ${rule ? `${rule.items.length}개 항목, 화면 사용 ${adoptable(rule, basis) ? "가능" : "불가"}` : "없음"}`);
  if (rule) console.log(fmt(rule));
  const ruleOk = !!rule && adoptable(rule, basis);
  const signal = hasTableSignal(named);
  const tag = `${label.split(" ")[0]} | ${bid.bizType ?? ""} | ${(bid as unknown as { method?: string }).method ?? bid.contractMethod} | ${bid.title.slice(0, 40)}`;
  if (ruleOk) { summary.push(`원문(규칙) | ${tag}`); console.log("--- 규칙 파서로 화면 사용 가능: AI 생략"); return; }
  if (!files.length) { summary.push(`추정 | ${tag} | 첨부를 받지 못함`); return; }
  if (!signal) { summary.push(`추정 | ${tag} | 첨부에 배점표 신호 없음`); console.log("--- 배점표 신호 없음: AI 생략"); return; }
  const ex = excerpt(named);
  console.log(`--- 보낼 본문 ${ex.length}자 (원문 ${named.length}자), 배점표 신호 ${hasTableSignal(named) ? "있음" : "없음"}`);
  if (!client) { console.log("ANTHROPIC_API_KEY 없음: AI 판독 생략"); return; }
  const t0 = Date.now();
  let raw: unknown;
  const r = await readSheetWithAI(client, bid, ex, { model: process.env.AI_SHEET_MODEL || DEFAULT_AI_MODEL, techRatio: basis?.techRatio, priceRatio: basis?.priceRatio, onRaw: (o) => { raw = o; } });
  const ok = r.sheet && adoptable(r.sheet, basis);
  summary.push(`${ok ? "원문(AI)" : "추정"} | ${tag}${ok ? "" : ` | AI ${r.status}: ${r.reason ?? ""}`} | 토큰 ${r.usage?.input}/${r.usage?.output}`);
  console.log(`--- AI 판독 (${r.model}, ${((Date.now() - t0) / 1000).toFixed(0)}초, 토큰 입력 ${r.usage?.input} / 출력 ${r.usage?.output}): ${r.status}${r.reason ? ` - ${r.reason}` : ""}${r.sheet ? `, 화면 사용 ${ok ? "가능" : "불가"}` : ""}`);
  if (!r.sheet && raw) {
    const o = raw as { tech_total: unknown; price_total: unknown; pass: unknown; reason: string; items: { group: string; label: string; max: number; kind: string }[] };
    console.log(`AI 원답: 기술 ${o.tech_total} 가격 ${o.price_total} 통과 ${JSON.stringify(o.pass)} | ${o.reason}`);
    for (const i of o.items) console.log(`  - [${i.kind}/${i.group}] ${i.label} ${i.max}점`);
    const lines = ex.split("\n");
    const at = lines.findIndex((l) => /배\s*점/.test(l) && /(평가\s*항목|평가\s*요소|구\s*분|심사\s*항목)/.test(l));
    console.log(`--- 본문 (배점표 머리 부근)\n${lines.slice(Math.max(0, at - 5), at + 70).map((l) => `| ${l.slice(0, 160)}`).join("\n")}`);
  }
  if (r.sheet) console.log(`통과 ${JSON.stringify(r.sheet.pass)} | 위원 ${r.sheet.panelRule ?? "-"} | ${r.sheet.notes.join(" / ")}\n${fmt(r.sheet)}`);
}

async function main() {
  let args = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (args[0] === "census" || args[0]?.startsWith("fields:")) return census(args[0] === "census" ? [] : [args[0].slice(7), ...args.slice(1)]);
  const rnd = /^random:(\d+)$/.exec(args[0] ?? "");
  if (rnd) args = await randomNotices(Number(rnd[1]));
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
    const prof = methodProfile({ contractMethod: "적격심사", awardRaw: it.sucsfbidMthdNm, contractType: it.cntrctCnclsMthdNm });
    if (!prof.open) { console.log(`\n${a}: ${prof.closedReason} (${it.bidMethdNm} / ${it.cntrctCnclsMthdNm} / ${it.sucsfbidMthdNm}) → 평가점수 예측·AI 판독 제외`); summary.push(`제외 | ${a} | ${prof.closedReason}`); continue; }
    const att: BidAttachment[] = [];
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) att.push({ name: it[`ntceSpecFileNm${n}`] || `첨부 ${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: "규격서·기타" });
    const files: { name: string; text: string }[] = [];
    for (const f of rankFiles(att)) {
      try { const b = await download(f.url, 30_000); if (b) files.push({ name: f.name, text: await textOf(f, b) }); } catch (e) { console.log(`받기 실패 ${f.name}: ${e instanceof Error ? e.message : e}`); }
    }
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const bid = { id: `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`, method: it.sucsfbidMthdNm ?? "", title: it.bidNtceNm ?? a, agency: it.ntceInsttNm ?? "", contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: biz, baseAmount: Number(it.asignBdgtAmt || it.presmptPrce || 0), category: "기타 용역", lowerLimitRate: Number(it.sucsfbidLwltRate || 0) } as unknown as Bid;
    try { await one(`${bid.id} ${it.ntceInsttNm} (${it.sucsfbidMthdNm})`, bid, files, evalBasisOf(it), client); } catch (e) { summary.push(`오류 | ${bid.id} | ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`\n==================== 요약 ${summary.length}건\n${summary.join("\n")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
