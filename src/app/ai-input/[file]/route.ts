import { getExtractedSheets } from "@/lib/store";

/**
 * AI 판독 입력: /ai-input/{공고번호-차수}.json (규칙 파서가 배점표를 못 읽은 공고의 평가 관련 본문)
 * 평가점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?aisheet=)가 이 파일을 읽어 Claude에 보낸다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const ids = Object.entries(await getExtractedSheets()).filter(([, s]) => s.ai).map(([id]) => id);
  return (ids.length ? ids : ["none"]).map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  const ai = (await getExtractedSheets())[id]?.ai;
  return ai ? Response.json(ai) : Response.json({ none: true });
}
