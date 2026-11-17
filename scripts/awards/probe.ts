/** 임시: 5~10년 전 주의 API 제공 여부·건수 확인 (PR 머지 전 삭제, R2에 올리지 않음) */
const KEY = process.env.DATA_GO_KR_SERVICE_KEY!;
const B = "https://apis.data.go.kr/1230000";
async function total(path: string, op: string, m: string, e: string) {
  const qs = new URLSearchParams({ serviceKey: KEY, type: "json", inqryDiv: "1", inqryBgnDt: `${m}0000`, inqryEndDt: `${e}2359`, numOfRows: "1", pageNo: "1" });
  try {
    const r = await fetch(`${B}${path}/${op}?${qs}`, { signal: AbortSignal.timeout(60_000) });
    const t = await r.text();
    try { const j = JSON.parse(t); const h = j.response?.header; return h?.resultCode === "00" ? String(j.response.body?.totalCount ?? 0) : `ERR ${JSON.stringify(j).slice(0, 120)}`; } catch { return `ERR ${t.slice(0, 120)}`; }
  } catch (e) { return `ERR ${e}`; }
}
const ops = ["Servc", "Cnstwk", "Thng"];
const kinds: [string, string, (o: string) => string, string[]][] = [
  ["award", "/as/ScsbidInfoService", (o) => `getScsbidListSttus${o}`, ops],
  ["notice", "/ad/BidPublicInfoService02", (o) => `getBidPblancListInfo${o}02`, ops],
  ["base", "/ad/BidPublicInfoService02", (o) => `getBidPblancListInfo${o}BsisAmount02`, ops],
  ["plan", "/as/ScsbidInfoService", (o) => `getOpengResultListInfo${o}PreparPcDetail`, ops],
  ["rgn", "/ad/BidPublicInfoService02", () => "getBidPblancListInfoPrtcptPsblRgn02", ["all"]],
  ["lic", "/ad/BidPublicInfoService02", () => "getBidPblancListInfoLicenseLimit02", ["all"]],
];
const weeks = [["20161107", "20161113"], ["20171106", "20171112"], ["20181105", "20181111"], ["20191104", "20191110"], ["20201102", "20201108"], ["20211108", "20211114"], ["20241104", "20241110"]];
(async () => {
  for (const [m, e] of weeks) {
    const parts: string[] = [];
    for (const [k, path, op, os] of kinds) for (const o of os) parts.push(`${k}/${o}=${await total(path, op(o), m, e)}`);
    console.log(`## ${m} ${parts.join(" ")}`);
  }
})();
