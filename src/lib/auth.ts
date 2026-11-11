/** 관리자 세션 토큰 (Edge/Node 공용, Web Crypto 사용) */
export const ADMIN_COOKIE = "ip_admin";

const DEV_PASSWORD = "admin1234";

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEV_PASSWORD;
}

export async function sessionToken(): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET || "dev-only-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`admin:${adminPassword()}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function usingDevPassword(): boolean {
  return !process.env.ADMIN_PASSWORD;
}
