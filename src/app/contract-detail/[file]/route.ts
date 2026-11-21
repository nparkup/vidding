import { CONTRACT_SHARDS, contractShard, type ContractDetail } from "@/lib/contracts";
import { getContracts } from "@/lib/store";

/**
 * 계약 상세 항목 조각: /contract-detail/{0..15}.json = { 통합계약번호: 상세 }.
 * 계약마다 정적 페이지를 만들지 않고, 상세 화면(/contracts/view?no=)이 그 계약이 든 조각 하나만 받는다.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return Array.from({ length: CONTRACT_SHARDS }, (_, i) => ({ file: `${i}.json` }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const shard = Number((await params).file.replace(/\.json$/, ""));
  const out: Record<string, ContractDetail> = {};
  for (const c of await getContracts()) if (c.x && contractShard(c.no) === shard) out[c.no] ??= c.x;
  return Response.json(out);
}
