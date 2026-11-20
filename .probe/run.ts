// 임시 확인용 (PR 머지 전에 지운다)
import { attachPriors, COMPARABLE, fetchAptAwards, fetchAptNotices, fetchAptPrivateContracts } from "../src/lib/kapt/client";
(async () => {
  const t0 = Date.now();
  const items = await fetchAptNotices();
  const codes = items.filter((b) => COMPARABLE.includes(b.category)).map((b) => b.aptCode);
  const t1 = Date.now();
  console.log('notices', items.length, t1 - t0);
  const pc = await fetchAptPrivateContracts(codes);
  const t2 = Date.now();
  console.log('private', pc.asked, pc.items.length, t2 - t1);
  const pc2 = await fetchAptPrivateContracts(codes);
  console.log('private2', pc2.asked, pc2.cached, pc2.items.length, Date.now() - t2);
  pc.items.push(...pc2.items);
  const aw = await fetchAptAwards();
  const n = attachPriors(items, [...aw, ...pc.items]);
  const onlyAw = items.map((b) => ({ ...b, prior: undefined }));
  const nAw = attachPriors(onlyAw, aw);
  console.log("notices", items.length, "comparable", codes.length, "uniq", new Set(codes).size, `${t1 - t0}ms`, "private asked", pc.asked, "rows", pc.items.length, `${t2 - t1}ms`, "awards", aw.length, `${Date.now() - t2}ms`, "priors both", n, "awards only", nAw);
  const via = new Map<string, number>(); for (const b of items) if (b.prior) via.set(b.prior.via ?? "?", (via.get(b.prior.via ?? "?") ?? 0) + 1);
  console.log("via", JSON.stringify([...via]));
  for (const b of items.filter((x) => x.prior?.via === "수의계약").slice(0, 3)) console.log("PC", JSON.stringify({ t: b.title, c: b.category, p: b.prior }));
})();
