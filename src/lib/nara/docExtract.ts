import "server-only";
import { inflateRawSync } from "zlib";
import type { Bid, BidAttachment } from "../types";
import { extractQuantBlock, extractSheet, templateSheet, type EvalItem, type EvalSheet } from "../evalscore";
import { readNoticeCriteria, type NoticeCriteria } from "../noticeCriteria";
import type { AiInput } from "./aiSheet";
import { hwpText } from "./hwpText";

/**
 * 배포(빌드) 때 공고 첨부파일을 내려받아 평가표를 미리 추출한다.
 * 브라우저는 나라장터 파일을 직접 열 수 없어(CORS), 공고를 고르면 여기서 만든 평가표를 바로 쓴다.
 * - 읽는 형식: PDF(pdf.js), HWPX(압축 XML), 구형 HWP(hwpText.ts, 2026-11-16 실제 공고서 50건 시험: 모두 본문 읽힘, 같은 공고 PDF 대비 낱말 93%).
 * - 평가 구조가 있는 계약방법(적격심사·협상)만, 평가기준이 있을 법한 파일 순서로 공고당 최대 3개.
 *   공고서(공고문)는 배점표가 없어도 적용 기준·통과점수 같은 그 공고의 기준을 적고 있어 꼭 읽는다.
 * - 전체 시간·파일 수 한도를 두고, 넘으면 남은 공고는 표준 평가표로 둔다.
 */

export interface ExtractedSheet {
  /** 첨부에서 읽은 배점표 (없을 수 있다. 쓸지는 화면에서 criteria.ts adoptable 로 가린다) */
  sheet?: EvalSheet;
  file?: string;
  /** 공고서 문장에서 읽은 이 공고의 기준 (적용 기준·통과점수·낙찰하한율·기준비율·실적 인정 범위 등) */
  notice?: NoticeCriteria;
  /** 협상 제안요청서의 정량평가 표 */
  quant?: { items: EvalItem[]; total: number; quote: string };
  /** 규칙 파서가 배점표를 못 읽은 공고의 AI 판독 입력 (/ai-input/{공고}.json 으로 나간다) */
  ai?: AiInput;
}

const LIKELY = /(평가|심사|제안요청|과업|공고문|입찰공고|규격)/;
const READABLE = /\.(pdf|hwpx|hwp)$/i;

export function rankFiles(files: BidAttachment[]): BidAttachment[] {
  const score = (f: BidAttachment) =>
    (/(평가|심사)/.test(f.name) ? 4 : 0) + (/제안요청/.test(f.name) ? 3 : 0) + (/공고(문|서)|입찰\s*공고|입찰\s*설명/.test(f.name) || f.kind === "공고서" ? 3 : 0) + (/과업|규격/.test(f.name) ? 2 : 0) + (LIKELY.test(f.name) ? 1 : 0);
  // 같은 문서가 HWP와 PDF로 함께 오면 PDF를 먼저 읽고, 평가표를 확실히 못 찾았을 때 HWP도 읽어 신뢰도가 높은 쪽을 쓴다
  // (HWP는 표의 한 행이 한 줄로 나와 PDF보다 배점표가 깔끔하게 잡히는 경우가 있다)
  const stem = (n: string) => n.replace(/\.[^.]+$/, "").replace(/\s+/g, "");
  const readable = files.filter((f) => READABLE.test(f.name));
  const converted = new Set(readable.filter((f) => !/\.hwp$/i.test(f.name)).map((f) => stem(f.name)));
  // 변환본이 있는 HWP는 다른 문서보다 뒤에 둔다 (공고당 3개 한도 안에서 다른 문서를 먼저 읽도록)
  const twin = (f: BidAttachment) => /\.hwp$/i.test(f.name) && converted.has(stem(f.name));
  return readable
    .sort((a, b) => Number(twin(a)) - Number(twin(b)) || score(b) - score(a))
    .slice(0, 3);
}

export async function download(url: string, timeoutMs: number): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "Mozilla/5.0 (bid-analysis build)" } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length < 30_000_000 ? buf : null;
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str });
      rows.set(y, row);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join(" ")));
  }
  await doc.destroy();
  return out.join("\n");
}

/** HWPX: Contents/section*.xml 을 풀어 표의 행은 한 줄로, 문단은 한 줄씩 */
export function hwpxText(buf: Buffer): string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return "";
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const parts: { name: string; xml: string }[] = [];
  for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    p += 46 + nlen + elen + clen;
    if (!/^Contents\/section\d+\.xml$/.test(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    parts.push({ name, xml: (method === 8 ? inflateRawSync(raw) : raw).toString("utf8") });
  }
  parts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  // 태그를 순서대로 훑으며: 글자(t)는 이어 붙이고, 셀(tc) 끝은 공백, 행(tr) 끝과 표 밖 문단(p) 끝은 줄바꿈
  const lines: string[] = [];
  for (const { xml } of parts) {
    let cur = "";
    let tcDepth = 0;
    const flush = () => { const t = cur.replace(/\s+/g, " ").trim(); if (t) lines.push(t); cur = ""; };
    for (const m of xml.matchAll(/<(\/?)(?:\w+:)?(t|tc|tr|p)\b[^>]*?(\/?)>|([^<]+)/g)) {
      if (m[4] !== undefined) continue;
      const [, close, tag, selfClose] = m;
      if (tag === "t" && !close && !selfClose) {
        const end = xml.indexOf("<", (m.index ?? 0) + m[0].length);
        cur += decode(xml.slice((m.index ?? 0) + m[0].length, end));
      } else if (tag === "tc") {
        if (close) { tcDepth--; cur += "  "; } else if (!selfClose) tcDepth++;
      } else if (tag === "tr" && close) flush();
      else if (tag === "p" && close && tcDepth === 0) flush();
    }
    flush();
  }
  return lines.join("\n");
}

const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export async function textOf(f: BidAttachment, buf: Buffer): Promise<string> {
  if (/\.pdf$/i.test(f.name)) return pdfText(buf);
  if (/\.hwp$/i.test(f.name)) return hwpText(buf).text;
  return hwpxText(buf);
}

export async function extractSheetsForBids(
  bids: Bid[],
  attachments: Record<string, BidAttachment[]>,
  opts: {
    budgetMs?: number; maxFiles?: number; concurrency?: number;
    /** 공고마다 읽은 본문(파일 이름 머리글 포함)과 규칙 파서 결과를 넘긴다 (AI 판독 대상 고르기, aiSheet.ts) */
    collect?: (bid: Bid, text: string, ruleSheet: EvalSheet | undefined) => void;
  } = {},
): Promise<{ sheets: Record<string, ExtractedSheet>; stats: { bids: number; files: number; downloadFailed: number; found: number; notice: number; timedOut: boolean } }> {
  const budget = Date.now() + (opts.budgetMs ?? 8 * 60_000);
  const maxFiles = opts.maxFiles ?? 2500;
  const targets = bids.filter((b) => (b.contractMethod === "적격심사" || b.contractMethod === "협상에 의한 계약") && attachments[b.id]?.length);
  const sheets: Record<string, ExtractedSheet> = {};
  const stats = { bids: targets.length, files: 0, downloadFailed: 0, found: 0, notice: 0, timedOut: false };
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      if (Date.now() > budget || stats.files >= maxFiles) { stats.timedOut = true; return; }
      const bid = targets[next++];
      const texts: string[] = [];
      const named: string[] = [];
      let best: ExtractedSheet | undefined;
      for (const f of rankFiles(attachments[bid.id])) {
        stats.files++;
        try {
          const buf = await download(f.url, 20_000);
          if (!buf) { stats.downloadFailed++; continue; }
          const t = await textOf(f, buf);
          texts.push(t);
          named.push(`=== 파일: ${f.name} ===\n${t}`);
        } catch {
          stats.downloadFailed++;
          continue;
        }
        const sheet = extractSheet(texts.join("\n"), templateSheet(bid));
        if (sheet && (!best?.sheet || rankConfidence(sheet) > rankConfidence(best.sheet))) best = { sheet, file: f.name };
      }
      if (!texts.length) continue;
      const all = texts.join("\n");
      const notice = readNoticeCriteria(all);
      const quant = bid.contractMethod === "협상에 의한 계약" ? extractQuantBlock(all) : undefined;
      // 배점표는 합계가 100에서 크게 벗어나면 버린다 (쓸지 최종 판단은 화면에서 공고 기준 값과 함께 한다)
      const sum = best?.sheet ? best.sheet.items.reduce((a, i) => a + i.max, 0) : 0;
      const keep = best?.sheet && sum >= 90 && sum <= 110 ? best : undefined;
      opts.collect?.(bid, named.join("\n"), keep?.sheet);
      if (keep || notice || quant) {
        sheets[bid.id] = { ...(keep ?? {}), notice, quant };
        if (keep) stats.found++;
        if (notice) stats.notice++;
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  return { sheets, stats };
}

const rankConfidence = (s: EvalSheet): number => ({ 높음: 3, 보통: 2, 낮음: 1 })[s.confidence] * 100 + s.items.length;
