import { getNuriDocs } from "@/lib/store";

/** 민간 예측(/premium/nuri)의 공고별 평가표: /nuri-docs-data.json (키: 공고번호-차수). 정적 배포에서는 빌드 때 파일로 만들어진다 */
export const dynamic = "force-static";
export const revalidate = 600;

export async function GET() {
  return Response.json(await getNuriDocs());
}
