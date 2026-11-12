import "server-only";
import { inflateRawSync } from "zlib";
import type { Bid, BidAttachment } from "../types";
import { extractSheet, templateSheet, type EvalSheet } from "../evalscore";

/**
 * 배포(빌드) 때 공고 첨부파일을 내려받아 평가표를 미리 추출한다.
 * 브라우저는 나라장터 파일을 직접 열 수 없어(CORS), 공고를 고르면 여기서 만든 평가표를 바로 쓴다.
 * - 읽는 형식: PDF(pdf.js), HWPX(압축 XML). 구형 HWP는 대개 PDF 변환본이 함께 올라와 그쪽을 읽는다.
 * - 평가 구조가 있는 계약방법(적격심사·협상)만, 평가기준이 있을 법한 파일 순서로 공고당 최대 3개.
 * - 전체 시간·파일 수 한도를 두고, 넘으면 남은 공고는 표준 평가표로 둔다.
 */

export interface ExtractedSheet {
  sheet: EvalSheet;
  file: string;
}

const LIKELY = /(평가|심사|제안요청|과업|공고문|입찰공고|규격)/;
const READABLE = /\.(pdf|hwpx)$/i;

function rankFiles(files: BidAttachment[]): BidAttachment[] {
  const score = (f: BidAttachment) =>
    (/(평가|심사)/.test(f.name) ? 4 : 0) + (/제안요청/.test(f.name) ? 3 : 0) + (/과업|규격/.test(f.name) ? 2 : 0) + (LIKELY.test(f.name) ? 1 : 0);
  return files.filter((f) => READABLE.test(f.name)).sort((a, b) => score(b) - score(a)).slice(0, 3);
}

async function download(url: string, timeoutMs: number): Promise<Buffer | null> {
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

async function textOf(f: BidAttachment, buf: Buffer): Promise<string> {
  return /\.pdf$/i.test(f.name) ? pdfText(buf) : hwpxText(buf);
}

export async function extractSheetsForBids(
  bids: Bid[],
  attachments: Record<string, BidAttachment[]>,
  opts: { budgetMs?: number; maxFiles?: number; concurrency?: number } = {},
): Promise<{ sheets: Record<string, ExtractedSheet>; stats: { bids: number; files: number; downloadFailed: number; found: number; timedOut: boolean } }> {
  const budget = Date.now() + (opts.budgetMs ?? 8 * 60_000);
  const maxFiles = opts.maxFiles ?? 2500;
  const targets = bids.filter((b) => (b.contractMethod === "적격심사" || b.contractMethod === "협상에 의한 계약") && attachments[b.id]?.length);
  const sheets: Record<string, ExtractedSheet> = {};
  const stats = { bids: targets.length, files: 0, downloadFailed: 0, found: 0, timedOut: false };
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      if (Date.now() > budget || stats.files >= maxFiles) { stats.timedOut = true; return; }
      const bid = targets[next++];
      const texts: string[] = [];
      let best: ExtractedSheet | undefined;
      for (const f of rankFiles(attachments[bid.id])) {
        stats.files++;
        try {
          const buf = await download(f.url, 20_000);
          if (!buf) { stats.downloadFailed++; continue; }
          texts.push(await textOf(f, buf));
        } catch {
          stats.downloadFailed++;
          continue;
        }
        const sheet = extractSheet(texts.join("\n"), templateSheet(bid));
        if (sheet && (!best || rankConfidence(sheet) > rankConfidence(best.sheet))) best = { sheet, file: f.name };
        if (best?.sheet.confidence === "높음") break;
      }
      // 공고문 속 다른 숫자를 배점으로 잘못 읽은 경우를 거르기 위해: 신뢰도 높음, 또는 보통이면서 실적·신용·가격 중 2가지 이상이 잡힌 표만 쓴다
      const core = best ? new Set(best.sheet.items.map((i) => i.kind).filter((k) => k === "performance" || k === "credit" || k === "price")).size : 0;
      if (best && (best.sheet.confidence === "높음" || (best.sheet.confidence === "보통" && core >= 2))) { sheets[bid.id] = best; stats.found++; }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  return { sheets, stats };
}

const rankConfidence = (s: EvalSheet) => ({ 높음: 3, 보통: 2, 낮음: 1 })[s.confidence] * 100 + s.items.length;
