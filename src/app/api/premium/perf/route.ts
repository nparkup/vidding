import { NextResponse, type NextRequest } from "next/server";
import { normalizeBizno, validBizno } from "@/lib/corpLookup";
import { fetchNtceClasses, fetchWins, perfBizOf } from "@/lib/perfLookup";

/** 유사 실적 조회 (서버 배포용. 정적 사이트는 Cloudflare 중계 서버 worker/corp-lookup 이 같은 일을 한다) */
export async function GET(req: NextRequest) {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return NextResponse.json({ error: "공공데이터포털 인증키가 설정되지 않았습니다." }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  try {
    if (sp.has("ntce")) {
      return NextResponse.json(await fetchNtceClasses(key, perfBizOf(sp.get("biz") ?? ""), (sp.get("ntce") ?? "").split(",")));
    }
    const no = normalizeBizno(sp.get("bizno") ?? "");
    if (!validBizno(no)) return NextResponse.json({ error: "올바른 사업자등록번호가 아닙니다." }, { status: 400 });
    return NextResponse.json(await fetchWins(key, no, perfBizOf(sp.get("perf") ?? ""), sp.get("from") ?? "", sp.get("to") ?? ""));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
