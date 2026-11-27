import { getNoticeChanges } from "@/lib/store";
import { CHANGE_DAYS } from "@/lib/noticeChanges";
import type { NoticeChangesFile } from "@/lib/noticeChanges";

/** 최근 정정·취소 공고: /notice-changes.json (정정·취소 화면, 관심공고·공고 상세의 정정 표시) */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  const body: NoticeChangesFile = { builtAt: new Date().toISOString(), days: CHANGE_DAYS, items: [...(await getNoticeChanges())].sort((a, b) => b.at.localeCompare(a.at)) };
  return Response.json(body);
}
