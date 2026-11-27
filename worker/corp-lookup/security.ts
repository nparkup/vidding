/**
 * 중계 서버 보안 도구 (2026-11 보안 점검 후속).
 *
 * - 요청 제한: wrangler.toml [[ratelimits]] 바인딩(Workers Rate Limiting). IP마다 1분 단위로 센다. 바인딩이 없으면(로컬 등) 막지 않는다.
 * - Anthropic 하루 상한: 배점표 판독·같은 사업 판정이 새로 Claude를 부를 때만 R2 ops/ai-daily/{한국 날짜}.json 에 센다.
 *   여러 IP로 나눠 불러도 하루 비용이 상한을 넘지 않게 한다 (기본 1,500회, 변수 AI_DAILY_LIMIT).
 * - 관리자 2단계 인증(TOTP, RFC 6238): 30초마다 바뀌는 6자리. 비밀값은 R2 config/admin-totp.json.
 *   휴대폰을 잃어버렸으면 Cloudflare 대시보드 R2 bidmate-awards 에서 config/admin-totp.json 을 지우면 꺼진다.
 * - 응답 보안 헤더: 모든 응답에 붙인다 (JSON API라 다른 사이트 화면에 끼워 넣거나 스크립트로 해석할 일이 없다).
 */

export interface RateLimiter { limit(o: { key: string }): Promise<{ success: boolean }> }

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/** 응답에 보안 헤더를 더한다 (이미 있는 값은 그대로) */
export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

/** 요청 제한에 걸렸으면 true. 바인딩이 없거나 확인이 실패하면 막지 않는다 */
export async function overLimit(rl: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!rl) return false;
  try { return !(await rl.limit({ key })).success; } catch { return false; }
}

interface Bucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
}
const readJson = async <T>(b: Bucket, key: string): Promise<T | null> => {
  const o = await b.get(key);
  if (!o) return null;
  try { return JSON.parse(new TextDecoder().decode(await o.arrayBuffer())) as T; } catch { return null; }
};
const putJson = (b: Bucket, key: string, v: unknown) => b.put(key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });
export const kstDate = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

/** Anthropic 하루 상한. 남았으면 1을 더하고 true, 넘었으면 false (동시에 몰리면 몇 건 넘을 수 있다) */
export async function takeAiBudget(bucket: Bucket | undefined, limitVar: string | undefined): Promise<boolean> {
  if (!bucket) return true;
  const limit = Number(limitVar) > 0 ? Number(limitVar) : 1500;
  const key = `ops/ai-daily/${kstDate()}.json`;
  const cur = (await readJson<{ n?: number }>(bucket, key))?.n ?? 0;
  if (cur >= limit) return false;
  await putJson(bucket, key, { n: cur + 1, limit });
  return true;
}

// ---- 관리자 로그인 실패 잠금 (IP마다 15분에 5번) ----
const FAIL_MAX = 5;
const FAIL_WINDOW = 15 * 60_000;
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const failKey = async (ip: string) => `auth/admin-fail/${(await sha(`bidmate-admin-fail:${ip}`)).slice(0, 32)}.json`;
export async function adminLocked(bucket: Bucket, ip: string): Promise<boolean> {
  const f = await readJson<{ until?: number }>(bucket, await failKey(ip));
  return !!f?.until && f.until > Date.now();
}
export async function adminFail(bucket: Bucket, ip: string): Promise<void> {
  const k = await failKey(ip);
  const f = await readJson<{ n: number; first: number }>(bucket, k);
  const fresh = !f || Date.now() - f.first > FAIL_WINDOW;
  const n = fresh ? 1 : f.n + 1;
  await putJson(bucket, k, { n, first: fresh ? Date.now() : f.first, ...(n >= FAIL_MAX ? { until: Date.now() + FAIL_WINDOW } : {}) });
}
export const adminFailClear = async (bucket: Bucket, ip: string) => { await bucket.delete(await failKey(ip)); };

// ---- TOTP ----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Uint8Array): string {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function unbase32(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of clean) {
    val = (val << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", unbase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  let x = step;
  for (let i = 7; i >= 0; i--) { msg[i] = x & 255; x = Math.floor(x / 256); }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
/** 앞뒤 30초까지 허용한다 (휴대폰 시계가 조금 틀려도 되게) */
export async function totpOk(secret: string, code: string, now = Date.now()): Promise<boolean> {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return false;
  const step = Math.floor(now / 30_000);
  for (const d of [-1, 0, 1]) if ((await totpAt(secret, step + d)) === c) return true;
  return false;
}
export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)));

export interface AdminTotp { secret: string; on: boolean; at: string }
export const TOTP_KEY = "config/admin-totp.json";
let totpCache: { at: number; v: AdminTotp | null } | null = null;
export async function readTotp(bucket: Bucket, fresh = false): Promise<AdminTotp | null> {
  if (!fresh && totpCache && Date.now() - totpCache.at < 30_000) return totpCache.v;
  const v = await readJson<AdminTotp>(bucket, TOTP_KEY);
  totpCache = { at: Date.now(), v: v && /^[A-Z2-7]{16,}$/.test(v.secret) ? v : null };
  return totpCache.v;
}
export async function writeTotp(bucket: Bucket, v: AdminTotp | null) {
  if (v) await putJson(bucket, TOTP_KEY, v); else await bucket.delete(TOTP_KEY);
  totpCache = { at: Date.now(), v };
}

// ---- Cloudflare Turnstile (로봇 확인) ----
/**
 * 가입·로그인·비밀번호 처음 정하기 요청의 Turnstile 토큰을 Cloudflare에 확인한다.
 * Worker 비밀값 TURNSTILE_SECRET 이 없으면 확인하지 않는다(키를 넣기 전에도 사이트가 멈추지 않게).
 * 화면은 저장소 변수 TURNSTILE_SITE_KEY → NEXT_PUBLIC_TURNSTILE_SITE_KEY 로 위젯을 띄운다 (src/components/Turnstile.tsx).
 */
export async function turnstileOk(secret: string | undefined, token: unknown, ip: string): Promise<boolean> {
  if (!secret) return true;
  const t = typeof token === "string" ? token : "";
  if (!t || t.length > 4096) return false;
  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", t);
    if (ip) body.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}
