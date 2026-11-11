import { NextResponse, type NextRequest } from "next/server";
import { kstDay } from "@/lib/holidays";
import { runDailyDigest } from "@/lib/jobs";
import { getSettings } from "@/lib/store";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";

/**
 * 매시 정각 호출 권장. 설정된 발송 시각(KST) 이후 첫 호출에서 발송하고,
 * 같은 날 이미 발송한 고객사는 건너뛴다.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sendHour } = await getSettings();
  if (kstDay().hour < sendHour) return NextResponse.json({ skipped: `발송 시각(${sendHour}시) 전` });
  return NextResponse.json(await runDailyDigest());
}
