"use client";

import type { Bid, BidAttachment } from "./types";
import type { BidQual } from "./eligibility";
import type { NoticeCriteria } from "./noticeCriteria";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

/**
 * 공고 한 건의 첨부파일 목록과 참가자격·공고 항목(qual, qual.info).
 * 정적 배포는 빌드 때 공고별로 만들어 둔 파일을, 서버 배포는 나라장터를 바로 조회한다
 */
export async function loadBidExtra(bid: Bid): Promise<{ files: BidAttachment[]; qual?: BidQual; notice?: NoticeCriteria }> {
  const url = STATIC
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/attachments/${encodeURIComponent(bid.id)}.json`
    : `/api/premium/attachments?${new URLSearchParams({ no: bid.bidNtceNo, ord: bid.bidNtceOrd, biz: bid.bizType ?? "용역" })}`;
  const r = await fetch(url);
  if (!r.ok) return { files: [] };
  // 공고별 파일·서버 응답은 { files, qual, … } 형태 (예전 배포는 배열)
  const j = await r.json();
  return Array.isArray(j) ? { files: j } : { files: j.files ?? [], qual: j.qual, notice: j.notice };
}

/** 공고 첨부파일 목록 */
export async function loadAttachments(bid: Bid): Promise<BidAttachment[]> {
  return (await loadBidExtra(bid)).files;
}
