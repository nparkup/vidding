import "server-only";
import type { MailLog } from "../types";

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

/**
 * SMTP 메일 발송 (네이버웍스·구글 워크스페이스·AWS SES SMTP 등 모두 가능).
 * SMTP_HOST 가 없으면 실제 발송 없이 기록만 남긴다.
 */
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<{ status: MailLog["status"]; error?: string }> {
  if (!smtpConfigured()) return { status: "미발송(SMTP 미설정)" };
  try {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT || 587);
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await t.sendMail({ from: process.env.MAIL_FROM || "입찰메이트LAB <no-reply@example.com>", to, subject, html, text });
    return { status: "발송" };
  } catch (e) {
    return { status: "실패", error: (e as Error).message.slice(0, 300) };
  }
}
