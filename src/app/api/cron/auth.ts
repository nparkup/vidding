import type { NextRequest } from "next/server";

/** 스케줄러(Vercel Cron, crontab 등) 호출 인증: Authorization: Bearer $CRON_SECRET */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
