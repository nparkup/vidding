import type { Bid } from "@/lib/types";
import { getAttachments, getBids, getExtractedSheets, getQualifications } from "@/lib/store";

let byId: Map<string, Bid> | null = null;

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
  byId ??= new Map((await getBids()).map((x) => [x.id, x]));
  const b = byId.get(id);
  // bid: 중계 서버가 빌드에서 읽지 못한 공고의 첨부를 그 자리에서 읽을 때 쓰는 공고 정보 (worker/corp-lookup ?aisheet=)
  return Response.json({
    files: (await getAttachments())[id] ?? [], sheet: extracted?.sheet, sheetFile: extracted?.file, notice: extracted?.notice, quant: extracted?.quant,
    ai: extracted?.ai ? extracted.ai.hash : undefined, read: extracted?.read, qual: (await getQualifications())[id],
    bid: b ? { id: b.id, title: b.title, contractMethod: b.contractMethod, agency: b.agency, bizType: b.bizType, category: b.category, baseAmount: b.baseAmount || undefined, lowerLimitRate: b.lowerLimitRate || undefined } : undefined,
  });
}
