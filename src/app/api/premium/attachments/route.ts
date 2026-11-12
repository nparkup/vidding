import { NextResponse, type NextRequest } from "next/server";
import { hasServiceKey } from "@/lib/nara/client";
import { bidAttachments } from "@/lib/nara/corp";

/** 공고 첨부파일(공고서·규격서) 목록. 입찰공고정보서비스 활용신청 승인 후 동작 */
export async function GET(req: NextRequest) {
  if (!hasServiceKey()) return NextResponse.json({ error: "나라장터 인증키가 설정되지 않았습니다." }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const no = sp.get("no") ?? "";
  if (!/^[A-Z0-9]{8,20}$/.test(no)) return NextResponse.json({ error: "공고번호 형식이 올바르지 않습니다." }, { status: 400 });
  try {
    return NextResponse.json(await bidAttachments(no, sp.get("ord") ?? "000", sp.get("biz") ?? "용역"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
