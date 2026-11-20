import { getAptBids } from "@/lib/store";

/** 공동주택(아파트) 진행 중 입찰: /apt-bids-data.json (아파트 공고 화면). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getAptBids());
}
