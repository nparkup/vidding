import { getOrderPlans } from "@/lib/store";

/** 앞으로 몇 달 발주 예정인 계획 목록 (발주계획 모아보기 화면용). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getOrderPlans());
}
