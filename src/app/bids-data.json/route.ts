import { getBids } from "@/lib/store";

/**
 * 공고 전체 목록 (브라우저의 검색·매칭용).
 * 전 업종 공고는 수천 건이라 페이지 HTML에 넣지 않고 이 파일 하나로 내려준다.
 * 정적 배포에서는 빌드 시 /bids-data.json 파일로 만들어진다.
 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getBids());
}
