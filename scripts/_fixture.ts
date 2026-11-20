import { writeFileSync } from "fs";
import { fetchAllBids } from "../src/lib/nara/client";
import { fetchAttachmentsBulk } from "../src/lib/nara/corp";
import { fetchQualBulk } from "../src/lib/nara/qualification";
import { usableLwlt } from "../src/lib/criteria";
import { fetchPreSpecs } from "../src/lib/nara/preSpec";
async function main() {
  const items = await fetchAllBids(4);
  console.log("bids", items.length);
  const listItems = new Map<string, { item: Record<string, string | undefined>; day: string }>();
  const attachments = await fetchAttachmentsBulk(new Set(items.map((b) => b.id)), 4, (id, item, day) => { listItems.set(id, { item, day }); });
  const r = await fetchQualBulk(listItems, { days: 4, cacheDir: "/tmp/claude-0/qualcache" });
  for (const b of items) { const v = usableLwlt(r.quals[b.id]?.basis?.lwlt); if (v !== undefined) b.lowerLimitRate = v; }
  const preSpecs = await fetchPreSpecs(14);
  writeFileSync("data/fixture.json", JSON.stringify({ items, attachments, quals: r.quals, preSpecs, syncedAt: new Date().toISOString(), source: "g2b" }));
  console.log("done", Object.keys(r.quals).length, preSpecs.length, Object.values(r.quals).filter((q) => q.info?.aParts).length);
}
main();
