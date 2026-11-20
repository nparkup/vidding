// 임시 확인용 (PR 머지 전에 지운다)
import { attachPriors, COMPARABLE, fetchAptAwards, fetchAptNotices, fetchAptPrivateContracts } from "../src/lib/kapt/client";
import { buildAptPriceModel, forecastAptPrice } from "../src/lib/aptPrice";
(async () => {
  const items = await fetchAptNotices();
  const aw = await fetchAptAwards();
  const pc = await fetchAptPrivateContracts(items.filter((b) => COMPARABLE.includes(b.category)).map((b) => b.aptCode), new Date(), 150_000);
  console.log("awards", aw.length, "private", pc.items.length, "award labels", JSON.stringify(Object.entries(aw.reduce((m, a) => ((m[a.award ?? "-"] = (m[a.award ?? "-"] ?? 0) + 1), m), {} as Record<string, number>))));
  const withPeriod = aw.filter((a) => a.prior.start && a.prior.end).length;
  console.log("awards with period", withPeriod);
  for (const cut of ["2026-01-01", "2025-07-01"]) {
    const m = buildAptPriceModel([...aw, ...pc.items], cut);
    console.log("CUT", cut, "pairs", m.pairs, "all", JSON.stringify(m.all), "check", JSON.stringify(m.check.all));
    for (const [c, st] of Object.entries(m.byCat)) console.log(" cat", c, JSON.stringify(st), "check", JSON.stringify(m.check.byCat[c] ?? null));
    for (const [c, st] of Object.entries(m.byCatAward)) if (st.n >= 40) console.log(" ca", c, JSON.stringify(st));
  }
  const m2 = buildAptPriceModel(aw, "2026-01-01");
  console.log("awards only pairs", m2.pairs, JSON.stringify(m2.check.all));
  const m = buildAptPriceModel([...aw, ...pc.items], "2026-01-01");
  attachPriors(items, [...aw, ...pc.items]);
  for (const b of items.filter((x) => x.prior).slice(0, 4)) console.log("F", b.category, b.award, JSON.stringify(b.prior), JSON.stringify(forecastAptPrice(m, b.category, b.award, b.prior!)));
  console.log("json size", JSON.stringify(m).length);
})();
