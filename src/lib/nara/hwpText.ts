import { inflateRawSync } from "zlib";
import CFB from "cfb";

/**
 * 한글(HWP 5.x, 구형 바이너리) 본문 텍스트 추출.
 * HWP 5.x 는 OLE 복합 문서: BodyText/Section0..N 스트림(대개 raw deflate 압축) 안에 레코드가 이어진다.
 * - 문단 글자(HWPTAG_PARA_TEXT, 67): UTF-16LE. 0~31 코드는 제어 문자이고, 그중 일부는 8글자(16바이트)를 차지한다.
 * - 표: HWPTAG_TABLE(77) 아래 셀마다 문단 리스트 헤더(HWPTAG_LIST_HEADER, 72)가 오고 행·열 주소가 들어 있다.
 *   HWPX 추출과 같게 표의 한 행은 한 줄로(셀 사이는 공백 두 칸), 표 밖 문단은 한 줄씩 낸다.
 * - 배포용 문서(암호화된 ViewText)는 본문을 읽지 못하고, 앞부분 미리보기(PrvText)만 돌려준다.
 * 근거: 한글과컴퓨터 "한글 문서 파일 형식 5.0" 공개 문서.
 */

const TAG_PARA_TEXT = 67;
const TAG_LIST_HEADER = 72;
const TAG_TABLE = 77;

/** 8글자(16바이트)를 차지하는 인라인·확장 제어 문자 */
const WIDE_CTRL = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

export interface HwpResult {
  text: string;
  /** body: 본문 전체, preview: 배포용·손상 문서라 미리보기만, none: 읽지 못함 */
  source: "body" | "preview" | "none";
  reason?: string;
}

interface Rec { tag: number; level: number; data: Buffer }

function records(buf: Buffer): Rec[] {
  const out: Rec[] = [];
  let p = 0;
  while (p + 4 <= buf.length) {
    const h = buf.readUInt32LE(p);
    p += 4;
    const tag = h & 0x3ff, level = (h >>> 10) & 0x3ff;
    let size = h >>> 20;
    if (size === 0xfff) { if (p + 4 > buf.length) break; size = buf.readUInt32LE(p); p += 4; }
    if (p + size > buf.length) break;
    out.push({ tag, level, data: buf.subarray(p, p + size) });
    p += size;
  }
  return out;
}

function paraText(data: Buffer): string {
  let s = "";
  for (let i = 0; i + 1 < data.length; ) {
    const c = data.readUInt16LE(i);
    if (c < 32) {
      if (c === 9) s += " ";
      else if (c === 10) s += " ";
      i += WIDE_CTRL.has(c) ? 16 : 2;
      continue;
    }
    s += String.fromCharCode(c);
    i += 2;
  }
  return s;
}

/** 셀의 문단 리스트 헤더에서 행 주소를 읽는다. 문단 수 필드가 2바이트·4바이트인 문서가 섞여 있어 둘 다 시도한다 */
function cellRow(data: Buffer): { row: number; col: number } | undefined {
  for (const off of [8, 6]) {
    if (data.length < off + 8) continue;
    const col = data.readUInt16LE(off), row = data.readUInt16LE(off + 2), cs = data.readUInt16LE(off + 4), rs = data.readUInt16LE(off + 6);
    if (cs >= 1 && rs >= 1 && cs < 200 && rs < 500 && col < 200 && row < 2000) return { row, col };
  }
  return undefined;
}

function sectionLines(recs: Rec[]): string[] {
  const lines: string[] = [];
  const clean = (t: string) => t.replace(/\s+/g, " ").trim();
  const push = (t: string) => { const c = clean(t); if (c) lines.push(c); };

  // 표 안: 셀별 글자를 모았다가 표가 끝나면 행 단위로 낸다
  type Table = { level: number; rows: Map<number, { col: number; text: string[] }[]>; cell?: { col: number; text: string[] } };
  const tables: Table[] = [];
  const endTablesAbove = (level: number) => {
    while (tables.length && level < tables[tables.length - 1].level) {
      const t = tables.pop()!;
      const rowLines = [...t.rows.entries()].sort((a, b) => a[0] - b[0])
        .map(([, cells]) => cells.sort((a, b) => a.col - b.col).map((c) => clean(c.text.join(" "))).filter(Boolean).join("  "));
      if (tables.length && tables[tables.length - 1].cell) tables[tables.length - 1].cell!.text.push(...rowLines);
      else rowLines.forEach(push);
    }
  };

  for (const r of recs) {
    endTablesAbove(r.level);
    const t = tables[tables.length - 1];
    if (r.tag === TAG_TABLE) {
      tables.push({ level: r.level, rows: new Map() });
      continue;
    }
    if (r.tag === TAG_LIST_HEADER && t && r.level === t.level) {
      const pos = cellRow(r.data);
      if (!pos) continue;
      const cell = { col: pos.col, text: [] as string[] };
      const row = t.rows.get(pos.row) ?? [];
      row.push(cell);
      t.rows.set(pos.row, row);
      t.cell = cell;
      continue;
    }
    if (r.tag === TAG_PARA_TEXT) {
      const s = paraText(r.data);
      if (t?.cell) t.cell.text.push(s);
      else push(s);
    }
  }
  endTablesAbove(-1);
  return lines;
}

const stream = (cfb: CFB.CFB$Container, path: string) => {
  const e = CFB.find(cfb, path);
  return e?.content ? Buffer.from(e.content as Uint8Array) : undefined;
};

function previewText(cfb: CFB.CFB$Container): string {
  const b = stream(cfb, "/PrvText");
  return b ? b.toString("utf16le").replace(/\0/g, "").replace(/<([^<>]*)>/g, "$1  ").trim() : "";
}

export function hwpText(buf: Buffer): HwpResult {
  let cfb: CFB.CFB$Container;
  try { cfb = CFB.read(buf, { type: "buffer" }); } catch { return { text: "", source: "none", reason: "HWP 파일이 아닙니다." }; }
  const header = stream(cfb, "/FileHeader");
  if (!header || !header.subarray(0, 17).toString("latin1").startsWith("HWP Document File")) return { text: "", source: "none", reason: "HWP 5 형식이 아닙니다." };
  const props = header.readUInt32LE(36);
  const compressed = (props & 1) !== 0;
  if (props & 2) return { text: previewText(cfb), source: "preview", reason: "암호가 걸린 문서입니다." };
  if (props & 4) return { text: previewText(cfb), source: "preview", reason: "배포용 문서라 미리보기만 읽었습니다." };

  const lines: string[] = [];
  for (let n = 0; n < 500; n++) {
    const raw = stream(cfb, `/BodyText/Section${n}`);
    if (!raw) break;
    let data: Buffer;
    try { data = compressed ? inflateRawSync(raw) : raw; } catch { continue; }
    lines.push(...sectionLines(records(data)));
  }
  if (!lines.length) {
    const prv = previewText(cfb);
    return prv ? { text: prv, source: "preview", reason: "본문을 읽지 못해 미리보기만 읽었습니다." } : { text: "", source: "none", reason: "본문이 비어 있습니다." };
  }
  return { text: lines.join("\n"), source: "body" };
}
