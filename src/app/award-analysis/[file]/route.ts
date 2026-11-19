import { getAwardAnalyses } from "@/lib/store";

/**
 * 공고 한 건의 낙찰 결과 분석 (전년도 같은 사업, 과거 같은 사업 추이, 비슷한 공고): /award-analysis/{공고번호-차수}.json
 * 빌드 때 낙찰 저장소 색인으로 만든다(scripts/awards/forBuild.ts). 평가점수 예측 화면이 고른 공고의 파일만 받는다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const ids = Object.keys(await getAwardAnalyses());
  return (ids.length ? ids : ["none"]).map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  return Response.json((await getAwardAnalyses())[id] ?? null);
}
