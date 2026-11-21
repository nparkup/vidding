/**
 * 나라장터 공고를 받아 JSON 파일로 저장 (GitHub Actions 정적 빌드용).
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/fetch-bids.ts data/bids.json
 * 키가 없으면 목업 데이터를 저장한다. 키가 있는데 수집에 실패하면 종료 코드 1 (이전 배포 유지).
 */
import { mkdirSync, writeFileSync } from "fs";
// 공공데이터포털 호출 수 (관리자 화면 API 사용량). 다른 모듈보다 먼저 불러 전역 fetch를 감싼다
import { flushApiCounts } from "./apiCounter";
import { dirname } from "path";
import { buildMockBids } from "../src/lib/mock/bids";
import { fetchAllBidsWithChanges, hasServiceKey } from "../src/lib/nara/client";
import { fetchAttachmentsBulk } from "../src/lib/nara/corp";
import { extractSheetsForBids, textCacheKey } from "../src/lib/nara/docExtract";
import { fetchQualBulk } from "../src/lib/nara/qualification";
import { usableLwlt } from "../src/lib/criteria";
import { jointAllowed } from "../src/lib/noticeInfo";
import { buildAwardStats } from "../src/lib/nara/awardStats";
import { awardAnalysesFromR2, awardStatsFromR2, recentNoticeClasses, awardMeta, aptMeta, rateTableFromR2, agencySummariesFromR2, recentAwardsFromR2 } from "./awards/forBuild";
import type { AwardCount } from "../src/lib/awards/format";
import { buildRateRows, type RateTable } from "../src/lib/rateTable";
import { makeAiInputs } from "./aiSheets";
import { fetchPreSpecs } from "../src/lib/nara/preSpec";
import { attachPriors, COMPARABLE, fetchAptAwards, fetchAptNotices, fetchAptPrivateContracts, type AptAward } from "../src/lib/kapt/client";
import type { AptBidsFile } from "../src/lib/apt";
import { buildAptPriceModel } from "../src/lib/aptPrice";
import { attachAptHistory } from "../src/lib/kapt/history";
import { fetchOrderPlans } from "../src/lib/nara/orderPlan";
import { fetchContracts } from "../src/lib/nara/contract";
import { linkPlansToBids } from "../src/lib/orderPlans";
import { makeTextCache } from "./attachCache";
import type { BidAttachment } from "../src/lib/types";

// pdf.js 는 깨진 글꼴이 든 PDF에서 글꼴 미리 읽기 실패(FormatError)를 아무도 기다리지 않는 promise로 던진다.
// 그 PDF 본문만 못 읽으면 될 일인데 Node가 빌드 전체를 멈추므로, pdf.js 오류는 경고만 남기고 넘어간다 (다른 오류는 그대로 멈춘다)
let pdfRejections = 0;
process.on("unhandledRejection", (reason) => {
  const name = (reason as { name?: string } | null)?.name ?? "";
  const msg = String((reason as { message?: unknown } | null)?.message ?? reason);
  if (/^(FormatError|InvalidPDFException|UnknownErrorException|PasswordException|MissingPDFException|AbortException)$/.test(name) || /^(FormatError|InvalidPDFException):/.test(msg)) {
    if (pdfRejections++ < 5) console.warn(`PDF 읽기 경고(빌드는 계속): ${name || "Error"}: ${msg}`);
    return;
  }
  throw reason;
});

async function main() {
  const out = process.argv[2] ?? "data/bids.json";
  mkdirSync(dirname(out), { recursive: true });
  const syncedAt = new Date().toISOString();
  if (!hasServiceKey()) {
    writeFileSync(out, JSON.stringify({ items: buildMockBids(), syncedAt, source: "mock" }));
    console.log("서비스키 없음: 목업 공고 저장");
    return;
  }
  const { bids: items, changes } = await fetchAllBidsWithChanges();
  if (items.length === 0) throw new Error("수집된 공고가 0건입니다");
  console.log(`정정·취소: 최근 정정 ${changes.filter((c) => c.kind === "정정").length}건(바뀐 항목 비교 ${changes.filter((c) => c.fields.length).length}건), 취소 ${changes.filter((c) => c.kind === "취소").length}건`);
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
      // 공동도급: 개방표준의 공동계약 여부(cmmnCntrctYn)는 '공동수급불허' 공고에도 Y 로 오는 일이 있어 공동수급 방식으로 바로잡는다
      let joint = 0;
      for (const bid of items) {
        const ok = jointAllowed(r.quals[bid.id]?.info?.jointMethod);
        if (ok !== undefined && bid.jointContract !== ok) { bid.jointContract = ok; joint++; }
      }
      console.log(`공동도급: 공동수급 방식으로 ${joint}건 바꿈, 기초금액 공개 ${s.withBase}건${s.baseFailedDays ? ` (기초금액 조회 실패 ${s.baseFailedDays}일분)` : ""}`);
    } catch (e) {
      console.warn("참가자격 수집 건너뜀:", e instanceof Error ? e.message : e);
    }
  }
  // 첨부를 내려받아 평가표를 미리 추출 (평가점수 예측이 공고 선택만으로 원문 배점을 쓰도록). 실패해도 배포는 계속
  let sheets: Awaited<ReturnType<typeof extractSheetsForBids>>["sheets"] = {};
  // 규칙 파서가 쓸 수 있는 배점표를 못 읽은 공고는 평가 관련 본문을 AI 판독 입력으로 남긴다 (공고를 고를 때 중계 서버가 읽는다)
  const ai = makeAiInputs(quals);
  try {
    // 첨부는 모두 읽는다(같은 파일명은 하나만). 읽은 본문은 캐시에 남겨 다음 빌드는 새 첨부만 받는다
    const textCache = makeTextCache();
    const r = await extractSheetsForBids(items, attachments, { collect: ai.collect, textCache, budgetMs: 10 * 60_000 });
    sheets = r.sheets;
    const pruned = textCache.prune((Object.values(attachments) as BidAttachment[][]).flat().map(textCacheKey));
    console.log(`평가표 추출: 대상 ${r.stats.bids}건 중 ${r.stats.done}건 읽음, 파일 ${r.stats.files}개(캐시 ${r.stats.cached}, 새로 받음 ${textCache.stats().added}, 실패 ${r.stats.downloadFailed}), 배점표 ${r.stats.found}건, 공고 기준 문장 ${r.stats.notice}건${r.stats.timedOut ? ", 시간 한도로 남은 공고는 다음 빌드에서 (화면에서 고르면 그 자리에서 읽음)" : ""}, 캐시 정리 ${pruned}개`);
  } catch (e) {
    console.warn("평가표 추출 건너뜀:", e instanceof Error ? e.message : e);
  }
  for (const [id, input] of Object.entries(ai.inputs)) sheets[id] = { ...sheets[id], ai: input };
  const aiChars = Object.values(ai.inputs).reduce((a, i) => a + i.text.length, 0);
  console.log(`AI 판독 입력: ${Object.keys(ai.inputs).length}건 (본문 합계 ${aiChars.toLocaleString()}자)`);
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
  // 낙찰 결과 분석 (평가점수 예측): 분류를 붙인 뒤에 만든다 (비슷한 공고를 세부품명으로 찾는다). 실패해도 배포는 계속
  let analyses;
  try {
    analyses = await awardAnalysesFromR2(items) ?? undefined;
    if (analyses) {
      const v = Object.values(analyses);
      console.log(`낙찰 결과 분석: 공고 ${v.length}건, 전년도 같은 사업 ${v.filter((a) => a.prior).length}건, 과거 같은 사업 2건 이상 ${v.filter((a) => a.history.length >= 2).length}건, 비슷한 공고 ${v.filter((a) => a.similar).length}건`);
    } else console.log("낙찰 결과 분석: 낙찰 저장소 색인이 아직 없어 건너뜀");
  } catch (e) {
    console.warn("낙찰 결과 분석 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 발주처 분석 (/agencies): 지금 공고의 수요기관마다. 위에서 받은 수요기관 색인을 다시 쓴다
  let agencies;
  try {
    agencies = await agencySummariesFromR2(items) ?? undefined;
    if (agencies) console.log(`발주처 분석: 수요기관 ${Object.keys(agencies).length.toLocaleString()}곳`);
  } catch (e) {
    console.warn("발주처 분석 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 사전규격 미리보기 (/prespecs): 최근 2주 등록분. 실패해도 배포는 계속
  let preSpecs;
  try {
    preSpecs = await fetchPreSpecs();
    console.log(`사전규격: ${preSpecs.length.toLocaleString()}건 (본공고 나온 것 ${preSpecs.filter((p) => p.bidNos.length).length.toLocaleString()}건)`);
  } catch (e) {
    console.warn("사전규격 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 공동주택(아파트) 입찰 (/apt-bids): 국토교통부 공동주택 입찰공고·입찰결과공지. 실패해도 배포는 계속
  let aptBids: AptBidsFile | undefined;
  try {
    const items = await fetchAptNotices();
    let awards = 0, privates = 0, priors = 0;
    const prev: AptAward[] = [];
    try {
      const a = await fetchAptAwards();
      awards = a.length;
      prev.push(...a);
    } catch (e) {
      console.warn("공동주택 낙찰 결과 건너뜀:", e instanceof Error ? e.message : e);
    }
    try {
      const pc = await fetchAptPrivateContracts(items.filter((b) => COMPARABLE.includes(b.category)).map((b) => b.aptCode));
      privates = pc.items.length;
      prev.push(...pc.items);
      console.log(`공동주택 수의계약: 단지 ${pc.asked.toLocaleString()}곳 조회·${pc.cached.toLocaleString()}곳 캐시, 최근 3개 연도 ${privates.toLocaleString()}건`);
    } catch (e) {
      console.warn("공동주택 수의계약 건너뜀:", e instanceof Error ? e.message : e);
    }
    priors = attachPriors(items, prev);
    // 낙찰 결과로 본 예측 (아파트 예측): 같은 단지 지난 계약·비슷한 낙찰·응찰 업체 수·참가 예상 기업
    try {
      const h = await attachAptHistory(items, prev);
      console.log(`공동주택 낙찰 결과로 본 예측: 공고 ${h.attached.toLocaleString()}건, 응찰업체 조회 ${h.asked.toLocaleString()}건·캐시 ${h.cached.toLocaleString()}건${h.failed ? `·실패 ${h.failed}건 (${h.error})` : ""}`);
    } catch (e) {
      console.warn("공동주택 낙찰 결과로 본 예측 건너뜀:", e instanceof Error ? e.message : e);
    }
    // 입찰가격 예측: 지난해까지의 (직전 계약 → 다음 낙찰) 짝으로 비율을 만들고 올해 낙찰로 맞춰 본다
    const pricing = prev.length ? buildAptPriceModel(prev, `${new Date(Date.now() + 9 * 3600e3).getUTCFullYear()}-01-01`) : undefined;
    if (pricing) console.log(`공동주택 입찰가격 예측: 짝 ${pricing.pairs.toLocaleString()}개, 검증 ${pricing.check.all.n.toLocaleString()}건 구간 적중 ${(pricing.check.all.inRange * 100).toFixed(1)}%, 10% 안 ${(pricing.check.all.within10 * 100).toFixed(1)}% (직전 금액 그대로 ${(pricing.check.all.naive10 * 100).toFixed(1)}%)`);
    aptBids = { builtAt: new Date().toISOString(), items, awards, privates, pricing };
    const by = (k: string) => items.filter((b) => b.category === k).length;
    console.log(`공동주택 입찰: 진행 중 ${items.length.toLocaleString()}건 (청소 ${by("청소")}, 경비 ${by("경비")}, 소독 ${by("소독")}, 위탁관리 ${by("주택관리(위탁)")}, 공사 ${by("공사")}), 낙찰 ${awards.toLocaleString()}건·수의계약 ${privates.toLocaleString()}건 중 직전 계약 붙인 공고 ${priors}건`);
  } catch (e) {
    console.warn("공동주택 입찰 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 발주계획 모아보기 (/plans): 이번 달부터 넉 달 발주 예정. 실패해도 배포는 계속
  let orderPlans;
  try {
    orderPlans = await fetchOrderPlans();
    const linked = linkPlansToBids(orderPlans, items);
    console.log(`발주계획: ${orderPlans.length.toLocaleString()}건 (진행 중 공고와 이어진 것 ${linked.toLocaleString()}건)`);
  } catch (e) {
    console.warn("발주계획 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 계약현황 (/contracts): 최근 2주 경쟁 계약. 지난 날짜는 .cache/contracts 에서 읽는다
  let contracts;
  try {
    contracts = await fetchContracts();
    console.log(`계약현황: ${contracts.length.toLocaleString()}건`);
  } catch (e) {
    console.warn("계약현황 건너뜀:", e instanceof Error ? e.message : e);
  }
  // 메인 상단 현황 줄의 '낙찰정보 N건' (낙찰 저장소에 쌓인 낙찰 건수)
  // '누적입찰공고' (저장소의 나라장터 공고 + 아파트 공고, 겹치는 번호는 한 번), '누적낙찰정보'에 더할 아파트 누적 낙찰
  let awardCount: AwardCount | undefined;
  try {
    const m = await awardMeta();
    if (m?.rows) awardCount = { rows: m.rows, builtAt: m.builtAt, notices: m.notices, aptDup: m.aptDup };
  } catch (e) {
    console.warn("낙찰 저장소 건수 읽기 실패:", e instanceof Error ? e.message : e);
  }
  try {
    const a = await aptMeta();
    if (a && awardCount) Object.assign(awardCount, { aptNotices: a.notices, aptAwards: a.awards });
    if (awardCount) console.log(`누적: 나라장터 공고 ${awardCount.notices ?? "?"} + 아파트 공고 ${a?.notices ?? "?"} - 겹침 ${awardCount.aptDup ?? 0}, 나라장터 낙찰 ${awardCount.rows} + 아파트 낙찰 ${a?.awards ?? "?"}`);
  } catch (e) {
    console.warn("아파트 누적 건수 읽기 실패:", e instanceof Error ? e.message : e);
  }
  // 기준표 화면: 발주 기준·금액 구간별 낙찰하한율. 낙찰 저장소 최근 26주 공고, 없으면 지금 공고(참가자격 자료의 낙찰방법·하한율)
  let rateTable: RateTable | undefined;
  try {
    rateTable = (await rateTableFromR2()) ?? undefined;
  } catch (e) {
    console.warn("낙찰 저장소 하한율 집계 실패:", e instanceof Error ? e.message : e);
  }
  if (!rateTable) {
    const inputs = items.map((b) => ({ biz: (b.bizType === "외자" ? "물품" : b.bizType ?? "용역") as "공사" | "용역" | "물품", method: quals[b.id]?.basis?.method ?? "", presmpt: quals[b.id]?.basis?.presmpt, lwlt: quals[b.id]?.basis?.lwlt }));
    rateTable = { builtAt: new Date().toISOString(), source: "진행 중 공고", notices: inputs.filter((x) => x.method && x.lwlt).length, rows: buildRateRows(inputs) };
  }
  console.log(`하한율 기준표: ${rateTable.source} 공고 ${rateTable.notices.toLocaleString()}건, 기준 ${rateTable.rows.length}개`);
  // 최근 낙찰 결과 목록 (/awards): 최근 한 달 최종낙찰분. 실패해도 배포는 계속
  let recentAwards;
  try {
    recentAwards = await recentAwardsFromR2() ?? undefined;
    if (recentAwards) console.log(`최근 낙찰 결과: ${recentAwards.from}~${recentAwards.to} ${recentAwards.rows.length.toLocaleString()}건 (기초금액 ${recentAwards.rows.filter((r) => r[11]).length.toLocaleString()}건, 개찰 순위 ${recentAwards.rows.filter((r) => r[15].length).length.toLocaleString()}건)`);
  } catch (e) {
    console.warn("최근 낙찰 결과 건너뜀:", e instanceof Error ? e.message : e);
  }
  writeFileSync(out, JSON.stringify({ items, attachments, sheets, quals, awardStats, analyses, agencies, preSpecs, orderPlans, contracts, aptBids, awardCount, changes, rateTable, recentAwards, syncedAt, source: "g2b" }));
  console.log(`나라장터 공고 ${items.length}건 저장 → ${out}`);
}

main().then(() => flushApiCounts("pages-build"), async (e) => {
  console.error("공고 수집 실패:", e instanceof Error ? e.message : e);
  await flushApiCounts("pages-build");
  process.exit(1);
});
