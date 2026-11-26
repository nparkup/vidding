/**
 * 회원 로그인 API (src/lib/account.ts). 모든 요청은 ?account=동작 이고, signup·login·claim 을 빼면 Authorization: Bearer 회원 토큰이 있어야 한다.
 *
 * - POST signup   : 회원가입 (가입 정보 + 비밀번호) → 토큰. 이미 가입된 사업자번호·이메일은 받지 않는다
 * - POST login    : 이메일(또는 사업자번호) + 비밀번호 → 30일 토큰
 * - POST claim    : 비밀번호 없이 가입했던 예전 회원이 사업자번호·이메일·연락처를 맞추고 비밀번호를 정한다 → 토큰
 * - GET  me       : 가입 정보, 이용권, 이번 기간 공고 예측 사용 건수 (무료 체험이면 체험 사용 공고)
 * - POST me       : 담당자·연락처·이메일·맞춤 조건·메일 수신 고치기
 * - POST password : 비밀번호 바꾸기 (다른 기기의 로그인은 모두 풀린다) → 새 토큰
 * - POST use      : 공고 예측 1건 사용 { k: "nara:공고ID" | "apt:입찰번호" | "nuri:공고번호-차수", title }. 유료면 이용권 월 건수에서, 아니면 무료 체험에서 뺀다.
 *                   이미 쓴 공고는 다시 빼지 않는다
 * - GET  mybox / POST mybox : 내 서류함 (담은 공고 목록)
 * - POST withdraw : 회원 탈퇴 { password, mode: "now" | "scheduled", reason }. 남은 이용권이 있으면 scheduled 로
 *                   이용권 마지막 날까지 쓰고 다음 날 지울 수 있다(다음 결제 없음). now 는 바로 지우고 남은 기간은 환불하지 않는다
 * - POST withdraw-cancel : 탈퇴 예약 취소
 *
 * 비밀번호는 PBKDF2-SHA256(10만 번, 사업자번호마다 다른 16바이트 salt)으로 만든 값만 저장한다. 원문은 어디에도 남기지 않는다.
 * 토큰 서명 키는 Worker 비밀값 MEMBER_SECRET, 없으면 처음 쓸 때 R2 config/auth-key.json 에 무작위로 만들어 둔다 (R2는 공개되지 않는다).
 *
 * R2 저장 위치
 * - members/{사업자번호}.json        : 가입 정보 + auth { email, pw: { i, s, h }, ver, setAt, lastLogin, temp }
 * - auth/email/{이메일 해시}.json    : 로그인 이메일 → 사업자번호
 * - auth/fail/{아이디 해시}.json     : 비밀번호 틀린 횟수 (15분에 5번 넘으면 15분 잠금)
 * - usage/{사업자번호}/{기간 시작일}.json : 유료 이용권 공고 예측 사용 공고
 * - trial/{사업자번호}.json           : 무료 체험 사용 공고 (?trial= 과 같은 파일)
 * - mybox/{사업자번호}.json           : 내 서류함
 * - withdraw/pending/{사업자번호}.json : 탈퇴 예약 (on = 마지막 이용일). 매일 0시 10분(한국) 예약 작업과 로그인·관리자 목록이 지난 예약을 처리한다
 * - withdraw/done/{사업자번호}.json    : 탈퇴한 회원 기록 (회사명·사업자번호·탈퇴 방식·날짜만. 담당자·연락처·이메일은 남기지 않는다)
 */
import { normalizeBizno, validBizno } from "../../src/lib/corpLookup";
import { kstToday, limitOf, passLastDay, type BillingLike, type LimitInfo, type WithdrawInfo } from "../../src/lib/usagePeriod";
import { readSiteConfig, type AdminBucket } from "./admin";

export interface AccountEnv {
  AWARDS?: AdminBucket;
  MEMBER_SECRET?: string;
}

type Json = (body: unknown, status?: number, extra?: Record<string, string>) => Response;

export interface PwHash { i: number; s: string; h: string }
export interface MemberAuth { email: string; pw: PwHash; ver: number; setAt: string; lastLogin?: string; temp?: boolean }
type Rec = Record<string, unknown> & { bizno?: string; email?: string; status?: string; auth?: MemberAuth };

const SESSION_MS = 30 * 86400_000;
const PBKDF2_ITER = 100_000;
const MAX_FAIL = 5;
const LOCK_MS = 15 * 60_000;
const noStore = { "Cache-Control": "no-store" };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((x) => parseInt(x, 16)));
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

const readJson = async <T = Rec>(bucket: AdminBucket, key: string): Promise<T | null> => {
  const o = await bucket.get(key);
  if (!o) return null;
  try { return JSON.parse(new TextDecoder().decode(await o.arrayBuffer())) as T; } catch { return null; }
};
const putJson = (bucket: AdminBucket, key: string, v: unknown) => bucket.put(key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });

export const normEmail = (e: string) => e.trim().toLowerCase();
export const emailKey = async (email: string) => `auth/email/${await sha(`bidmate-email:${normEmail(email)}`)}.json`;

/** 비밀번호 규칙: 8~64자, 영문과 숫자를 모두 */
export function pwProblem(pw: string): string {
  if (pw.length < 8 || pw.length > 64) return "비밀번호는 8자 이상 64자 이하로 정해 주세요.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "비밀번호에 영문과 숫자를 함께 넣어 주세요.";
  return "";
}

export async function hashPassword(pw: string, iter = PBKDF2_ITER, salt?: Uint8Array): Promise<PwHash> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations: iter }, key, 256);
  return { i: iter, s: hex(s), h: hex(bits) };
}

async function checkPassword(pw: string, h: PwHash): Promise<boolean> {
  const x = await hashPassword(pw, h.i, unhex(h.s));
  return same(x.h, h.h);
}

/** 길이가 같은 두 문자열을 끝까지 비교한다 (응답 시간으로 맞힌 글자 수를 알 수 없게) */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** 토큰 서명 키 */
let keyCache: CryptoKey | null = null;
async function signKey(env: AccountEnv, bucket: AdminBucket): Promise<CryptoKey> {
  if (keyCache) return keyCache;
  let secret = env.MEMBER_SECRET && env.MEMBER_SECRET.length >= 16 ? env.MEMBER_SECRET : "";
  if (!secret) {
    const cur = await readJson<{ key?: string }>(bucket, "config/auth-key.json");
    secret = cur?.key ?? "";
    if (!/^[0-9a-f]{64}$/.test(secret)) {
      secret = hex(crypto.getRandomValues(new Uint8Array(32)));
      await putJson(bucket, "config/auth-key.json", { key: secret, createdAt: new Date().toISOString() });
    }
  }
  keyCache = await crypto.subtle.importKey("raw", enc.encode(`bidmate-member:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return keyCache;
}

async function sign(env: AccountEnv, bucket: AdminBucket, bizno: string, ver: number) {
  const exp = Date.now() + SESSION_MS;
  const body = `m1.${bizno}.${exp}.${ver}`;
  const sig = hex(await crypto.subtle.sign("HMAC", await signKey(env, bucket), enc.encode(body)));
  return { token: `${body}.${sig}`, exp };
}

/** 토큰이 맞으면 그 회원 가입 정보 (비밀번호를 바꿨거나 탈퇴했으면 null) */
export async function memberOfToken(token: string, env: AccountEnv, bucket: AdminBucket): Promise<Rec | null> {
  const m = /^m1\.(\d{10})\.(\d{10,16})\.(\d{1,9})\.([0-9a-f]{64})$/.exec(token);
  if (!m || Number(m[2]) < Date.now()) return null;
  const body = `m1.${m[1]}.${m[2]}.${m[3]}`;
  const sig = hex(await crypto.subtle.sign("HMAC", await signKey(env, bucket), enc.encode(body)));
  if (!same(sig, m[4])) return null;
  const rec = await readJson(bucket, `members/${m[1]}.json`);
  if (!rec?.auth || rec.auth.ver !== Number(m[3])) return null;
  if (await finishIfDue(bucket, rec)) return null;
  return rec;
}

/** 탈퇴 예약 마지막 이용일이 지났으면 지금 탈퇴 처리한다. 처리했으면 true */
export async function finishIfDue(bucket: AdminBucket, rec: Rec | null, today = kstToday()): Promise<boolean> {
  const w = rec?.withdraw as WithdrawInfo | undefined;
  if (!rec || w?.mode !== "scheduled" || !w.on || today <= w.on) return false;
  await finishWithdraw(bucket, rec, "scheduled", w.reason, w.requestedAt);
  return true;
}

/**
 * 탈퇴 처리: 가입 정보·로그인 계정·서류함·결제 기록을 지운다. 무료 체험 사용 기록(trial/)은 남긴다(다시 가입해도 체험 건수가 새로 생기지 않게).
 * withdraw/done/ 에는 회사명·사업자번호·방식·날짜만 남긴다.
 */
export async function finishWithdraw(bucket: AdminBucket, rec: Rec, mode: "now" | "scheduled" | "admin", reason?: string, requestedAt?: string) {
  const bizno = String(rec.bizno);
  const billing = await readJson<BillingLike>(bucket, `billing/${bizno}.json`);
  const today = kstToday();
  const last = passLastDay(billing, today);
  const done = {
    bizno, company: String(rec.company ?? ""), mode, at: new Date().toISOString(), requestedAt: requestedAt ?? new Date().toISOString(),
    joinedAt: rec.joinedAt ?? null, plan: billing?.plan || null,
    passEnd: mode === "scheduled" ? ((rec.withdraw as WithdrawInfo | undefined)?.on ?? last) : last,
    // 바로 탈퇴했는데 이용권 기간이 남아 있었으면 그 마지막 날 (환불 없음)
    forfeit: mode !== "scheduled" && last && last >= today ? last : null,
    reason: reason || undefined,
  };
  await putJson(bucket, `withdraw/done/${bizno}.json`, done);
  await deleteAccountData(bucket, rec, bizno);
  await bucket.delete(`members/${bizno}.json`);
  await bucket.delete(`billing/${bizno}.json`);
  await bucket.delete(`withdraw/pending/${bizno}.json`);
  return done;
}

/** 매일 예약 작업: 마지막 이용일이 지난 탈퇴 예약을 처리한다 */
export async function processDueWithdrawals(bucket: AdminBucket, today = kstToday()): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  do {
    const r = await bucket.list({ prefix: "withdraw/pending/", cursor, limit: 1000 });
    for (const o of r.objects) {
      const p = await readJson<{ bizno?: string; on?: string }>(bucket, o.key);
      if (!p?.bizno || !p.on || today <= p.on) continue;
      const rec = await readJson(bucket, `members/${p.bizno}.json`);
      if (!rec) { await bucket.delete(o.key); continue; }
      if (await finishIfDue(bucket, rec, today)) n++;
      else if (!(rec.withdraw as WithdrawInfo | undefined)) await bucket.delete(o.key);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return n;
}

/** 탈퇴 예약 취소 (회원 또는 관리자) */
export async function cancelWithdraw(bucket: AdminBucket, rec: Rec): Promise<Rec> {
  const next: Rec = { ...rec };
  delete next.withdraw;
  await putJson(bucket, `members/${String(rec.bizno)}.json`, next);
  await bucket.delete(`withdraw/pending/${String(rec.bizno)}.json`);
  return next;
}

/** 화면에 돌려줄 가입 정보 (비밀번호 해시·관리 메모는 빼고) */
export function publicMember(rec: Rec) {
  const { auth, memo: _memo, ...rest } = rec;
  void _memo;
  return { ...rest, login: auth ? { email: auth.email, lastLogin: auth.lastLogin ?? null, temp: !!auth.temp } : null };
}

/** 관리자 화면용: 비밀번호 해시만 빼고 로그인 여부를 붙인다 */
export function adminMember(rec: Rec) {
  const { auth, ...rest } = rec;
  return { ...rest, login: auth ? { email: auth.email, setAt: auth.setAt, lastLogin: auth.lastLogin ?? null, temp: !!auth.temp } : null };
}

/** 로그인 이메일 색인을 옮긴다. 다른 회원이 쓰는 이메일이면 false */
export async function moveEmail(bucket: AdminBucket, bizno: string, from: string | undefined, to: string): Promise<boolean> {
  const nk = await emailKey(to);
  const owner = await readJson<{ bizno?: string }>(bucket, nk);
  if (owner?.bizno && owner.bizno !== bizno) {
    // 탈퇴 등으로 주인이 없어진 색인은 새로 쓴다
    const still = await readJson(bucket, `members/${owner.bizno}.json`);
    if (still?.auth && normEmail(still.auth.email) === normEmail(to)) return false;
  }
  await putJson(bucket, nk, { bizno });
  if (from && normEmail(from) !== normEmail(to)) {
    const ok = await emailKey(from);
    const cur = await readJson<{ bizno?: string }>(bucket, ok);
    if (cur?.bizno === bizno) await bucket.delete(ok);
  }
  return true;
}

/** 관리자 화면: 임시 비밀번호 발급 (회원이 로그인하면 바꾸라고 안내한다). 다른 기기 로그인은 풀린다 */
export async function issueTempPassword(bucket: AdminBucket, bizno: string): Promise<{ temp: string } | { error: string }> {
  const rec = await readJson(bucket, `members/${bizno}.json`);
  if (!rec) return { error: "가입 정보가 없습니다." };
  const email = rec.auth?.email ?? String(rec.email ?? "");
  if (!EMAIL.test(email)) return { error: "회원 이메일이 없어 로그인 계정을 만들 수 없습니다. 이메일부터 저장해 주세요." };
  const temp = makeTempPassword();
  if (!(await moveEmail(bucket, bizno, rec.auth?.email, email))) return { error: "이 이메일은 다른 회원이 로그인에 쓰고 있습니다." };
  rec.auth = { email: normEmail(email), pw: await hashPassword(temp), ver: (rec.auth?.ver ?? 0) + 1, setAt: new Date().toISOString(), lastLogin: rec.auth?.lastLogin, temp: true };
  await putJson(bucket, `members/${bizno}.json`, rec);
  return { temp };
}

/** 임시 비밀번호: 헷갈리는 글자(0·O·1·l·I)를 뺀 영문+숫자 10자 */
export function makeTempPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let temp = "";
  while (pwProblem(temp)) temp = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => abc[x % abc.length]).join("");
  return temp;
}

/**
 * 관리자 화면: 회원 직접 등록. 회원가입과 같은 항목(회사명·사업자등록번호·담당자·연락처·이메일·맞춤 조건)을 받고
 * 로그인 계정도 같이 만든다. 비밀번호를 비워 두면 임시 비밀번호를 만들어 한 번만 돌려준다(저장은 해시만).
 * mustChange 면 회원이 로그인했을 때 비밀번호를 바꾸라고 안내한다(임시 비밀번호는 늘 안내).
 */
export async function createMemberByAdmin(bucket: AdminBucket, body: Record<string, unknown>): Promise<{ rec: Rec; temp?: string } | { error: string; status: number }> {
  const bizno = normalizeBizno(s(body.bizno, 20));
  if (!validBizno(bizno)) return { error: "올바른 사업자등록번호가 아닙니다. 숫자 10자리를 다시 확인해 주세요.", status: 400 };
  const email = normEmail(s(body.email, 120));
  if (!EMAIL.test(email)) return { error: "이메일 주소를 확인해 주세요. 로그인 아이디로 씁니다.", status: 400 };
  const m: Rec = {
    company: s(body.company, 100), bizno, name: s(body.name, 40), email, phone: s(body.phone, 30),
    licenses: list(body.licenses, 40), regions: list(body.regions, 20), size: s(body.size, 40), keywords: s(body.keywords, 200),
    agreePrivacy: body.agreePrivacy === true, agreeMail: body.agreeMail === true, plan: s(body.plan, 20),
    status: body.status === "suspended" ? "suspended" : "active", memo: s(body.memo, 1000),
  };
  if (!m.company || !m.name || !m.phone) return { error: "회사명, 담당자 이름, 연락처를 입력해 주세요.", status: 400 };
  let pw = String(body.password ?? "");
  let temp: string | undefined;
  if (!pw) pw = temp = makeTempPassword();
  const bad = pwProblem(pw);
  if (bad) return { error: bad, status: 400 };
  const key = `members/${bizno}.json`;
  if (await readJson(bucket, key)) return { error: "이미 가입된 사업자등록번호입니다. 목록에서 그 회원을 찾아 고쳐 주세요.", status: 409 };
  if (!(await moveEmail(bucket, bizno, undefined, email))) return { error: "이 이메일은 다른 회원이 로그인에 쓰고 있습니다.", status: 409 };
  const now = new Date().toISOString();
  const rec: Rec = { ...m, joinedAt: now, createdBy: "admin", auth: { email, pw: await hashPassword(pw), ver: 1, setAt: now, temp: !!temp || body.mustChange === true } };
  await putJson(bucket, key, rec);
  return { rec, temp };
}

/** 탈퇴: 로그인 색인·서류함도 지운다 */
export async function deleteAccountData(bucket: AdminBucket, rec: Rec | null, bizno: string) {
  if (rec?.auth?.email) {
    const k = await emailKey(rec.auth.email);
    const cur = await readJson<{ bizno?: string }>(bucket, k);
    if (cur?.bizno === bizno) await bucket.delete(k);
  }
  await bucket.delete(`mybox/${bizno}.json`);
}

/** 이번 기간 사용 현황. 한도는 요금제 기본 한도, 관리자가 정한 회원별 개별 한도(rec.limit)가 있으면 그 값 */
async function usageOf(bucket: AdminBucket, rec: Rec) {
  const bizno = String(rec.bizno);
  const [billing, cfg] = await Promise.all([readJson(bucket, `billing/${bizno}.json`), readSiteConfig(bucket)]);
  const lim = limitOf(billing as Parameters<typeof limitOf>[0], cfg.pricing, cfg.trialLimit, rec.limit);
  if (lim.tier !== "trial" && lim.period) {
    const period = lim.period;
    const u = await readJson<{ used?: UseEntry[] }>(bucket, `usage/${bizno}/${period.from}.json`);
    return { mode: "paid" as const, plan: lim.tier, quota: lim.quota, base: lim.base, custom: lim.custom, admin: !!lim.admin, period, end: String(billing?.end ?? ""), used: u?.used ?? [], key: `usage/${bizno}/${period.from}.json` };
  }
  const t = await readJson<{ used?: UseEntry[] }>(bucket, `trial/${bizno}.json`);
  return { mode: "trial" as const, quota: lim.quota, base: lim.base, custom: lim.custom, admin: !!lim.admin, used: t?.used ?? [], key: `trial/${bizno}.json` };
}
interface UseEntry { k: string; t: number; title?: string }

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => s(x, 60)).filter(Boolean).slice(0, max) : []);

export async function handleAccount(req: Request, env: AccountEnv, json: Json): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const action = sp.get("account") ?? "";
  if (!env.AWARDS) return json({ error: "회원 저장소가 아직 없습니다." }, 503);
  const bucket = env.AWARDS;
  const post = req.method === "POST";
  let body: Record<string, unknown> = {};
  if (post) {
    const raw = await req.text();
    if (raw.length > 64_000) return json({ error: "입력이 너무 깁니다." }, 413);
    try { body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { return json({ error: "잘못된 요청" }, 400); }
  }
  const nowIso = () => new Date().toISOString();

  // 비밀번호 대입 막기: 아이디마다 15분에 5번까지
  const failKey = async (id: string) => `auth/fail/${await sha(`bidmate-fail:${id.toLowerCase()}`)}.json`;
  const locked = async (id: string) => {
    const f = await readJson<{ n: number; first: number; until?: number }>(bucket, await failKey(id));
    return !!f?.until && f.until > Date.now();
  };
  const fail = async (id: string) => {
    const k = await failKey(id);
    const f = await readJson<{ n: number; first: number; until?: number }>(bucket, k);
    const fresh = !f || Date.now() - f.first > LOCK_MS;
    const n = fresh ? 1 : f.n + 1;
    await putJson(bucket, k, { n, first: fresh ? Date.now() : f.first, ...(n >= MAX_FAIL ? { until: Date.now() + LOCK_MS } : {}) });
    await new Promise((r) => setTimeout(r, 800));
  };
  const LOCK_MSG = "비밀번호를 여러 번 틀려 15분 동안 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.";
  const issue = async (rec: Rec) => {
    const t = await sign(env, bucket, String(rec.bizno), rec.auth!.ver);
    return { ...t, member: publicMember(rec) };
  };

  if (action === "signup" || action === "login" || action === "claim") {
    if (!post) return json({ error: "POST만 지원합니다." }, 405);
    if (action === "login") {
      const id = s(body.id, 120);
      const pw = String(body.password ?? "");
      if (!id || !pw) return json({ error: "이메일과 비밀번호를 입력해 주세요." }, 400);
      if (await locked(id)) return json({ error: LOCK_MSG }, 429, noStore);
      let bizno = "";
      const digits = normalizeBizno(id);
      if (!id.includes("@") && digits.length === 10) bizno = digits;
      else bizno = (await readJson<{ bizno?: string }>(bucket, await emailKey(id)))?.bizno ?? "";
      let rec = bizno ? await readJson(bucket, `members/${bizno}.json`) : null;
      if (await finishIfDue(bucket, rec)) rec = null;
      if (!rec?.auth || !(await checkPassword(pw, rec.auth.pw))) {
        // 없는 아이디는 기록을 남기지 않고 늦추기만 한다
        if (rec) await fail(id); else await new Promise((r) => setTimeout(r, 800));
        if (rec && !rec.auth) return json({ error: "비밀번호를 아직 정하지 않은 회원입니다. 아래 '비밀번호 처음 정하기'로 정해 주세요.", code: "no-password" }, 401, noStore);
        return json({ error: "이메일(사업자등록번호) 또는 비밀번호가 맞지 않습니다." }, 401, noStore);
      }
      if (rec.status === "suspended") return json({ error: "이용이 정지된 계정입니다. 고객센터로 문의해 주세요." }, 403, noStore);
      rec.auth.lastLogin = nowIso();
      await putJson(bucket, `members/${bizno}.json`, rec);
      await bucket.delete(await failKey(id));
      return json(await issue(rec), 200, noStore);
    }

    const pw = String(body.password ?? "");
    const bad = pwProblem(pw);
    if (bad) return json({ error: bad }, 400);
    const bizno = normalizeBizno(s(body.bizno, 20));
    if (!validBizno(bizno)) return json({ error: "올바른 사업자등록번호가 아닙니다." }, 400);
    const email = normEmail(s(body.email, 120));
    if (!EMAIL.test(email)) return json({ error: "이메일 주소를 확인해 주세요." }, 400);
    const key = `members/${bizno}.json`;
    const cur = await readJson(bucket, key);

    if (action === "claim") {
      // 예전(비밀번호 없는) 가입 회원만. 가입 때 적은 이메일·연락처가 모두 맞아야 한다
      if (await locked(bizno)) return json({ error: LOCK_MSG }, 429, noStore);
      const phone = s(body.phone, 30).replace(/\D/g, "");
      if (!cur) return json({ error: "가입 정보가 없습니다. 회원가입을 먼저 해 주세요." }, 404, noStore);
      if (cur.auth) return json({ error: "이미 비밀번호를 정한 회원입니다. 로그인해 주세요." }, 409, noStore);
      if (normEmail(String(cur.email ?? "")) !== email || String(cur.phone ?? "").replace(/\D/g, "") !== phone || !phone) {
        await fail(bizno);
        return json({ error: "가입 때 적으신 이메일·연락처와 맞지 않습니다." }, 401, noStore);
      }
      if (cur.status === "suspended") return json({ error: "이용이 정지된 계정입니다. 고객센터로 문의해 주세요." }, 403, noStore);
      if (!(await moveEmail(bucket, bizno, undefined, email))) return json({ error: "이 이메일은 다른 회원이 로그인에 쓰고 있습니다." }, 409);
      cur.auth = { email, pw: await hashPassword(pw), ver: 1, setAt: nowIso(), lastLogin: nowIso() };
      await putJson(bucket, key, cur);
      await bucket.delete(await failKey(bizno));
      return json(await issue(cur), 200, noStore);
    }

    // signup
    const m = {
      company: s(body.company, 100), bizno, name: s(body.name, 40), email, phone: s(body.phone, 30),
      licenses: list(body.licenses, 40), regions: list(body.regions, 20), size: s(body.size, 40), keywords: s(body.keywords, 200),
      agreePrivacy: body.agreePrivacy === true, agreeMail: body.agreeMail === true, plan: s(body.plan, 20),
    };
    if (!m.company || !m.name || !m.phone) return json({ error: "회사명, 담당자 이름, 연락처를 입력해 주세요." }, 400);
    if (!m.agreePrivacy) return json({ error: "개인정보 수집·이용에 동의해 주세요." }, 400);
    if (cur) return json({ status: "exists", hasPassword: !!cur.auth }, 200, noStore);
    if (!(await moveEmail(bucket, bizno, undefined, email))) return json({ error: "이미 다른 사업자번호로 가입된 이메일입니다. 로그인하거나 다른 이메일을 써 주세요." }, 409);
    const rec: Rec = { ...m, joinedAt: nowIso(), auth: { email, pw: await hashPassword(pw), ver: 1, setAt: nowIso(), lastLogin: nowIso() } };
    await putJson(bucket, key, rec);
    return json({ status: "ok", ...(await issue(rec)) }, 200, noStore);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const rec = await memberOfToken(token, env, bucket);
  if (!rec) return json({ error: "로그인이 필요합니다." }, 401, noStore);
  const bizno = String(rec.bizno);
  const key = `members/${bizno}.json`;

  switch (action) {
    case "me": {
      if (post) {
        const next: Rec = { ...rec };
        for (const [k, max] of [["name", 40], ["phone", 30], ["size", 40], ["keywords", 200]] as [string, number][]) if (k in body) next[k] = s(body[k], max);
        for (const [k, max] of [["licenses", 40], ["regions", 20]] as [string, number][]) if (k in body) next[k] = list(body[k], max);
        if ("agreeMail" in body) next.agreeMail = body.agreeMail === true;
        if (!next.name || !next.phone) return json({ error: "담당자 이름과 연락처는 비울 수 없습니다." }, 400);
        if ("email" in body) {
          const email = normEmail(s(body.email, 120));
          if (!EMAIL.test(email)) return json({ error: "이메일 주소를 확인해 주세요." }, 400);
          if (email !== rec.auth!.email) {
            if (!(await moveEmail(bucket, bizno, rec.auth!.email, email))) return json({ error: "이 이메일은 다른 회원이 로그인에 쓰고 있습니다." }, 409);
            next.auth = { ...rec.auth!, email };
          }
          next.email = email;
        }
        next.updatedAt = nowIso();
        await putJson(bucket, key, next);
        return json({ status: "ok", member: publicMember(next) }, 200, noStore);
      }
      const u = await usageOf(bucket, rec);
      const { key: _k, ...usage } = u;
      void _k;
      return json({ member: publicMember(rec), usage }, 200, noStore);
    }
    case "password": {
      if (!post) break;
      if (!(await checkPassword(String(body.current ?? ""), rec.auth!.pw))) {
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: "지금 비밀번호가 맞지 않습니다." }, 400, noStore);
      }
      const pw = String(body.next ?? "");
      const bad = pwProblem(pw);
      if (bad) return json({ error: bad }, 400);
      rec.auth = { ...rec.auth!, pw: await hashPassword(pw), ver: rec.auth!.ver + 1, setAt: nowIso(), temp: false };
      await putJson(bucket, key, rec);
      return json({ status: "ok", ...(await issue(rec)) }, 200, noStore);
    }
    case "use": {
      if (!post) break;
      const k = s(body.k, 70);
      if (!/^(nara|apt|nuri):[A-Za-z0-9._-]{1,60}$/.test(k)) return json({ error: "잘못된 공고" }, 400);
      const u = await usageOf(bucket, rec);
      const suspended = rec.status === "suspended";
      let fresh = false;
      let ok = u.used.some((e) => e.k === k);
      // 관리자 계정은 한도 없이 열고 사용 건수를 남기지 않는다
      if (!ok && !suspended && u.admin) ok = true;
      if (!ok && !suspended && (u.quota === null || u.used.length < u.quota)) {
        u.used.push({ k, t: Date.now(), title: s(body.title, 120) || undefined });
        await putJson(bucket, u.key, { used: u.used });
        ok = fresh = true;
      }
      const { key: _k, ...usage } = u;
      void _k;
      return json({ ok, fresh, ...usage, ...(suspended ? { suspended: true } : {}) }, 200, noStore);
    }
    case "withdraw": {
      if (!post) break;
      if (!(await checkPassword(String(body.password ?? ""), rec.auth!.pw))) {
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: "비밀번호가 맞지 않습니다." }, 400, noStore);
      }
      const reason = s(body.reason, 300);
      const billing = await readJson<BillingLike>(bucket, `billing/${bizno}.json`);
      const last = passLastDay(billing);
      if (body.mode === "scheduled") {
        if (!last) return json({ error: "남은 이용권이 없어 예약할 수 없습니다. 바로 탈퇴를 골라 주세요." }, 400, noStore);
        const w: WithdrawInfo = { mode: "scheduled", on: last, requestedAt: nowIso(), ...(reason ? { reason } : {}) };
        const next: Rec = { ...rec, withdraw: w };
        await putJson(bucket, key, next);
        await putJson(bucket, `withdraw/pending/${bizno}.json`, { bizno, on: last });
        return json({ status: "scheduled", member: publicMember(next) }, 200, noStore);
      }
      if (body.mode !== "now") return json({ error: "탈퇴 방식을 골라 주세요." }, 400);
      const prev = rec.withdraw as WithdrawInfo | undefined;
      await finishWithdraw(bucket, rec, "now", reason || prev?.reason, prev?.requestedAt);
      return json({ status: "withdrawn" }, 200, noStore);
    }
    case "withdraw-cancel": {
      if (!post) break;
      const next = await cancelWithdraw(bucket, rec);
      return json({ status: "ok", member: publicMember(next) }, 200, noStore);
    }
    case "mybox": {
      const mk = `mybox/${bizno}.json`;
      if (!post) return json((await readJson(bucket, mk)) ?? { items: [], at: 0 }, 200, noStore);
      const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
      const clean = items.map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return { no: s(o.no, 40), id: s(o.id, 50), title: s(o.title, 300), agency: s(o.agency, 100), closeAt: s(o.closeAt, 40), openAt: s(o.openAt, 40) || undefined, label: s(o.label, 30) || undefined, memo: s(o.memo, 1000) || undefined, addedAt: s(o.addedAt, 40) };
      }).filter((x) => x.no && x.id);
      const out = { items: clean, at: Date.now() };
      await putJson(bucket, mk, out);
      return json({ status: "ok", at: out.at }, 200, noStore);
    }
  }
  return json({ error: "지원하지 않는 요청입니다." }, 400);
}

/** 관리자 화면 회원 목록용: 지금 요금제·적용 한도와 이번 기간 사용 건수 (무료 체험은 누적 건수) */
export async function memberLimit(bucket: AdminBucket, rec: Rec, billing: Record<string, unknown> | null, cfg: { pricing: { liteQuota: number; standardQuota: number }; trialLimit: number }, trialUsed: number): Promise<LimitInfo & { used: number }> {
  const lim = limitOf(billing as Parameters<typeof limitOf>[0], cfg.pricing, cfg.trialLimit, rec.limit);
  if (lim.tier === "trial" || !lim.period) return { ...lim, used: trialUsed };
  const u = await readJson<{ used?: UseEntry[] }>(bucket, `usage/${String(rec.bizno)}/${lim.period.from}.json`);
  return { ...lim, used: u?.used?.length ?? 0 };
}
