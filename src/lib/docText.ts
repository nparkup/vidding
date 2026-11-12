"use client";

/**
 * 브라우저에서 공고 첨부파일의 텍스트를 뽑는다. 파일은 서버로 보내지 않는다.
 * 지원: PDF(pdf.js), HWPX·DOCX(압축 XML), TXT. HWP(구형 바이너리)는 PDF로 저장하거나 본문을 붙여 넣어야 한다.
 * 표는 행 단위로 한 줄에 모아 "평가항목 … 배점"이 한 줄로 읽히게 한다.
 */

export interface DocText {
  name: string;
  kind: "pdf" | "hwpx" | "docx" | "txt";
  text: string;
  pages?: number;
}

export class UnsupportedDocError extends Error {}

export async function readDocument(file: File): Promise<DocText> {
  const name = file.name;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return { name, kind: "pdf", ...(await readPdf(await file.arrayBuffer())) };
  if (ext === "hwpx") return { name, kind: "hwpx", text: await readZipXml(await file.arrayBuffer(), /^Contents\/section\d+\.xml$/) };
  if (ext === "docx") return { name, kind: "docx", text: await readZipXml(await file.arrayBuffer(), /^word\/document\.xml$/) };
  if (ext === "txt" || ext === "csv") return { name, kind: "txt", text: await file.text() };
  if (ext === "hwp") throw new UnsupportedDocError("HWP(구형) 파일은 한글에서 PDF 또는 HWPX로 저장한 뒤 올려 주세요. 본문을 복사해 붙여 넣어도 됩니다.");
  throw new UnsupportedDocError(`${ext.toUpperCase() || "이"} 형식은 아직 읽을 수 없습니다. PDF·HWPX·DOCX·TXT를 올려 주세요.`);
}

/* ---------- PDF ---------- */

async function readPdf(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // 같은 높이(y)의 글자를 한 줄로 모은다
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str });
      rows.set(y, row);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, r]) => out.push(r.sort((a, b) => a.x - b.x).map((c) => c.s.trim()).join(" ")));
  }
  return { text: out.join("\n"), pages: doc.numPages };
}

/* ---------- ZIP + XML (HWPX, DOCX) ---------- */

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 중앙 디렉터리를 읽어 이름이 맞는 항목을 순서대로 푼다 */
async function unzipMatching(buf: ArrayBuffer, pattern: RegExp): Promise<{ name: string; data: Uint8Array }[]> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new UnsupportedDocError("압축 구조를 읽지 못했습니다. 파일이 손상되었는지 확인해 주세요.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const hits: { name: string; data: Uint8Array }[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!pattern.test(name)) continue;
    const lnlen = dv.getUint16(local + 26, true);
    const lelen = dv.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    hits.push({ name, data: method === 8 ? await inflate(raw) : raw });
  }
  return hits.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function readZipXml(buf: ArrayBuffer, pattern: RegExp): Promise<string> {
  const parts = await unzipMatching(buf, pattern);
  if (!parts.length) throw new UnsupportedDocError("문서 본문을 찾지 못했습니다.");
  const dec = new TextDecoder();
  const lines: string[] = [];
  for (const part of parts) {
    const xml = new DOMParser().parseFromString(dec.decode(part.data), "application/xml");
    walk(xml.documentElement, lines);
  }
  return lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

/** 표의 행(tr)은 셀을 이어 한 줄로, 표 밖의 문단(p)은 한 줄씩 */
function walk(el: Element, lines: string[]) {
  for (const child of Array.from(el.children)) {
    const tag = child.localName;
    if (tag === "tr") {
      const cells = Array.from(child.children).filter((c) => c.localName === "tc");
      lines.push(cells.map(textOf).join("  "));
    } else if (tag === "p" && !child.querySelector("tbl")) {
      lines.push(textOf(child));
    } else {
      walk(child, lines);
    }
  }
}

function textOf(el: Element): string {
  const parts: string[] = [];
  const visit = (e: Element) => {
    for (const c of Array.from(e.children)) {
      if (c.localName === "t") parts.push(c.textContent ?? "");
      else if (c.localName === "p" && parts.length) { parts.push(" "); visit(c); }
      else visit(c);
    }
  };
  visit(el);
  return parts.join("");
}
