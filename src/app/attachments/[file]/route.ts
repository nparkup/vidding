import { getAttachments } from "@/lib/store";

/**
 * 공고 한 건의 첨부파일 목록: /attachments/{공고번호-차수}.json
 * 정적 배포에서 평가점수 예측 화면이 고른 공고의 파일만 받도록 공고별로 나눠 만든다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const all = await getAttachments();
  const ids = Object.keys(all);
  // 첨부가 하나도 없으면(목업·미승인) 빌드가 비지 않도록 자리표시 하나를 둔다
  return (ids.length ? ids : ["none"]).map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  return Response.json((await getAttachments())[id] ?? []);
}
