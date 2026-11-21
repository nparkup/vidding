import { getContracts } from "@/lib/store";

/** 최근 2주 경쟁 계약 목록 (계약현황 화면용). 정적 배포에서는 빌드 때 파일로 만들어진다. 상세 항목(x)은 /contract-detail/{조각}.json 에 따로 싣는다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json((await getContracts()).map(({ x: _x, ...c }) => c));
}
