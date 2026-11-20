import { getRateTable } from "@/lib/store";

/** 발주 기준·금액 구간별 낙찰하한율 집계: /rate-table.json (기준표 화면, 공고 상세의 기준 카드) */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getRateTable());
}
