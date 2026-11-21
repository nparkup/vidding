import { inflateRawSync } from "zlib";
import type { BidAttachment } from "../types";
import { hwpText } from "./hwpText";

/**
 * 공고 첨부파일 내려받기와 본문 텍스트 추출. 빌드(docExtract.ts)와 중계 서버(worker/corp-lookup ?aisheet=)가 함께 쓴다.
 * - 첨부는 모두 읽는다. 단 파일명이 똑같은 첨부(같은 파일이 두 번 올라온 경우)는 하나만 읽는다.
 * - 읽는 형식: PDF(pdf.js), HWPX(압축 XML), 구형 HWP(hwpText.ts), DOCX·XLSX(압축 XML), ZIP(안의 위 형식 파일들).
 *   그 밖의 형식(이미지 등)은 글을 읽을 수 없어 건너뛴다.
 */

export const READABLE = /\.(pdf|hwpx|hwp|docx|xlsx|zip)$/i;

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

/**
 * 압축 풀기 한도 (압축 폭탄·빌드 메모리 대비). 공고 첨부 압축은 보통 문서 몇 개, 수십 MB 안쪽이다.
 * - 항목은 앞에서부터 ZIP_MAX_ENTRIES 개까지만 본다. 한 항목은 풀린 크기 ZIP_MAX_ENTRY 까지, 압축 하나에서 푸는 양은 모두 ZIP_MAX_TOTAL 까지.
 * - 압축률이 비정상(1000배 넘게 줄어든 항목)이면 풀지 않는다.
 */
export const ZIP_MAX_ENTRIES = 500;
export const ZIP_MAX_ENTRY = 60_000_000;
export const ZIP_MAX_TOTAL = 150_000_000;

export interface ZipEntry { name: string; method: number; flags: number; csize: number; usize: number; data: () => Buffer }

/**
 * 압축 파일명 읽기. UTF-8 표시 비트가 있거나 올바른 UTF-8이면 UTF-8(맥·리눅스에서 만든 압축은 표시 없이 UTF-8),
 * 아니면 윈도우 한글 압축의 EUC-KR(CP949). 0x7075(유니코드 경로) 확장 필드가 있으면 그것을 쓴다.
 */
function entryName(raw: Buffer, flags: number, extra: Buffer): string {
  for (let q = 0; q + 4 <= extra.length;) {
    const id = extra.readUInt16LE(q), len = extra.readUInt16LE(q + 2);
    if (id === 0x7075 && len > 5 && q + 4 + len <= extra.length) return extra.subarray(q + 9, q + 4 + len).toString("utf8");
    q += 4 + len;
  }
  if (flags & 0x800) return raw.toString("utf8");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(raw); } catch { /* UTF-8 아님 */ }
  try { return new TextDecoder("euc-kr").decode(raw); } catch { /* 이 환경에 EUC-KR 해독기가 없으면 */ }
  // 해독기가 없으면 바이트를 그대로 16진수로 (같은 이름 가리기는 그대로 맞고, 확장자는 ASCII라 남는다)
  const dot = raw.lastIndexOf(0x2e);
  return dot >= 0 && raw.subarray(dot).every((c) => c < 0x80) ? `${raw.subarray(0, dot).toString("hex")}${raw.subarray(dot).toString("latin1")}` : raw.toString("hex");
}

/** 풀린 크기가 cap 을 넘으면 멈춘다. maxOutputLength 를 모르는 환경(중계 서버의 zlib 호환층)이면 풀고 나서 크기를 본다 */
function inflateCapped(raw: Buffer, cap: number): Buffer {
  let data: Buffer;
  try {
    data = inflateRawSync(raw, { maxOutputLength: cap });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) throw new Error("압축 항목이 너무 큼");
    data = inflateRawSync(raw);
  }
  if (data.length > cap) throw new Error("압축 항목이 너무 큼");
  return data;
}

/** ZIP 항목 (HWPX·DOCX·XLSX·ZIP 공통). ZIP64 머리와 확장 필드도 읽는다 */
function zipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  let count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  // ZIP64: 항목 수나 목록 위치가 넘쳤으면 ZIP64 끝 레코드에서 읽는다
  if ((count === 0xffff || p === 0xffffffff) && eocd >= 20 && buf.readUInt32LE(eocd - 20) === 0x07064b50) {
    const r = Number(buf.readBigUInt64LE(eocd - 12));
    if (r + 56 <= buf.length && buf.readUInt32LE(r) === 0x06064b50) { count = Number(buf.readBigUInt64LE(r + 32)); p = Number(buf.readBigUInt64LE(r + 48)); }
  }
  const out: ZipEntry[] = [];
  let unpacked = 0;
  for (let n = 0; n < Math.min(count, ZIP_MAX_ENTRIES) && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    let local = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nlen);
    const extra = buf.subarray(p + 46 + nlen, p + 46 + nlen + elen);
    // ZIP64 확장 필드(0x0001): 넘친 값만 차례대로 들어 있다
    for (let q = 0; q + 4 <= extra.length;) {
      const id = extra.readUInt16LE(q), len = extra.readUInt16LE(q + 2);
      if (id === 0x0001) {
        let r = q + 4;
        const big = () => { const v = r + 8 <= q + 4 + len ? Number(extra.readBigUInt64LE(r)) : -1; r += 8; return v; };
        if (usize === 0xffffffff) usize = big();
        if (csize === 0xffffffff) csize = big();
        if (local === 0xffffffff) local = big();
      }
      q += 4 + len;
    }
    const name = entryName(rawName, flags, extra);
    p += 46 + nlen + elen + clen;
    if (local < 0 || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (csize < 0 || start + csize > buf.length) continue;
    out.push({
      name, method, flags, csize, usize,
      data: () => {
        if (flags & 1) throw new Error("암호가 걸린 압축 항목");
        if (method !== 0 && method !== 8) throw new Error(`지원하지 않는 압축 방식 ${method}`);
        if (usize > ZIP_MAX_ENTRY || (csize > 0 && usize / csize > 1000)) throw new Error("압축 항목이 너무 큼");
        if (unpacked + usize > ZIP_MAX_TOTAL) throw new Error("압축 안 파일 전체가 너무 큼");
        const raw = buf.subarray(start, start + csize);
        // 머리에 적힌 크기를 믿지 않고 실제로 풀리는 양도 막는다
        const data = method === 8 ? inflateCapped(raw, Math.min(ZIP_MAX_ENTRY, ZIP_MAX_TOTAL - unpacked)) : Buffer.from(raw);
        unpacked += data.length;
        return data;
      },
    });
  }
  return out;
}

/** 압축 항목 정보 (시험·진단용) */
export function zipInfo(buf: Buffer): Omit<ZipEntry, "data">[] {
  return zipEntries(buf).map(({ data: _d, ...e }) => e);
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

/** 압축 안에서 읽을 문서 수 한도 (도면 묶음처럼 문서가 아주 많은 압축) */
const ZIP_MAX_DOCS = 40;
export const ZIP_HEAD = "--- 압축 안 파일: ";

/**
 * 압축 파일 안의 문서들: 각 문서 앞에 이름 머리글(ZIP_HEAD)을 붙인다.
 * 평가기준이 있을 법한 문서부터 읽고, 같은 이름은 하나만, 압축 안의 압축은 한 단계만 더 연다.
 * 맥에서 만든 압축의 __MACOSX·._ 부속 파일은 건너뛴다.
 */
async function zipText(buf: Buffer, depth: number): Promise<string> {
  const entries = zipEntries(buf).filter((e) => !/(^|\/)__MACOSX\//.test(e.name) && !/(^|\/)\._/.test(e.name) && !e.name.endsWith("/"));
  const byName = new Map(entries.map((e) => [baseName(e.name), e]));
  const files = rankFiles([...byName.keys()].map((name) => ({ name, url: name, kind: "규격서·기타" as const })))
    .filter((f) => depth === 0 || !/\.zip$/i.test(f.name))
    .slice(0, ZIP_MAX_DOCS);
  const out: string[] = [];
  for (const f of files) {
    try {
      const t = await textOfName(f.name, byName.get(f.name)!.data(), depth + 1);
      if (t.trim()) out.push(`${ZIP_HEAD}${f.name} ---\n${t}`);
    } catch { /* 읽지 못한 파일(암호·너무 큼·깨짐)은 건너뛴다 */ }
  }
  return out.join("\n");
}

const baseName = (n: string) => (n.split("/").pop() ?? n).trim();

/**
 * 같은 파일명은 하나만 읽는다: 압축 밖 첨부나 앞서 읽은 다른 압축에 같은 이름이 있는 압축 안 문서(같은 공고문이 따로도,
 * 압축 안에도 올라온 경우)는 본문에서 뺀다. seen 에는 공고의 첨부 이름을 넣어 두고, 남긴 압축 안 문서 이름이 더해진다.
 * 압축 본문은 캐시에 통째로 두고 공고마다 합칠 때 이것으로 거른다.
 */
export function dropRepeatedEntries(text: string, seen: Set<string>): string {
  if (!text.startsWith(ZIP_HEAD)) return text;
  const out: string[] = [];
  let keep = true;
  for (const line of text.split("\n")) {
    if (line.startsWith(ZIP_HEAD) && line.endsWith(" ---")) {
      const name = line.slice(ZIP_HEAD.length, -4).trim();
      keep = !seen.has(name);
      seen.add(name);
    }
    if (keep) out.push(line);
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
