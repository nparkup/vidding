import { getRecentAwards } from "@/lib/store";

/** 최근 한 달 낙찰 결과 목록 (/awards 화면용). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json((await getRecentAwards()) ?? { from: "", to: "", builtAt: "", rows: [] });
}
