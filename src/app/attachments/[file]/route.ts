import { getAttachments, getExtractedSheets, getQualifications } from "@/lib/store";

/**
 * 공고 한 건의 첨부파일 목록, 빌드 때 첨부에서 추출한 평가표와 공고서의 기준(notice), 참가자격 자료(업종·지역 제한): /attachments/{공고번호-차수}.json
 * 정적 배포에서 평가점수 예측 화면이 고른 공고의 파일만 받도록 공고별로 나눠 만든다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const ids = [...new Set([...Object.keys(await getAttachments()), ...Object.keys(await getQualifications())])];
  // 첨부가 하나도 없으면(목업·미승인) 빌드가 비지 않도록 자리표시 하나를 둔다
  return (ids.length ? ids : ["none"]).map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  const extracted = (await getExtractedSheets())[id];
  return Response.json({ files: (await getAttachments())[id] ?? [], sheet: extracted?.sheet, sheetFile: extracted?.file, notice: extracted?.notice, quant: extracted?.quant, ai: extracted?.ai ? extracted.ai.hash : undefined, qual: (await getQualifications())[id] });
}
