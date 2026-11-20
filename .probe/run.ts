// 임시 확인용 (PR 머지 전에 지운다): 공개 자료(업체명만, 대표자·전화 없음)를 내려받아 로컬에서 검증한다
import { mkdirSync, writeFileSync } from "node:fs";
import { COMPARABLE, fetchAptAwards, fetchAptNotices, fetchAptPrivateContracts } from "../src/lib/kapt/client";
(async () => {
  mkdirSync(".probe/out", { recursive: true });
  const items = await fetchAptNotices();
  writeFileSync(".probe/out/notices.json", JSON.stringify(items));
  const aw = await fetchAptAwards();
  writeFileSync(".probe/out/awards.json", JSON.stringify(aw));
  const pc = await fetchAptPrivateContracts(items.filter((b) => COMPARABLE.includes(b.category)).map((b) => b.aptCode), new Date(), 200_000);
  writeFileSync(".probe/out/private.json", JSON.stringify(pc.items));
  console.log("done", items.length, aw.length, pc.items.length);
})();
