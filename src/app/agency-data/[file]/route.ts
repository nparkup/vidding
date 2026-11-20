import { agencyId } from "@/lib/awards/agency";
import { getAgencySummaries } from "@/lib/store";

/**
 * 수요기관 한 곳의 발주처 분석: /agency-data/{agencyId(이름)}.json. 빌드 때 지금 공고의 수요기관마다 만든다(scripts/awards/forBuild.ts).
 * 목록(/agency-data/index.json)은 이름·id·지금 공고 수만 담는다
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const ids = Object.keys(await getAgencySummaries()).map(agencyId);
  return [...ids, "index"].map((id) => ({ file: `${id}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.json$/, "");
  const all = await getAgencySummaries();
  if (id === "index") return Response.json(Object.values(all).map((s) => [s.name, agencyId(s.name), s.n]));
  return Response.json(Object.values(all).find((s) => agencyId(s.name) === id) ?? null);
}
