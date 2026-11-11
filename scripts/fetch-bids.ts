/**
 * 나라장터 공고를 받아 JSON 파일로 저장 (GitHub Actions 정적 빌드용).
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/fetch-bids.ts data/bids.json
 * 키가 없으면 목업 데이터를 저장한다. 키가 있는데 수집에 실패하면 종료 코드 1 (이전 배포 유지).
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { buildMockBids } from "../src/lib/mock/bids";
import { fetchFacilityBids, hasServiceKey } from "../src/lib/nara/client";

async function main() {
  const out = process.argv[2] ?? "data/bids.json";
  mkdirSync(dirname(out), { recursive: true });
  const syncedAt = new Date().toISOString();
  if (!hasServiceKey()) {
    writeFileSync(out, JSON.stringify({ items: buildMockBids(), syncedAt, source: "mock" }));
    console.log("서비스키 없음: 목업 공고 저장");
    return;
  }
  const items = await fetchFacilityBids(3);
  if (items.length === 0) throw new Error("수집된 공고가 0건입니다");
  writeFileSync(out, JSON.stringify({ items, syncedAt, source: "g2b" }));
  console.log(`나라장터 공고 ${items.length}건 저장 → ${out}`);
}

main().catch((e) => {
  console.error("공고 수집 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
