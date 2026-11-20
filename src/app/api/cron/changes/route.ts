import { NextResponse, type NextRequest } from "next/server";
import { runChangeAlerts } from "@/lib/jobs";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 매시 호출 권장. 관심·추천·키워드 공고의 정정·취소를 바로 알린다 (같은 공고 차수는 한 번만) */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runChangeAlerts());
}
