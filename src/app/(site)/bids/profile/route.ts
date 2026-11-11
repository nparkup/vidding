import { NextResponse, type NextRequest } from "next/server";

/** 다중 선택 폼(lic=a&lic=b)을 콤마 구분 쿼리로 바꿔 /bids 로 보낸다 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const out = new URLSearchParams({
    lic: sp.getAll("lic").join(","),
    rg: sp.getAll("rg").join(","),
    min: sp.get("min") ?? "0",
    max: sp.get("max") ?? "500000000",
  });
  return NextResponse.redirect(new URL(`/bids?${out}`, req.url));
}
