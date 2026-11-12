import { NextResponse, type NextRequest } from "next/server";
import { hasServiceKey } from "@/lib/nara/client";
import { lookupCorp } from "@/lib/nara/corp";

/** 사업자등록번호로 나라장터 조달업체 정보 조회 (서버 배포에서만 동작, 정적 사이트에는 없음) */
export async function GET(req: NextRequest) {
  if (!hasServiceKey()) return NextResponse.json({ error: "나라장터 인증키가 설정되지 않았습니다." }, { status: 503 });
  try {
    const corp = await lookupCorp(req.nextUrl.searchParams.get("bizno") ?? "");
    if (!corp) return NextResponse.json({ error: "나라장터에 등록된 업체를 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json(corp);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
