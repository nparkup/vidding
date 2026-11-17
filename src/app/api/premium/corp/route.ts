import { NextResponse, type NextRequest } from "next/server";
import { lookupCompany } from "@/lib/corpLookup";

/** 사업자등록번호로 국세청·나라장터·금융위원회 기업 정보 조회 (서버 배포용. 정적 사이트는 Cloudflare 중계 서버 worker/corp-lookup 이 같은 일을 한다) */
export async function GET(req: NextRequest) {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return NextResponse.json({ error: "공공데이터포털 인증키가 설정되지 않았습니다." }, { status: 503 });
  try {
    return NextResponse.json(await lookupCompany(req.nextUrl.searchParams.get("bizno") ?? "", key));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
