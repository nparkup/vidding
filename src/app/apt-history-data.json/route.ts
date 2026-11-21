import { getAptHistory } from "@/lib/store";

/** 아파트 예측의 낙찰 결과로 본 예측: /apt-history-data.json (키: K-apt 입찰번호). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getAptHistory());
}
