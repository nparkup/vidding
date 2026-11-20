// 임시 확인용 2차 (PR 전에 지운다). 키·개인정보는 찍지 않는다
const KEY = process.env.K;
const B = "https://apis.data.go.kr/1613000/";
const N = "ApHusBidPblAncInfoOfferServiceV3", R = "ApHusBidResultNoticeInfoOfferServiceV3";
async function call(svc, op, p, quiet) {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "3", _type: "json", ...p });
  const t = await (await fetch(`${B}${svc}/${op}?serviceKey=${encodeURIComponent(KEY)}&${qs}`)).text();
  let j; try { j = JSON.parse(t); } catch { console.log(`${op} ${JSON.stringify(p)} NONJSON ${t.slice(0, 150)}`); return { items: [], total: 0 }; }
  const body = j.response?.body ?? j.body ?? {};
  let items = body.items?.item ?? body.items ?? [];
  if (!Array.isArray(items)) items = [items];
  if (!quiet) console.log(`${svc.slice(5, 12)} ${op} ${JSON.stringify(p)} total=${body.totalCount} n=${items.length} first=${JSON.stringify(items.slice(0, 3).map((x) => [x.bidNum, x.bidRegdate ?? x.bidRegDate, x.bidDeadline, x.bidState, x.codeClassifyType3, x.amount]))}`);
  return { items, total: Number(body.totalCount) || 0 };
}
const d = (n) => new Date(Date.now() + 9 * 3600e3 - n * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
// 공고 서비스: 30일 전체 받아 분류·마감 분포
const all = [];
for (let p = 1; p <= 3; p++) all.push(...(await call(N, "getPblAncDeSearchV3", { startDate: d(30), endDate: d(0), numOfRows: "999", pageNo: String(p) }, true)).items);
const now = Date.now();
const open = all.filter((x) => new Date(String(x.bidDeadline).replace(" ", "T") + "+09:00").getTime() > now);
const cnt = (arr, f) => Object.entries(arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
console.log("ALL", all.length, "OPEN", open.length);
console.log("CLS", JSON.stringify(cnt(open, (x) => `${x.codeClassifyType1}/${x.codeClassifyType2}/${x.codeClassifyType3}`)));
console.log("STATE", JSON.stringify(cnt(all, (x) => x.bidState)), "AUTH", JSON.stringify(cnt(all, (x) => x.codeAuth)), "SUC", JSON.stringify(cnt(all, (x) => x.codeSucWay)));
console.log("REGDATES", JSON.stringify(cnt(all, (x) => x.bidRegDate).slice(0, 40)));
console.log("AREAS", JSON.stringify(cnt(all, (x) => x.bidArea)));
console.log("DUPNUM", all.length - new Set(all.map((x) => x.bidNum)).size);
const s = open.find((x) => x.codeClassifyType3 === "05");
if (s) console.log("CLEAN", JSON.stringify({ ...s, bidContent: String(s.bidContent).slice(0, 300) }));
// 40일 이상 범위 허용?
await call(N, "getPblAncDeSearchV3", { startDate: d(90), endDate: d(0), numOfRows: "1" });
// 공고 서비스 분류 검색 변수
for (const p of [{ searchYear: "2026", codeClassifyType1: "02", codeClassifyType2: "03", codeClassifyType3: "05" }, { codeClassifyType1: "02" }, { startDate: d(10), endDate: d(0), codeClassifyType1: "02" }]) await call(N, "getBidKndSearchV3", p);
// 결과 서비스: 날짜 변수 후보
for (const p of [{ searchYear: "2026", startDate: d(30), endDate: d(0) }, { searchYear: "2026", searchMonth: "11" }, { bidRegdate: d(5) }, { startDe: d(30), endDe: d(0) }, { searchYear: "2026", bidTitle: "경비" }]) await call(R, "getPblAncDeSearchV3", p);
for (const p of [{ searchYear: "2026", startDate: d(30), endDate: d(0) }, { searchYear: "2026" }]) await call(R, "getBidClosDeSearchV3", p);
for (const p of [{ searchYear: "2026", codeClassifyType1: "02", codeClassifyType2: "03", codeClassifyType3: "05" }, { codeClassifyType1: "02", codeClassifyType2: "03", codeClassifyType3: "05" }]) await call(R, "getBidKndSearchV3", p);
const apt = open[0]?.aptCode;
for (const p of [{ aptCode: apt }, { aptCode: apt, searchYear: "2026" }, { aptCode: apt, searchYear: "2025" }]) await call(R, "getHsmpCdSearchV3", p);
for (const p of [{ bidState: "5", searchYear: "2026" }, { bidState: "5" }]) await call(R, "getBidSttusSearchV3", p);
// 이름 검색 결과의 연도 분포
const t = await call(R, "getBidPblAncNmSearchV3", { bidTitle: "청소", searchYear: "2026", numOfRows: "999" }, true);
console.log("R청소2026", t.total, "deadline years", JSON.stringify(cnt(t.items, (x) => String(x.bidDeadline).slice(0, 7))), "states", JSON.stringify(cnt(t.items, (x) => x.bidState)), "cls3", JSON.stringify(cnt(t.items, (x) => x.codeClassifyType3)), "withAmt", t.items.filter((x) => Number(x.amount) > 0).length);
const t2 = await call(R, "getBidPblAncNmSearchV3", { bidTitle: "청소", searchYear: "2025", numOfRows: "1" }, true);
const t3 = await call(R, "getBidPblAncNmSearchV3", { bidTitle: "경비", searchYear: "2025", numOfRows: "1" }, true);
const t4 = await call(R, "getBidPblAncNmSearchV3", { bidTitle: "", searchYear: "2025", numOfRows: "1" }, true);
console.log("R totals 청소2025", t2.total, "경비2025", t3.total, "전체2025", t4.total);
// 공고 → 결과 bidNum 일치? 마감 지난 공고 하나
const past = all.find((x) => !open.includes(x) && x.codeClassifyType3 === "05");
if (past) { const r = await call(R, "getBidPblAncNmSearchV3", { bidTitle: past.bidTitle, searchYear: "2026", numOfRows: "50" }, true); console.log("JOIN", past.bidNum, r.items.some((x) => x.bidNum === past.bidNum), r.items.filter((x) => x.bidNum === past.bidNum).map((x) => [x.bidState, x.amount, x.contractPeriodSdate, x.contractPeriodEdate])); }
