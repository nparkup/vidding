// 임시 확인용 (PR 전에 지운다). 키·개인정보(담당자·전화)는 찍지 않는다
const KEY = process.env.K;
const B = "https://apis.data.go.kr/1613000/";
const N = "ApHusBidPblAncInfoOfferServiceV3", R = "ApHusBidResultNoticeInfoOfferServiceV3";
async function call(svc, op, p) {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "3", _type: "json", ...p });
  const url = `${B}${svc}/${op}?serviceKey=${encodeURIComponent(KEY)}&${qs}`;
  const t = await (await fetch(url)).text();
  let j; try { j = JSON.parse(t); } catch { console.log(`${svc.slice(0,12)} ${op} ${JSON.stringify(p)} -> NONJSON ${t.slice(0,200).replace(KEY,'***')}`); return []; }
  const body = j.response?.body ?? j.body ?? {};
  const hdr = j.response?.header ?? j.header ?? j.OpenAPI_ServiceResponse?.cmmMsgHeader;
  let items = body.items?.item ?? body.items ?? [];
  if (!Array.isArray(items)) items = [items];
  console.log(`${svc.slice(0,12)} ${op} ${JSON.stringify(p)} -> ${JSON.stringify(hdr)} total=${body.totalCount} n=${items.length}`);
  return items;
}
const scrub = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /competent|Tel|phone/i.test(k) ? "(가림)" : typeof v === "string" ? v.slice(0, 120) : v]));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
const ago = new Date(Date.now() + 9 * 3600e3 - 3 * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
let items = [];
for (const p of [{ startDate: ago, endDate: today }, { searchDate: today }, { bidRegDate: today }, { pblAncDe: today }, {}]) {
  const r = await call(N, "getPblAncDeSearchV3", p);
  if (r.length && !items.length) items = r;
}
if (items[0]) console.log("SAMPLE", JSON.stringify(scrub(items[0])));
for (const p of [{ startDate: ago, endDate: today }, { searchDate: today }, {}]) await call(N, "getBidClosDeSearchV3", p);
await call(N, "getBidKndSearchV3", { codeClassifyType1: "02", codeClassifyType2: "03", codeClassifyType3: "05" });
await call(N, "getBidKndSearchV3", { startDate: ago, endDate: today, codeClassifyType1: "02", codeClassifyType2: "03", codeClassifyType3: "05" });
await call(N, "getBidSttusSearchV3", { bidState: "1" });
// 큰 범위 총건수
await call(N, "getPblAncDeSearchV3", { startDate: ago, endDate: today, numOfRows: "1" });
const ago30 = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
await call(N, "getPblAncDeSearchV3", { startDate: ago30, endDate: today, numOfRows: "1" });
// 결과
let res = [];
for (const p of [{ startDate: ago30, endDate: today }, { bidTitle: "청소", searchYear: "2026" }, { searchYear: "2026" }]) {
  const r = await call(R, "getPblAncDeSearchV3", p);
  if (r.length && !res.length) res = r;
}
const rt = await call(R, "getBidPblAncNmSearchV3", { bidTitle: "청소", searchYear: "2026" });
if (!res.length) res = rt;
for (const p of [{ startDate: ago30, endDate: today }]) await call(R, "getBidClosDeSearchV3", p);
if (res[0]) {
  console.log("RSAMPLE", JSON.stringify(scrub(res[0])));
  console.log("RSTATES", JSON.stringify(res.map((x) => [x.bidState, x.amount, x.bidRegdate, x.bidDeadline])));
  const e = await call(R, "getBidEntrpsInfoSearchV3", { bidNum: res[0].bidNum, numOfRows: "50" });
  if (e[0]) console.log("ESAMPLE keys", Object.keys(e[0]).join(","), "winners", e.filter((x) => String(x.bidSuccessfulYn).startsWith("Y")).length, "of", e.length);
}
