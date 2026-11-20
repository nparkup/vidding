// 임시 확인용 2차 (PR 머지 전에 지운다)
const KEY = process.env.K, B = "https://apis.data.go.kr/1613000/ApHusPrvCntrNoticeInfoOfferServiceV3/";
async function call(op, p) {
  const qs = new URLSearchParams({ pageNo: "1", numOfRows: "3", _type: "json", ...p });
  const t = await (await fetch(`${B}${op}?serviceKey=${encodeURIComponent(KEY)}&${qs}`)).text();
  let j; try { j = JSON.parse(t); } catch { console.log(op, JSON.stringify(p), "NONJSON", t.slice(0, 150)); return []; }
  const body = j.response?.body ?? {}; let it = body.items?.item ?? body.items ?? []; if (!Array.isArray(it)) it = [it];
  console.log(op, JSON.stringify(p), j.response?.header?.resultCode, "total", body.totalCount, "n", it.length, JSON.stringify(it.map((x) => [x.pcNum, x.kaptCode, x.regDate, x.pcDate, x.pcAmount, x.codeClassifyType3, x.pcTitle])));
  return it;
}
const tries = [
  ["getHsmpCdSearchV3", { kaptCode: "A10027003" }], ["getHsmpCdSearchV3", { aptCode: "A10027003" }], ["getHsmpCdSearchV3", { kaptCode: "A10027003", searchYear: "2025" }],
  ["getHsmpNmSearchV3", { kaptName: "천년나무" }], ["getHsmpNmSearchV3", { bidKaptname: "천년나무" }],
  ["getCntrctNmSearchV3", { pcTitle: "청소" }], ["getCntrctNmSearchV3", { pcTitle: "청소", searchYear: "2026" }], ["getCntrctNmSearchV3", { bidTitle: "청소", searchYear: "2026" }],
  ["getCntrctEntrpsSearchV3", { companyName: "용역" }],
  ["getCntrctPdSearchV3", { startDate: "20260101", endDate: "20261231" }], ["getCntrctPdSearchV3", { pcStDate: "20260101", pcEdDate: "20261231" }],
  ["getRegDeSearchV3", { regDate: "2026-11-17" }], ["getRegDeSearchV3", { startRegDate: "20261001", endRegDate: "20261120" }], ["getRegDeSearchV3", { srchStartDate: "20261001", srchEndDate: "20261120" }], ["getRegDeSearchV3", { startDate: "2026-10-01", endDate: "2026-11-20" }], ["getRegDeSearchV3", { searchYear: "2026", searchMonth: "10" }],
  ["getCntrctDeSearchV3", { pcDate: "20261015" }], ["getCntrctDeSearchV3", { startDate: "20250101", endDate: "20251231" }],
];
for (const [op, p] of tries) await call(op, p);
