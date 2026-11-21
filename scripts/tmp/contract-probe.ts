import { call } from "../../src/lib/nara/client";
const d = "20261119";
for (const op of ["getCntrctInfoListServc", "getCntrctInfoListCnstwk", "getCntrctInfoListThng"]) {
  const r = await call("/ao/CntrctInfoService", op, { inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359`, numOfRows: "200", pageNo: "1" });
  const items = r.items as Record<string, string>[];
  const pick = items.find((x) => !/수의/.test(x.cntrctCnclsMthdNm ?? "") && x.ntceNo) ?? items[0];
  const keys = new Set<string>(); const filled: Record<string, number> = {};
  for (const it of items) for (const [k, v] of Object.entries(it)) { keys.add(k); if (String(v ?? "").trim()) filled[k] = (filled[k] ?? 0) + 1; }
  console.log(`== ${op} total ${r.total} sample ${items.length}`);
  for (const k of keys) console.log(`${k}\tfilled ${filled[k] ?? 0}\t${/Ofcl|Tel|Fax/.test(k) ? "(masked)" : String(pick[k] ?? "").slice(0, 160)}`);
}
