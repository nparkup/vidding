import { getPreSpecs } from "@/lib/store";

/** 최근 2주 사전규격 목록 (사전규격 미리보기 화면용). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getPreSpecs());
}
