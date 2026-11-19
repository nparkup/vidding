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
import { extractSheetsForBids } from "../src/lib/nara/docExtract";
import { fetchQualBulk } from "../src/lib/nara/qualification";
import { usableLwlt } from "../src/lib/criteria";
import { buildAwardStats } from "../src/lib/nara/awardStats";
import { awardStatsFromR2, recentNoticeClasses } from "./awards/forBuild";
import { aiSheetsEnabled, makeCollector, runAiSheets } from "./aiSheets";

async function main() {
  const out = process.argv[2] ?? "data/bids.json";
  mkdirSync(dirname(out), { recursive: true });
  const syncedAt = new Date().toISOString();
  if (!hasServiceKey()) {
    writeFileSync(out, JSON.stringify({ items: buildMockBids(), syncedAt, source: "mock" }));
    console.log("서비스키 없음: 목업 공고 저장");
    return;
  }
  const items = await fetchAllBids();
  if (items.length === 0) throw new Error("수집된 공고가 0건입니다");
  // 첨부파일(평가점수 예측용)은 입찰공고정보서비스 승인이 필요하다. 실패해도 공고 배포는 계속한다
  let attachments = {};
  // 첨부 목록을 받을 때 같은 목록 원본(업종제한 여부·지역제한 기준·자격 등록 마감)을 참가자격 수집에 넘긴다
  const listItems = new Map<string, { item: Record<string, string | undefined>; day: string }>();
  try {
    attachments = await fetchAttachmentsBulk(new Set(items.map((b) => b.id)), undefined, (id, item, day) => {
      const prev = listItems.get(id);
      if (!prev || prev.day < day) listItems.set(id, { item, day });
    });
    console.log(`첨부파일 목록 ${Object.keys(attachments).length}건`);
  } catch (e) {
    console.warn("첨부파일 목록 수집 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 입찰 참가자격(업종 제한·참가지역): 사업자번호 조회 때 공고별로 가능/불가/확인 필요를 판정하는 데 쓴다. 실패해도 배포는 계속
  let quals: Awaited<ReturnType<typeof fetchQualBulk>>["quals"] = {};
  if (listItems.size) {
    try {
      const r = await fetchQualBulk(listItems, { cacheDir: process.env.AWARD_CACHE_DIR ? `${process.env.AWARD_CACHE_DIR}/qual` : ".cache/award/qual" });
      quals = r.quals;
      const s = r.stats;
      console.log(`참가자격: 공고 ${s.bids}건, 업종 제한 ${s.licenseLimited}건, 지역 제한 ${s.regionLimited}건, 자료 없음 ${s.unknown}건 (이번 호출 ${s.fetched}일분, 실패 ${s.failedDays}일분)`);
      // 낙찰하한율: 개방표준 목록에는 없어 임시값을 넣어 두었다. 입찰공고정보서비스의 공고 값으로 바꾼다
      let fixed = 0;
      for (const bid of items) {
        const v = usableLwlt(r.quals[bid.id]?.basis?.lwlt);
        if (v !== undefined && bid.lowerLimitRate !== v) { bid.lowerLimitRate = v; fixed++; }
      }
      console.log(`낙찰하한율: 공고 값으로 ${fixed}건 바꿈`);
    } catch (e) {
      console.warn("참가자격 수집 건너뜀:", e instanceof Error ? e.message : e);
    }
  }
  // 첨부를 내려받아 평가표를 미리 추출 (평가점수 예측이 공고 선택만으로 원문 배점을 쓰도록). 실패해도 배포는 계속
  let sheets: Awaited<ReturnType<typeof extractSheetsForBids>>["sheets"] = {};
  // 규칙 파서가 쓸 수 있는 배점표를 못 읽은 공고는 본문을 모아 두었다가 AI로 읽는다 (ANTHROPIC_API_KEY 가 있을 때만)
  const ai = aiSheetsEnabled() ? makeCollector(quals) : undefined;
  try {
    const r = await extractSheetsForBids(items, attachments, { collect: ai?.collect });
    sheets = r.sheets;
    console.log(`평가표 추출: 대상 ${r.stats.bids}건, 파일 ${r.stats.files}개(실패 ${r.stats.downloadFailed}), 배점표 ${r.stats.found}건, 공고 기준 문장 ${r.stats.notice}건${r.stats.timedOut ? ", 시간 한도로 일부만 처리" : ""}`);
  } catch (e) {
    console.warn("평가표 추출 건너뜀:", e instanceof Error ? e.message : e);
  }
  if (ai) {
    try {
      const r = await runAiSheets(ai.candidates, quals, new Set(items.map((b) => b.id)));
      for (const [id, sheet] of Object.entries(r.sheets)) sheets[id] = { ...sheets[id], sheet, file: "AI 판독" };
      console.log(r.log);
    } catch (e) {
      console.warn("AI 판독 건너뜀:", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("AI 판독: ANTHROPIC_API_KEY 없음, 건너뜀");
  }
  // 예상 최저 경쟁 투찰률 통계. 낙찰 저장소(R2)에 최근 1년치가 있으면 그것을 쓰고(조달청 호출 없음),
  // 아직 수집 중이면 예전처럼 전년도 낙찰을 조금씩 받아 GitHub Actions 캐시에 쌓는다. 실패해도 배포는 계속
  let awardStats;
  const targets = items.filter((b) => b.contractMethod === "적격심사" || b.contractMethod === "협상에 의한 계약");
  try {
    awardStats = await awardStatsFromR2(targets);
    if (awardStats) console.log(`낙찰률 통계: 낙찰 저장소 최근 1년, 통계 ${Object.keys(awardStats.strata).length}개, 같은 수요기관 유사 공고 찾은 공고 ${Object.keys(awardStats.prior ?? {}).length}건`);
  } catch (e) {
    console.warn("낙찰 저장소 통계 읽기 실패:", e instanceof Error ? e.message : e);
  }
  if (!awardStats) {
    try {
      const r = await buildAwardStats(process.env.AWARD_CACHE_DIR ?? ".cache/award", { targets });
      awardStats = r.stats;
      const c = r.stats.coverage;
      console.log(`전년도(${r.stats.year}) 낙찰률: 이번 호출 ${r.fetched}회, 낙찰 ${c.weeks}/${c.totalWeeks}주, 공고 ${c.noticeDays}/${c.totalNoticeDays}일 확보, 전년도 유사 공고 찾은 공고 ${Object.keys(r.stats.prior ?? {}).length}건${r.stopped ? ` (중단: ${r.stopped})` : ""}`);
    } catch (e) {
      console.warn("전년도 낙찰률 통계 건너뜀:", e instanceof Error ? e.message : e);
    }
  }
  // 지금 공고의 세부품명·중분류 (유사 실적 비교 기준)
  try {
    const cls = await recentNoticeClasses();
    let n = 0;
    for (const b of items) { const c = cls.get(b.bidNtceNo); if (c) { b.cls = c; n++; } }
    if (cls.size) console.log(`공고 분류: ${items.length}건 중 ${n}건에 세부품명·중분류를 붙임`);
  } catch (e) {
    console.warn("공고 분류 붙이기 건너뜀:", e instanceof Error ? e.message : e);
  }
  writeFileSync(out, JSON.stringify({ items, attachments, sheets, quals, awardStats, syncedAt, source: "g2b" }));
  console.log(`나라장터 공고 ${items.length}건 저장 → ${out}`);
}

main().catch((e) => {
  console.error("공고 수집 실패:", e instanceof Error ? e.message : e);
  process.exit(1);
});
