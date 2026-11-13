import { getAwardStats } from "@/lib/store";

/** 전년도 낙찰률 통계: /award-stats.json (평가점수 예측의 예상 최저 경쟁 투찰률 기본값) */
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await getAwardStats());
}
