import "server-only";
import { call, COLLECT_DAYS, mapLimit, recentDays } from "./client";
import type { BidAttachment } from "../types";
import { NARA_APIS } from "./endpoints";

/**
 * 평가점수 예측용 나라장터 조회.
 * - 조달업체 정보 조회는 src/lib/corpLookup.ts (국세청·금융위원회 정보와 함께 조회)
 * - 공고 첨부파일: 입찰공고정보서비스(BidPublicInfoService), 공고번호로 조회 (inqryDiv=2). 활용신청 승인 후 동작
 */

const BID = NARA_APIS.find((a) => a.key === "bidPublic")!;

export type Attachment = BidAttachment;

type Item = Record<string, string | undefined>;

function attachmentsOf(it: Item): Attachment[] {
  // stdNtceDocUrl 은 대개 첨부 중 하나(공고문)를 가리킨다: 같은 파일이면 그 파일을 공고서로 표시한다
  const std = it.stdNtceDocUrl;
  const files: Attachment[] = [];
  for (let n = 1; n <= 10; n++) {
    const url = it[`ntceSpecDocUrl${n}`];
    if (url) files.push({ name: it[`ntceSpecFileNm${n}`] || `첨부파일 ${n}`, url, kind: url === std ? "공고서" : "규격서·기타" });
  }
  if (std && !files.some((f) => f.url === std)) files.unshift({ name: "표준 공고서", url: std, kind: "공고서" });
  return files;
}

/** 공고 첨부파일 목록 (공고서·규격서). 파일 자체는 나라장터에서 내려받는다 */
export async function bidAttachments(bidNtceNo: string, bidNtceOrd = "000", bizType = "용역"): Promise<Attachment[]> {
  const ops = BID.operations as Record<string, string>;
  const op = bizType === "공사" ? ops.constructionList : bizType === "물품" ? ops.goodsList : ops.serviceList;
  const { items } = await call(BID.path, op, { inqryDiv: "2", bidNtceNo, numOfRows: "10" });
  const it = items.find((i) => (i.bidNtceOrd ?? "000") === bidNtceOrd) ?? items[0];
  return it ? attachmentsOf(it) : [];
}

/**
 * 최근 N일 공고의 첨부파일 목록을 한꺼번에 받는다 (정적 빌드용).
 * 용역·공사·물품 목록을 날짜별로 조회해 "공고번호-차수" → 첨부파일로 묶는다. 기간은 공고 수집 기간과 같다.
 */
export async function fetchAttachmentsBulk(ids: Set<string>, days = COLLECT_DAYS): Promise<Record<string, Attachment[]>> {
  const ops = BID.operations as Record<string, string>;
  const out: Record<string, Attachment[]> = {};
  const jobs = recentDays(days).flatMap((day) => [ops.serviceList, ops.constructionList, ops.goodsList].map((op) => ({ day, op })));
  await mapLimit(jobs, 4, async ({ day, op }) => {
    const params = { inqryDiv: "1", inqryBgnDt: `${day}0000`, inqryEndDt: `${day}2359`, numOfRows: "999" };
    const first = await call(BID.path, op, { ...params, pageNo: "1" });
    const pages = Math.ceil(first.total / 999);
    const items = [...first.items];
    for (let p = 2; p <= pages; p++) items.push(...(await call(BID.path, op, { ...params, pageNo: String(p) })).items);
    for (const it of items) {
      const id = `${it.bidNtceNo}-${it.bidNtceOrd ?? "000"}`;
      if (!ids.has(id)) continue;
      const files = attachmentsOf(it);
      if (files.length) out[id] = files;
    }
  });
  return out;
}
