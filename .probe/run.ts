// 임시 확인용 3차 (PR 전에 지운다)
import { attachPriors, fetchAptAwards, fetchAptNotices } from "../src/lib/kapt/client";
(async () => {
  const t0 = Date.now();
  const items = await fetchAptNotices();
  const t1 = Date.now();
  const awards = await fetchAptAwards();
  const n = attachPriors(items, awards);
  console.log("notices", items.length, `${t1 - t0}ms`, "awards", awards.length, `${Date.now() - t1}ms`, "priors", n);
  const c = new Map<string, number>(); for (const b of items) c.set(b.category, (c.get(b.category) ?? 0) + 1);
  console.log("cats", JSON.stringify([...c]));
  const r = new Map<string, number>(); for (const b of items) r.set(b.region, (r.get(b.region) ?? 0) + 1);
  console.log("regions", JSON.stringify([...r]));
  console.log("withContent", items.filter((b) => b.content).length, "withDocs", items.filter((b) => b.docs).length, "files", items.filter((b) => b.files?.length).length);
  for (const b of items.filter((x) => x.prior).slice(0, 3)) console.log("P", JSON.stringify(b));
  console.log("C", JSON.stringify(items.find((x) => x.content)));
  console.log("JSON size", JSON.stringify(items).length);
  const pick = [...items.filter((x) => x.prior).slice(0, 14), ...items.filter((x) => !x.prior).filter((_, i) => i % 60 === 0).slice(0, 26)];
  console.log("FIXTURE " + JSON.stringify(pick));
  const no = items[0].no;
  for (const u of [`https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${no}`, `https://www.k-apt.go.kr/bid/bidList.do`]) {
    try {
      const h = await (await fetch(u, { signal: AbortSignal.timeout(20000) })).text();
      console.log(u.slice(25, 60), h.length, (h.match(/<title>[^<]*/) ?? [""])[0], "hasTitle", h.includes(items[0].title.slice(0, 8)), JSON.stringify([...h.matchAll(/(onclick|href)="[^"]*(bidDetail|goView|fn_?[a-zA-Z]*Detail)[^"]*"/g)].slice(0, 3).map((m) => m[0])));
    } catch (e) { console.log(u, "ERR", (e as Error).message); }
  }
})();
