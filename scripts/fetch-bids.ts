/**
 * 나라장터 공고를 받아 JSON 파일로 저장 (GitHub Actions 정적 빌드용).
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/fetch-bids.ts data/bids.json
 * 키가 없으면 목업 데이터를 저장한다. 키가 있는데 수집에 실패하면 종료 코드 1 (이전 배포 유지).
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { buildMockBids } from "../src/lib/mock/bids";
import { fetchAllBids, hasServiceKey } from "../src/lib/nara/client";
import { fetchAttachmentsBulk } from "../src/lib/nara/corp";

async function main() {
  const out = process.argv[2] ?? "data/bids.json";
  mkdirSync(dirname(out), { recursive: true });
  const syncedAt = new Date().toISOString();
  if (!hasServiceKey()) {
    writeFileSync(out, JSON.stringify({ items: buildMockBids(), syncedAt, source: "mock" }));
    console.log("서비스키 없음: 목업 공고 저장");
    return;
  }
  const items = await fetchAllBids(3);
  if (items.length === 0) throw new Error("수집된 공고가 0건입니다");
  // 첨부파일(평가점수 예측용)은 입찰공고정보서비스 승인이 필요하다. 실패해도 공고 배포는 계속한다
  let attachments = {};
  try {
    attachments = await fetchAttachmentsBulk(new Set(items.map((b) => b.id)));
    console.log(`첨부파일 목록 ${Object.keys(attachments).length}건`);
  } catch (e) {
    console.warn("첨부파일 목록 수집 건너뜀:", e instanceof Error ? e.message : e);
  }
  writeFileSync(out, JSON.stringify({ items, attachments, syncedAt, source: "g2b" }));
  console.log(`나라장터 공고 ${items.length}건 저장 → ${out}`);
}

main().catch((e) => {
  console.error("공고 수집 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
