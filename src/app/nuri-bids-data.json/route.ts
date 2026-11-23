import { getNuriBids } from "@/lib/store";

/** 누리장터 민간 입찰: /nuri-bids-data.json (민간 공고 화면). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getNuriBids());
}
