"use client";

import type { Bid, BidAttachment } from "./types";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

/** 공고 첨부파일 목록. 정적 배포는 빌드 때 공고별로 만들어 둔 파일을, 서버 배포는 나라장터를 바로 조회한다 */
export async function loadAttachments(bid: Bid): Promise<BidAttachment[]> {
  if (STATIC) {
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/attachments/${encodeURIComponent(bid.id)}.json`);
    return r.ok ? r.json() : [];
  }
  const qs = new URLSearchParams({ no: bid.bidNtceNo, ord: bid.bidNtceOrd, biz: bid.bizType ?? "용역" });
  const r = await fetch(`/api/premium/attachments?${qs}`);
  return r.ok ? r.json() : [];
}
