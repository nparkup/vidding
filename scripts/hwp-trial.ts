/**
 * 임시 시험: 구형 HWP 공고서를 읽는 방법 비교 (PR 확인용, 머지 전에 지운다).
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/hwp-trial.ts
 *
 * 방법
 *  A. 자체 파서(src/lib/nara/hwpText.ts, 레코드 직접 해석)
 *  B. PrvText 미리보기만
 *  C. LibreOffice + H2Orestart 로 PDF 변환 후 기존 PDF 추출기 (soffice 가 있을 때만)
 * 평가
 *  - 같은 공고서가 hwp·pdf 로 함께 올라온 공고: pdf 글자를 기준으로 낱말 재현율, 평가표 추출 결과 일치
 *  - hwp 만 있는 공고: 본문을 읽었는지, 평가표·참가자격 문단을 찾았는지
 */
import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { call, recentDays } from "../src/lib/nara/client";
import { hwpText } from "../src/lib/nara/hwpText";
import { pdfText } from "../src/lib/nara/docExtract";
import { extractSheet } from "../src/lib/evalscore";

type Item = Record<string, string | undefined>;
const PATH = "/ad/BidPublicInfoService02";
const OPS = ["getBidPblancListInfoServc02", "getBidPblancListInfoCnstwk02", "getBidPblancListInfoThng02"];
const MAX_EACH = Number(process.env.TRIAL_MAX ?? 25);
const work = join(tmpdir(), "hwp-trial");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

function filesOf(it: Item) {
  const out: { name: string; url: string }[] = [];
  for (let n = 1; n <= 10; n++) if (it[`ntceSpecDocUrl${n}`]) out.push({ name: it[`ntceSpecFileNm${n}`] ?? "", url: it[`ntceSpecDocUrl${n}`]! });
  return out;
}
const base = (n: string) => n.replace(/\.[^.]+$/, "").replace(/\s+/g, "");
const ext = (n: string) => (n.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();

async function download(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Mozilla/5.0 (bid-analysis build)" } });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length ? b : null;
  } catch { return null; }
}

/** 2글자 이상 한글·영문·숫자 낱말 */
const words = (t: string) => new Set((t.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []));
function recall(ref: string, got: string): number {
  const r = words(ref), g = words(got);
  if (!r.size) return NaN;
  let hit = 0;
  for (const w of r) if (g.has(w)) hit++;
  return hit / r.size;
}
const sheetSig = (t: string) => {
  const s = extractSheet(t);
  return s ? { conf: s.confidence, items: s.items.map((i) => `${i.label.replace(/\s/g, "")}:${i.max}`).sort() } : undefined;
};
const QUAL_RE = /입찰\s*참가\s*자격|참가\s*자격/;

let soffice = "";
try { execFileSync("soffice", ["--version"], { stdio: "pipe" }); soffice = "soffice"; } catch { /* 없음 */ }

async function main() {
  // 1. 최근 공고에서 hwp 공고서 찾기
  const items: Item[] = [];
  for (const day of recentDays(5)) for (const op of OPS) {
    try {
      items.push(...(await call(PATH, op, { inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359`, numOfRows: "999" })).items);
    } catch (e) { console.warn("목록 실패", day, op, (e as Error).message); }
  }
  const pairs: { id: string; hwp: { name: string; url: string }; pdf: { name: string; url: string } }[] = [];
  const only: { id: string; hwp: { name: string; url: string } }[] = [];
  let bidsWithHwpNotice = 0, bidsTotal = 0;
  for (const it of items) {
    bidsTotal++;
    const fs = filesOf(it);
    const notices = fs.filter((f) => /공고/.test(f.name));
    const hwps = notices.filter((f) => ext(f.name) === "hwp");
    if (!hwps.length) continue;
    bidsWithHwpNotice++;
    const id = `${it.bidNtceNo}-${it.bidNtceOrd}`;
    const h = hwps[0];
    const p = fs.find((f) => ext(f.name) === "pdf" && base(f.name) === base(h.name));
    const otherReadable = notices.some((f) => ["pdf", "hwpx"].includes(ext(f.name)));
    if (p && pairs.length < MAX_EACH) pairs.push({ id, hwp: h, pdf: p });
    else if (!otherReadable && only.length < MAX_EACH) only.push({ id, hwp: h });
  }
  const hwpOnlyBids = items.filter((it) => {
    const n = filesOf(it).filter((f) => /공고/.test(f.name));
    return n.some((f) => ext(f.name) === "hwp") && !n.some((f) => ["pdf", "hwpx"].includes(ext(f.name)));
  }).length;

  const rows: Record<string, unknown>[] = [];
  const agg = { A: { ms: 0, n: 0, body: 0, preview: 0, none: 0, recall: [] as number[], sheetSame: 0, sheetPdf: 0, sheetHwp: 0, qual: 0 }, B: { recall: [] as number[], nonEmpty: 0 }, C: { ms: 0, n: 0, ok: 0, recall: [] as number[], sheetSame: 0, sheetHwp: 0 } };
  let downloadFailed = 0;

  async function run(kind: "pair" | "only", id: string, hwp: { name: string; url: string }, pdf?: { name: string; url: string }) {
    const hb = await download(hwp.url);
    if (!hb) { downloadFailed++; return; }
    const pb = pdf ? await download(pdf.url) : null;
    const file = join(work, `${id}.hwp`);
    writeFileSync(file, hb);
    const t0 = Date.now();
    const a = hwpText(hb);
    const aMs = Date.now() - t0;
    agg.A.ms += aMs; agg.A.n++; agg.A[a.source]++;
    let prv = "";
    try { prv = previewOnly(hb); } catch { prv = ""; }
    if (prv) agg.B.nonEmpty++;
    const row: Record<string, unknown> = { kind, id, file: hwp.name.slice(0, 40), kb: Math.round(hb.length / 1024), A: a.source, Achars: a.text.length, Ams: aMs };
    if (QUAL_RE.test(a.text)) agg.A.qual++;
    const sa = sheetSig(a.text);
    if (sa) agg.A.sheetHwp++;
    row.Asheet = sa ? `${sa.conf}/${sa.items.length}` : "-";
    let ref = "";
    if (pb) {
      ref = await pdfText(pb).catch(() => "");
      const rA = recall(ref, a.text), rB = recall(ref, prv);
      if (!Number.isNaN(rA)) agg.A.recall.push(rA);
      if (!Number.isNaN(rB)) agg.B.recall.push(rB);
      const sp = sheetSig(ref);
      if (sp) agg.A.sheetPdf++;
      if (sp && sa && JSON.stringify(sp.items) === JSON.stringify(sa.items)) agg.A.sheetSame++;
      Object.assign(row, { pdfChars: ref.length, recallA: Math.round(rA * 100), recallB: Math.round(rB * 100), pdfSheet: sp ? `${sp.conf}/${sp.items.length}` : "-" });
    }
    if (soffice) {
      const t1 = Date.now();
      try {
        const out = join(work, "lo");
        mkdirSync(out, { recursive: true });
        execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", out, file], { stdio: "pipe", timeout: 120_000 });
        const c = await pdfText(readFileSync(join(out, `${id}.pdf`)));
        const ms = Date.now() - t1;
        agg.C.ms += ms; agg.C.n++;
        if (c.trim().length > 50) agg.C.ok++;
        const sc = sheetSig(c);
        if (sc) agg.C.sheetHwp++;
        if (ref) {
          const rC = recall(ref, c);
          if (!Number.isNaN(rC)) agg.C.recall.push(rC);
          const sp = sheetSig(ref);
          if (sp && sc && JSON.stringify(sp.items) === JSON.stringify(sc.items)) agg.C.sheetSame++;
          row.recallC = Math.round(rC * 100);
        }
        Object.assign(row, { Cchars: c.length, Cms: ms, Csheet: sc ? `${sc.conf}/${sc.items.length}` : "-" });
      } catch (e) {
        agg.C.ms += Date.now() - t1; agg.C.n++;
        row.C = `실패: ${(e as Error).message.slice(0, 60)}`;
      }
    }
    rows.push(row);
  }

  for (const p of pairs) await run("pair", p.id, p.hwp, p.pdf);
  for (const o of only) await run("only", o.id, o.hwp);

  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 1000) / 10 : null);
  const min = (a: number[]) => (a.length ? Math.round(Math.min(...a) * 1000) / 10 : null);
  console.log("\n===== HWP 시험 결과 (행별) =====");
  for (const r of rows) console.log(JSON.stringify(r));
  console.log("\n===== HWP 시험 요약 =====");
  console.log(JSON.stringify({
    공고수: bidsTotal, hwp공고서있는공고: bidsWithHwpNotice, hwp만있는공고: hwpOnlyBids,
    시험: { 쌍: pairs.length, hwp만: only.length, 다운로드실패: downloadFailed },
    A자체파서: { 파일: agg.A.n, 본문: agg.A.body, 미리보기만: agg.A.preview, 실패: agg.A.none, 평균ms: agg.A.n ? Math.round(agg.A.ms / agg.A.n) : null, 낱말재현율평균: avg(agg.A.recall), 최저: min(agg.A.recall), 평가표_pdf에서: agg.A.sheetPdf, 평가표_hwp에서: agg.A.sheetHwp, 평가표_pdf와같음: agg.A.sheetSame, 참가자격문단: agg.A.qual },
    B미리보기: { 비어있지않음: agg.B.nonEmpty, 낱말재현율평균: avg(agg.B.recall) },
    C리브레오피스: soffice ? { 파일: agg.C.n, 읽힘: agg.C.ok, 평균ms: agg.C.n ? Math.round(agg.C.ms / agg.C.n) : null, 낱말재현율평균: avg(agg.C.recall), 최저: min(agg.C.recall), 평가표_hwp에서: agg.C.sheetHwp, 평가표_pdf와같음: agg.C.sheetSame } : "soffice 없음",
  }));
}

/** 본문을 읽은 파일도 미리보기만으로는 얼마나 되는지 비교하려고 PrvText 만 따로 꺼낸다 */
function previewOnly(buf: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const CFB = require("cfb");
  const c = CFB.read(buf, { type: "buffer" });
  const e = CFB.find(c, "/PrvText");
  return e?.content ? Buffer.from(e.content).toString("utf16le").replace(/\0/g, "") : "";
}

main().catch((e) => { console.error(e); process.exit(1); });
