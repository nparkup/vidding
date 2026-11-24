import { industryId, industryIndexRow } from "@/lib/awards/industry";
import { getIndustrySummaries } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";

/**
 * 업종 하나의 업종별 분석: /industry-data/{industryId(업종)}.json. 낙찰 수집이 만든 요약을 빌드가 받아 둔다(scripts/awards/forBuild.ts).
 * 목록(/industry-data/index.json)은 업종마다 [업종, id, 낙찰 건수, 최근 4년 낙찰금액, 적격심사 낙찰률, 참가업체 수]
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return [...CATEGORIES.map(industryId), "index"].map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  const all = await getIndustrySummaries();
  if (id === "index") return Response.json(Object.values(all).map(industryIndexRow));
  return Response.json(Object.values(all).find((s) => industryId(s.name) === id) ?? null);
}
