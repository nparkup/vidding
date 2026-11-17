/** 임시: 공고 낙찰하한율 필드와 계약정보 주간 건수·크기 확인 (PR 머지 전 삭제, R2에 올리지 않음) */
import { gzipSync } from "zlib";
const KEY = process.env.DATA_GO_KR_SERVICE_KEY!;
const B = "https://apis.data.go.kr/1230000";
async function get(path: string, op: string, extra: Record<string, string>) {
  const qs = new URLSearchParams({ serviceKey: KEY, type: "json", ...extra });
  const t0 = Date.now();
  const r = await fetch(`${B}${path}/${op}?${qs}`, { signal: AbortSignal.timeout(90_000) });
  const text = await r.text();
  let j: any; try { j = JSON.parse(text); } catch { return { err: text.slice(0, 200), items: [], total: 0, bytes: text.length, ms: Date.now() - t0 }; }
  const body = j.response?.body; const raw = body?.items;
  const items: any[] = !raw ? [] : Array.isArray(raw) ? raw : raw.item ? [].concat(raw.item) : [];
  return { err: j.response?.header?.resultCode === "00" ? "" : JSON.stringify(j).slice(0, 200), items, total: Number(body?.totalCount ?? 0), bytes: text.length, ms: Date.now() - t0 };
}
const wk = (m: string, e: string) => ({ inqryDiv: "1", inqryBgnDt: `${m}0000`, inqryEndDt: `${e}2359` });
(async () => {
  const n = await get("/ad/BidPublicInfoService02", "getBidPblancListInfoServc02", { ...wk("20261102", "20261102"), numOfRows: "2", pageNo: "1" });
  console.log("## notice keys", n.err, Object.keys(n.items[0] ?? {}).join(","));
  for (const it of n.items) console.log("## notice lwlt", it.sucsfbidLwltRate, it.bidNtceNo);
  for (const op of ["Servc", "Cnstwk", "Thng", "Frgcpt"]) {
    const name = `getCntrctInfoList${op}`;
    let rows = 0, bytes = 0, ms = 0, calls = 0; const all: any[] = [];
    const first = await get("/ao/CntrctInfoService", name, { ...wk("20261102", "20261108"), numOfRows: "999", pageNo: "1" });
    calls++; rows += first.items.length; bytes += first.bytes; ms += first.ms; all.push(...first.items);
    console.log(`## ${name} week 2026-11-02 total=${first.total} err=${first.err}`);
    if (first.items[0]) console.log(JSON.stringify(first.items[0]));
    for (let p = 2; p <= Math.ceil(first.total / 999); p++) {
      const x = await get("/ao/CntrctInfoService", name, { ...wk("20261102", "20261108"), numOfRows: "999", pageNo: String(p) });
      calls++; rows += x.items.length; bytes += x.bytes; ms += x.ms; all.push(...x.items);
    }
    const gzFull = gzipSync(Buffer.from(JSON.stringify(all))).length;
    const slim = all.map((i) => [i.untyCntrctNo, i.bsnsDivNm, i.cntrctNm, i.cntrctCnclsMthdNm, i.totCntrctAmt ?? i.thtmCntrctAmt, i.cntrctCnclsDate, i.dminsttList ?? i.cntrctInsttNm, i.corpList, i.ntceNo ?? i.bidNtceNo, i.cntrctPrd]);
    const gzSlim = gzipSync(Buffer.from(JSON.stringify(slim))).length;
    console.log(`## ${name} rows=${rows} calls=${calls} respBytes=${bytes} ms=${ms} gzFull=${gzFull} gzSlim=${gzSlim}`);
    for (const [b, e] of [["20241104", "20241110"], ["20221107", "20221113"]]) {
      const y = await get("/ao/CntrctInfoService", name, { ...wk(b, e), numOfRows: "1", pageNo: "1" });
      console.log(`## ${name} week ${b} total=${y.total} err=${y.err}`);
    }
  }
})();
