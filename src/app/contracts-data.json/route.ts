import { getContracts } from "@/lib/store";

/** 최근 2주 경쟁 계약 목록 (계약현황 화면용). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getContracts());
}
