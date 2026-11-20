// 임시 확인용 (PR 머지 전에 지운다): 공개 자료(업체명만, 대표자·전화 없음)를 내려받아 로컬에서 검증한다
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { COMPARABLE, fetchAptAwards, fetchAptNotices, fetchAptPrivateContracts } from "../src/lib/kapt/client";
(async () => {
  mkdirSync(".probe/out", { recursive: true });
  const items = await fetchAptNotices();
  writeFileSync(".probe/out/notices.json", JSON.stringify(items));
  const aw = await fetchAptAwards();
  writeFileSync(".probe/out/awards.json", JSON.stringify(aw));
  const pc = await fetchAptPrivateContracts(items.filter((b) => COMPARABLE.includes(b.category)).map((b) => b.aptCode), new Date(), 200_000);
  writeFileSync(".probe/out/private.json", JSON.stringify(pc.items));
  // 로그로 내보낸다 (샌드박스가 아티팩트 저장소에 못 닿음)
  const b64 = gzipSync(JSON.stringify({ aw: aw.map((a) => [a.key, a.award ?? "", a.no, a.prior.amount, a.prior.closedAt ?? "", a.prior.start ?? "", a.prior.end ?? ""]), pc: pc.items.map((a) => [a.key, a.no, a.prior.amount, a.prior.closedAt ?? "", a.prior.start ?? "", a.prior.end ?? ""]) })).toString("base64");
  for (let i = 0; i < b64.length; i += 4000) console.log("DATA" + b64.slice(i, i + 4000));
  console.log("done", items.length, aw.length, pc.items.length);
})();
