import { getAttachments } from "@/lib/store";

/**
 * 공고별 첨부파일 목록 ("공고번호-차수" → 공고서·규격서 링크). 평가점수 예측 화면이 필요할 때만 받는다.
 * 정적 배포에서는 빌드 시 /attachments-data.json 파일로 만들어진다.
 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getAttachments());
}
