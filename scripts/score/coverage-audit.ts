/**
 * (임시) 평가 기준 추출 범위 점검: 최근 공고 표본의 첨부를 모두 받아 원문 전체와, 운영 파이프라인(빌드 추출·화면 기준)이 뽑은 결과를 함께 저장한다.
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/coverage-audit.ts 20261119,20261120 5
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";
import type { Bid, BidAttachment, BizType } from "../../src/lib/types";
import { adoptable, bidSheet, evalBasisOf } from "../../src/lib/criteria";
import { extractSheetsForBids } from "../../src/lib/nara/docExtract";
import { download, rankFiles, textOf } from "../../src/lib/nara/attachText";
import { excerpt, hasTableSignal, readSheetWithAI } from "../../src/lib/nara/aiSheet";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const OPS: Record<string, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng" };
const BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02";

async function api(op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number; raw: unknown }> {
  const q = new URLSearchParams({ type: "json", numOfRows: "999", pageNo: "1", ...params });
  let j: { response?: { body?: { items?: unknown; totalCount?: string } } } = {};
  for (let t = 0; t < 4; t++) {
    try { j = await (await fetch(`${BASE}/${op}?serviceKey=${KEY}&${q}`, { signal: AbortSignal.timeout(90_000) })).json(); break; }
    catch (e) { if (t === 3) return { items: [], total: 0, raw: String(e) }; await new Promise((r) => setTimeout(r, 4000 * (t + 1))); }
  }
  const b = j.response?.body;
  const items: Item[] = Array.isArray(b?.items) ? (b!.items as Item[]) : [];
  return { items, total: Number(b?.totalCount ?? 0), raw: j };
}

async function list(op: string, day: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let p = 1; p < 10; p++) {
    const r = await api(`getBidPblancListInfo${op}02`, { pageNo: String(p), inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359` });
    out.push(...r.items);
    if (!r.items.length || out.length >= r.total) break;
  }
  return out;
}

const LOCAL = /(특별시|광역시|특별자치|도청|시청|군청|구청|교육청|교육지원청|[가-힣]+(시|군|구)$|[가-힣]+(시|군|구)\s)/;

async function pdfPages(buf: Buffer): Promise<number | undefined> {
  try {
    const doc = await (await import("pdfjs-dist/legacy/build/pdf.mjs")).getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
    const n = doc.numPages;
    await doc.destroy();
    return n;
  } catch { return undefined; }
}

async function main() {
  const days = (process.argv[2] ?? "").split(",").filter(Boolean);
  const per = Number(process.argv[3] ?? 5);
  const rows: { biz: BizType; it: Item }[] = [];
  for (const biz of Object.keys(OPS) as BizType[]) for (const d of days) for (const it of await list(OPS[biz], d)) rows.push({ biz, it });
  // 같은 공고의 최신 차수만
  const latest = new Map<string, { biz: BizType; it: Item }>();
  for (const r of rows) { const k = r.it.bidNtceNo!; if (!latest.has(k) || (latest.get(k)!.it.bidNtceOrd ?? "") < (r.it.bidNtceOrd ?? "")) latest.set(k, r); }
  const cands = [...latest.values()].filter((r) => /^(적격|협상)/.test(r.it.sucsfbidMthdNm ?? "") && r.it.ntceSpecDocUrl1);
  console.log(`대상 공고 ${cands.length}건 (적격·협상, 첨부 있음)`);
  // 첨부 수 분포 (10개 칸이 다 찼는지)
  const full = cands.filter((r) => r.it.ntceSpecDocUrl10).length;
  console.log(`첨부 10칸 모두 찬 공고 ${full}건`);
  const pick: typeof cands = [];
  for (const biz of Object.keys(OPS)) for (const loc of [true, false]) for (const nego of [false, true]) {
    const g = cands.filter((r) => r.biz === biz && LOCAL.test(r.it.ntceInsttNm ?? "") === loc && /^협상/.test(r.it.sucsfbidMthdNm ?? "") === nego);
    const n = nego ? Math.ceil(per * 0.6) : per;
    for (let i = 0; i < n && i < g.length; i++) pick.push(g[Math.floor((i * g.length) / n)]);
  }
  console.log(`표본 ${pick.length}건`);
  const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : undefined;
  const dump: Record<string, unknown> = {};
  let probed = 0;
  for (const { biz, it } of pick) {
    const id = `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;
    const files: BidAttachment[] = [];
    const std = it.stdNtceDocUrl;
    for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) files.push({ name: it[`ntceSpecFileNm${n}`] || `첨부파일 ${n}`, url: it[`ntceSpecDocUrl${n}`]!, kind: it[`ntceSpecDocUrl${n}`] === std ? "공고서" : "규격서·기타" });
    if (std && !files.some((f) => f.url === std)) files.unshift({ name: "표준 공고서", url: std, kind: "공고서" });
    // e발주 첨부 등 다른 첨부 조회가 있는지 (앞의 몇 건만 원문 응답 저장)
    const extra: Record<string, unknown> = {};
    if (probed < 6) {
      probed++;
      for (const op of ["getBidPblancListInfoEorderAtchFileInfo02", "getBidPblancListInfoAtchFileInfo02"]) {
        const r = await api(op, { inqryDiv: "2", bidNtceNo: it.bidNtceNo!, numOfRows: "50" });
        extra[op] = r.items.length ? r.items : r.raw;
      }
    }
    const metas: { name: string; ext: string; bytes?: number; pages?: number; chars?: number; error?: string; text?: string }[] = [];
    for (const f of rankFiles(files)) {
      const m: (typeof metas)[number] = { name: f.name, ext: (f.name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase() };
      try {
        const buf = await download(f.url, 30_000);
        if (!buf) m.error = "받지 못함";
        else {
          m.bytes = buf.length;
          if (m.ext === "pdf") m.pages = await pdfPages(buf);
          const t = await textOf(f, buf);
          m.chars = t.length;
          m.text = t;
        }
      } catch (e) { m.error = (e as Error).message.slice(0, 160); }
      metas.push(m);
    }
    // 읽을 수 없는 형식도 기록
    const skipped = files.filter((f) => !rankFiles([f]).length).map((f) => f.name);
    const nego = /^협상/.test(it.sucsfbidMthdNm ?? "");
    const amt = Number(it.asignBdgtAmt || it.presmptPrce || 0);
    const bid = { id, title: it.bidNtceNm, agency: it.ntceInsttNm, postedAt: it.bidNtceDt ?? "", contractMethod: nego ? "협상에 의한 계약" : "적격심사", bizType: biz, baseAmount: amt, category: "기타 용역", lowerLimitRate: Number(it.sucsfbidLwltRate) || undefined } as unknown as Bid;
    const basis = evalBasisOf(it);
    let named = "";
    const r = await extractSheetsForBids([bid], { [id]: files }, { budgetMs: 600_000, concurrency: 1, collect: (_b, text) => { named = text; } });
    const ex = r.sheets[id];
    const act = bidSheet(bid, basis, { extracted: ex?.sheet, notice: ex?.notice, quant: ex?.quant });
    const adopt = !!(ex?.sheet && adoptable(ex.sheet, basis));
    let ai: unknown;
    if (!adopt && named && hasTableSignal(named) && client) {
      try { ai = await readSheetWithAI(client, { id, title: it.bidNtceNm ?? "", contractMethod: bid.contractMethod, agency: it.ntceInsttNm ?? "", baseAmount: amt || undefined }, excerpt(named), { techRatio: basis?.techRatio, priceRatio: basis?.priceRatio }); }
      catch (e) { ai = { status: "error", reason: (e as Error).message }; }
    }
    console.log(`${id}\t${biz}\t${nego ? "협상" : "적격"}\t파일 ${metas.filter((m) => m.text !== undefined).length}/${files.length}\t${adopt ? "원문표" : "추정"}\tAI ${(ai as { status?: string })?.status ?? "-"}\t${it.bidNtceNm?.slice(0, 40)}`);
    dump[id] = { biz, it, files: metas, skipped, extra, pipeline: { extracted: ex, adopt, act, aiSignal: named ? hasTableSignal(named) : false, excerptLen: named ? excerpt(named).length : 0, namedLen: named.length, ai } };
  }
  mkdirSync("audit/out", { recursive: true });
  writeFileSync("audit/out/coverage.json.gz", gzipSync(JSON.stringify(dump)));
}
main().catch((e) => { console.error(e); process.exit(1); });
