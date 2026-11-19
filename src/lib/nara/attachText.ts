import { inflateRawSync } from "zlib";
import type { BidAttachment } from "../types";
import { hwpText } from "./hwpText";

/**
 * 공고 첨부파일 내려받기와 본문 텍스트 추출. 빌드(docExtract.ts)와 중계 서버(worker/corp-lookup ?aisheet=)가 함께 쓴다.
 * - 첨부는 모두 읽는다. 단 파일명이 똑같은 첨부(같은 파일이 두 번 올라온 경우)는 하나만 읽는다.
 * - 읽는 형식: PDF(pdf.js), HWPX(압축 XML), 구형 HWP(hwpText.ts), DOCX·XLSX(압축 XML), ZIP(안의 위 형식 파일들).
 *   그 밖의 형식(이미지 등)은 글을 읽을 수 없어 건너뛴다.
 */

const READABLE = /\.(pdf|hwpx|hwp|docx|xlsx|zip)$/i;

/** 읽을 순서: 평가기준이 있을 법한 파일부터 (모두 읽지만, 시간 한도에 걸리면 앞의 파일이 남도록) */
export function rankFiles(files: BidAttachment[]): BidAttachment[] {
  const score = (f: BidAttachment) =>
    (/(평가|심사)/.test(f.name) ? 4 : 0) + (/제안요청/.test(f.name) ? 3 : 0) + (/공고(문|서)|입찰\s*공고|입찰\s*설명/.test(f.name) || f.kind === "공고서" ? 3 : 0) + (/과업|규격/.test(f.name) ? 2 : 0) + (/(평가|심사|제안요청|과업|공고문|입찰공고|규격)/.test(f.name) ? 1 : 0);
  // 같은 문서가 HWP와 PDF로 함께 오면 둘 다 읽되 PDF를 먼저 (HWP는 표의 한 행이 한 줄로 나와 배점표가 더 깔끔하게 잡히기도 한다)
  const stem = (n: string) => n.replace(/\.[^.]+$/, "").replace(/\s+/g, "");
  const seen = new Set<string>();
  const readable = files.filter((f) => {
    const key = f.name.trim();
    if (!READABLE.test(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const converted = new Set(readable.filter((f) => !/\.hwp$/i.test(f.name)).map((f) => stem(f.name)));
  const twin = (f: BidAttachment) => /\.hwp$/i.test(f.name) && converted.has(stem(f.name));
  return readable.sort((a, b) => Number(twin(a)) - Number(twin(b)) || score(b) - score(a));
}

export async function download(url: string, timeoutMs: number): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "Mozilla/5.0 (bid-analysis build)" } });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 0 && buf.length < 30_000_000 ? buf : null;
}

/** Cloudflare Worker(중계 서버)에서 도는지. 그곳은 pdf.js 원본이 돌지 않아 서버리스용 묶음(unpdf)을 쓴다 */
const inWorker = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

async function pdfText(buf: Buffer): Promise<string> {
  type Doc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>; destroy?: () => Promise<void> };
  const doc = (inWorker
    ? await (await import("unpdf")).getDocumentProxy(new Uint8Array(buf), { useSystemFonts: false })
    : await (await import("pdfjs-dist/legacy/build/pdf.mjs")).getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false }).promise) as unknown as Doc;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const raw of content.items) {
      const it = raw as { str?: string; transform: number[] };
      if (typeof it.str !== "string" || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str });
      rows.set(y, row);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join(" ")));
  }
  await doc.destroy?.();
  return out.join("\n");
}

/** ZIP 항목 (HWPX·DOCX·XLSX·ZIP 공통) */
function zipEntries(buf: Buffer): { name: string; data: () => Buffer }[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: { name: string; data: () => Buffer }[] = [];
  for (let n = 0; n < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nlen);
    // 윈도우에서 만든 ZIP은 파일명이 EUC-KR(CP949)이다 (UTF-8 표시 비트가 없으면)
    let name = rawName.toString("utf8");
    if (!(flags & 0x800)) { try { name = new TextDecoder("euc-kr").decode(rawName); } catch { /* 확장자만 보면 된다 */ } }
    p += 46 + nlen + elen + clen;
    if (local + 30 > buf.length) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out.push({ name, data: () => { const raw = buf.subarray(start, start + csize); return method === 8 ? inflateRawSync(raw) : Buffer.from(raw); } });
  }
  return out;
}

/** 표 셀(tc)·행(tr)·문단(p)과 글자(t) 태그로 XML 본문을 줄로 (HWPX·DOCX 공통) */
function xmlLines(xmls: string[], tags: { t: string; tc: string; tr: string; p: string }): string[] {
  const lines: string[] = [];
  const re = new RegExp(`<(\\/?)(?:\\w+:)?(${tags.t}|${tags.tc}|${tags.tr}|${tags.p})\\b[^>]*?(\\/?)>|([^<]+)`, "g");
  for (const xml of xmls) {
    let cur = "";
    let tcDepth = 0;
    const flush = () => { const t = cur.replace(/\s+/g, " ").trim(); if (t) lines.push(t); cur = ""; };
    for (const m of xml.matchAll(re)) {
      if (m[4] !== undefined) continue;
      const [, close, tag, selfClose] = m;
      if (tag === tags.t && !close && !selfClose) {
        const end = xml.indexOf("<", (m.index ?? 0) + m[0].length);
        cur += decode(xml.slice((m.index ?? 0) + m[0].length, end));
      } else if (tag === tags.tc) {
        if (close) { tcDepth--; cur += "  "; } else if (!selfClose) tcDepth++;
      } else if (tag === tags.tr && close) flush();
      else if (tag === tags.p && close && tcDepth === 0) flush();
    }
    flush();
  }
  return lines;
}

const sorted = (parts: { name: string; xml: string }[]) => parts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((p) => p.xml);

/** HWPX: Contents/section*.xml 을 풀어 표의 행은 한 줄로, 문단은 한 줄씩 */
export function hwpxText(buf: Buffer): string {
  const parts = zipEntries(buf).filter((e) => /^Contents\/section\d+\.xml$/.test(e.name)).map((e) => ({ name: e.name, xml: e.data().toString("utf8") }));
  return xmlLines(sorted(parts), { t: "t", tc: "tc", tr: "tr", p: "p" }).join("\n");
}

function docxText(buf: Buffer): string {
  const doc = zipEntries(buf).find((e) => e.name === "word/document.xml");
  return doc ? xmlLines([doc.data().toString("utf8")], { t: "t", tc: "tc", tr: "tr", p: "p" }).join("\n") : "";
}

/** XLSX: 시트마다 행을 한 줄로 (공유 문자열과 바로 적힌 값) */
function xlsxText(buf: Buffer): string {
  const entries = zipEntries(buf);
  const ss = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const shared = ss ? [...ss.data().toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""))) : [];
  const sheets = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).map((e) => ({ name: e.name, xml: e.data().toString("utf8") }));
  const lines: string[] = [];
  for (const xml of sorted(sheets)) {
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [...row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
        const v = /<v>([^<]*)<\/v>/.exec(c[2] ?? "")?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(c[2] ?? "")?.[1] ?? "";
        return /t="s"/.test(c[1]) ? shared[Number(v)] ?? "" : decode(v);
      }).filter((s) => s.trim());
      if (cells.length) lines.push(cells.join("  "));
    }
  }
  return lines.join("\n");
}

const decode = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** 압축 파일 안의 문서들: 각 문서 앞에 이름 머리글을 붙인다. 같은 이름은 하나만, 압축 안의 압축은 한 단계만 */
async function zipText(buf: Buffer, depth: number): Promise<string> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of zipEntries(buf)) {
    const base = e.name.split("/").pop() ?? e.name;
    if (!READABLE.test(base) || seen.has(base) || (depth > 0 && /\.zip$/i.test(base))) continue;
    seen.add(base);
    try {
      const t = await textOfName(base, e.data(), depth + 1);
      if (t.trim()) out.push(`--- 압축 안 파일: ${base} ---\n${t}`);
    } catch { /* 읽지 못한 파일은 건너뛴다 */ }
  }
  return out.join("\n");
}

async function textOfName(name: string, buf: Buffer, depth = 0): Promise<string> {
  if (/\.pdf$/i.test(name)) return pdfText(buf);
  if (/\.hwp$/i.test(name)) return hwpText(buf).text;
  if (/\.hwpx$/i.test(name)) return hwpxText(buf);
  if (/\.docx$/i.test(name)) return docxText(buf);
  if (/\.xlsx$/i.test(name)) return xlsxText(buf);
  if (/\.zip$/i.test(name)) return zipText(buf, depth);
  return "";
}

export async function textOf(f: BidAttachment, buf: Buffer): Promise<string> {
  return textOfName(f.name, buf);
}
