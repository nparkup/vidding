/** 임시: 기초금액·예정가격 API 응답 필드와 주간 건수 확인 (PR 머지 전 삭제) */
const KEY = process.env.DATA_GO_KR_SERVICE_KEY!;
const B = "https://apis.data.go.kr/1230000";
async function probe(path: string, op: string, extra: Record<string, string>) {
  const qs = new URLSearchParams({ serviceKey: KEY, type: "json", numOfRows: "3", pageNo: "1", ...extra });
  const t0 = Date.now();
  try {
    const r = await fetch(`${B}${path}/${op}?${qs}`, { signal: AbortSignal.timeout(60_000) });
    const text = await r.text();
    let j: any; try { j = JSON.parse(text); } catch { console.log(`## ${op} HTTP ${r.status} ${text.slice(0, 300)}`); return; }
    const body = j.response?.body; const raw = body?.items;
    const items = !raw ? [] : Array.isArray(raw) ? raw : raw.item ? [].concat(raw.item) : [];
    console.log(`## ${path}/${op} ${JSON.stringify(extra)} code=${j.response?.header?.resultCode} ${j.response?.header?.resultMsg ?? JSON.stringify(j).slice(0, 200)} total=${body?.totalCount} ${Date.now() - t0}ms`);
    for (const it of items.slice(0, 2)) console.log(JSON.stringify(it));
  } catch (e) { console.log(`## ${op} error ${e}`); }
}
const wk = { inqryDiv: "1", inqryBgnDt: "202611020000", inqryEndDt: "202611082359" };
(async () => {
  for (const o of ["Servc", "Cnstwk", "Thng"]) await probe("/ad/BidPublicInfoService02", `getBidPblancListInfo${o}BsisAmount02`, wk);
  for (const o of ["Servc", "Cnstwk", "Thng"]) await probe("/as/ScsbidInfoService", `getOpengResultListInfo${o}PreparPcDetail`, wk);
  for (const o of ["Servc", "Cnstwk", "Thng"]) await probe("/as/ScsbidInfoService", `getOpengResultListInfo${o}`, wk);
  await probe("/as/ScsbidInfoService", "getScsbidListSttusServc", wk);
  await probe("/ao/PubDataOpnStdService", "getDataSetOpnStdScsbidInfo", { opengBgnDt: "202611020000", opengEndDt: "202611032359", bsnsDivCd: "5" });
  await probe("/ao/PubDataOpnStdService", "getDataSetOpnStdScsbidInfo", { opengBgnDt: "202611020000", opengEndDt: "202611022359" });
})();
