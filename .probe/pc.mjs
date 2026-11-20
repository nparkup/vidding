// 임시 확인용 (PR 머지 전에 지운다). 키·대표자·전화·주소는 찍지 않는다
const KEY = process.env.K, B = "https://apis.data.go.kr/1613000/ApHusPrvCntrNoticeInfoOfferServiceV3/";
const d = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
async function call(op, p) {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "3", _type: "json", ...p });
  const t0 = Date.now();
  const t = await (await fetch(`${B}${op}?serviceKey=${encodeURIComponent(KEY)}&${qs}`)).text();
  let j; try { j = JSON.parse(t); } catch { console.log(op, JSON.stringify(p), "NONJSON", t.slice(0, 150)); return []; }
  const body = j.response?.body ?? {}; let it = body.items?.item ?? body.items ?? []; if (!Array.isArray(it)) it = [it];
  console.log(op, JSON.stringify(p), JSON.stringify(j.response?.header), "total", body.totalCount, "n", it.length, `${Date.now() - t0}ms`, JSON.stringify(it.map((x) => [x.pcNum, x.regDate, x.pcDate, x.pcAmount, x.codeClassifyType1, x.codeClassifyType2, x.codeClassifyType3, x.pcStDate, x.pcEdDate])));
  return it;
}
const scrub = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/Owner|Tel|Addr/.test(k)));
let s = [];
for (const p of [{ startDate: d(30), endDate: d(0) }, { searchYear: "2026" }, { startDate: d(30), endDate: d(0), searchYear: "2026" }, { regDate: d(3) }, {}]) { const r = await call("getRegDeSearchV3", p); if (r.length && !s.length) s = r; }
for (const p of [{ startDate: d(30), endDate: d(0) }, { searchYear: "2026" }]) await call("getCntrctDeSearchV3", p);
if (s[0]) console.log("SAMPLE", JSON.stringify(scrub(s[0])));
