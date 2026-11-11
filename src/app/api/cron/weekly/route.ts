import { NextResponse, type NextRequest } from "next/server";
import { createWeeklyDrafts } from "@/lib/jobs";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 매주 월요일 아침: 프로·파트너 고객사 주간 보고서 초안 생성 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await createWeeklyDrafts());
}
