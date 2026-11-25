/**
 * 관리자 화면(/admin) API. 모든 요청은 ?admin=동작 이고, 로그인(login)만 빼고 Authorization: Bearer 토큰이 있어야 한다.
 *
 * - POST login                : 아이디·비밀번호 → 12시간 서명 토큰
 * - GET  members              : 가입자 전부 + 무료 체험 사용 공고 + 결제 요약 + 마지막 조회 시각
 * - POST member&bizno=        : 가입 정보 고치기 (회사명·담당자·연락처·이메일·업종·지역·규모·키워드·메일 수신·상태·메모)
 * - POST member-delete&bizno= : 탈퇴 처리 (가입 정보·결제 기록 삭제, 무료 체험 사용 기록은 남긴다)
 * - POST trial-reset&bizno=   : 무료 체험 사용 기록 초기화
 * - POST member-limit&bizno=  : 회원별 개별 이용 한도 { quota: 숫자 | null(무제한), memo } 또는 { reset: true } (요금제 기본 한도로)
 * - POST usage-reset&bizno=   : 유료 이용권 이번 기간 공고 예측 사용 기록 초기화
 * - POST password-temp&bizno= : 임시 비밀번호 발급 (회원 로그인, account.ts). 화면에 한 번만 보여 주고 저장하지 않는다
 * - GET  billing&bizno=       : 결제 기록 / POST billing&bizno= : 결제 기록 저장 (결제 대행사 연동 전이라 손으로 적는다)
 * - GET  hits&days=&kinds=    : 날짜별 집계 (요청·API·페이지 조회 등, metrics.ts)
 * - GET  logs[&errors=1]      : 최근 요청 기록
 * - GET  audit                : 관리자 로그인·변경 기록
 * - GET  apiusage&days=        : 공공데이터포털 호출(중계 서버 + 빌드·수집), Anthropic 호출·토큰 (ops.ts)
 * - GET  storage[&fresh=1]     : R2 저장 용량
 * - GET  actions               : GitHub Actions 최근 실행
 * - GET  opsconfig / POST opsconfig : API 일일 한도·환율 (관리자만 보는 값, R2 config/admin.json)
 * - GET  settings / POST settings : 사이트 설정 (공지 띠·요금·무료 체험 건수·기능). 사이트는 공개 주소 ?config=1 로 읽는다
 *
 * R2 저장 위치: members/{사업자번호}.json, trial/{사업자번호}.json, billing/{사업자번호}.json
 */
import { metricsStub, truncIp, type AuditRow, type MetricsNs } from "./metrics";
import { actions, apiUsage, storage } from "./ops";
import { adminMember, deleteAccountData, issueTempPassword, moveEmail, normEmail, memberLimit, type MemberAuth } from "./account";
import { limitOf, MAX_QUOTA } from "../../src/lib/usagePeriod";
import { DEFAULT_CONFIG, normalizeConfig, type SiteConfig } from "../../src/lib/siteConfigCore";

/** 사이트 설정 (R2 config/site.json). 한 인스턴스 안에서 1분 동안 다시 읽지 않는다 */
let cfgCache: { at: number; v: SiteConfig } | null = null;
export async function readSiteConfig(bucket: AdminBucket | undefined): Promise<SiteConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.v;
  let v = DEFAULT_CONFIG;
  if (bucket) {
    const o = await bucket.get("config/site.json");
    if (o) { try { v = normalizeConfig(JSON.parse(new TextDecoder().decode(await o.arrayBuffer()))); } catch { /* 기본값 */ } }
  }
  cfgCache = { at: Date.now(), v };
  return v;
}

export interface AdminBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size?: number }[]; truncated: boolean; cursor?: string }>;
}

export interface AdminEnv {
  AWARDS?: AdminBucket;
  ADMIN_ID?: string;
  ADMIN_PASSWORD?: string;
  METRICS?: MetricsNs;
  /** GitHub Actions 상태 조회용 (선택, 읽기 전용 토큰). 없으면 공개 API */
  GITHUB_TOKEN?: string;
  /** 기본 nparkup/vidding */
  GITHUB_REPO?: string;
}

/** 관리자 로그인 유지 시간 */
const ADMIN_SESSION_MS = 12 * 3600_000;

type Json = (body: unknown, status?: number, extra?: Record<string, string>) => Response;

const readJson = async (bucket: AdminBucket, key: string) => {
  const o = await bucket.get(key);
  if (!o) return null;
  try { return JSON.parse(new TextDecoder().decode(await o.arrayBuffer())) as Record<string, unknown>; } catch { return null; }
};
const putJson = (bucket: AdminBucket, key: string, v: unknown) => bucket.put(key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });

export async function handleAdmin(req: Request, env: AdminEnv, json: Json, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  // 예전 화면 주소(?adminlogin, ?members)도 받는다
  const action = sp.get("admin") ?? (sp.has("adminlogin") ? "login" : sp.has("delete") ? "member-delete" : "members");
  const noStore = { "Cache-Control": "no-store" };
  const ip = truncIp(req.headers.get("CF-Connecting-IP") ?? "");
  const audit = (action2: string, detail: string) => {
    if (!env.METRICS) return;
    const row: AuditRow = { ts: Date.now(), action: action2, detail, ip };
    ctx.waitUntil(metricsStub(env.METRICS).fetch("https://metrics/rec", { method: "POST", body: JSON.stringify({ audit: [row] }) }).catch(() => undefined));
  };
  if (!env.AWARDS) return json({ error: "off" }, 503);
  if (!env.ADMIN_ID || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10) return json({ error: "관리자 계정이 아직 설정되지 않았습니다." }, 503);
  const bucket = env.AWARDS;

  if (action === "login") {
    if (req.method !== "POST") return json({ error: "POST만 지원합니다." }, 405);
    let b: { id?: unknown; password?: unknown } = {};
    try { b = (await req.json()) as typeof b; } catch { /* 빈 입력 */ }
    const idOk = await sameSecret(String(b.id ?? ""), env.ADMIN_ID);
    const pwOk = await sameSecret(String(b.password ?? ""), env.ADMIN_PASSWORD);
    if (!idOk || !pwOk) {
      audit("login-fail", idOk ? "비밀번호 틀림" : "아이디 틀림");
      await new Promise((r) => setTimeout(r, 1000)); // 비밀번호 대입을 느리게
      return json({ error: "아이디 또는 비밀번호가 맞지 않습니다." }, 401, noStore);
    }
    audit("login", "로그인");
    const exp = Date.now() + ADMIN_SESSION_MS;
    return json({ token: await signAdmin(exp, env), exp }, 200, noStore);
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await checkAdmin(token, env))) return json({ error: "로그인이 필요합니다." }, 401, noStore);

  const bizno = sp.get("bizno") ?? sp.get("delete") ?? "";
  const needBizno = () => /^\d{10}$/.test(bizno);
  const post = req.method === "POST";

  switch (action) {
    case "members": {
      if (post) break;
      return json(await listMembers(bucket, env, await readSiteConfig(bucket)), 200, noStore);
    }
    case "member": {
      if (!post || !needBizno()) break;
      const cur = await readJson(bucket, `members/${bizno}.json`);
      if (!cur) return json({ error: "가입 정보가 없습니다." }, 404);
      let b: Record<string, unknown> = {};
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "잘못된 요청" }, 400); }
      const next: Record<string, unknown> = { ...cur, ...cleanMember(b), bizno, updatedAt: new Date().toISOString() };
      if (!next.company || !next.name) return json({ error: "회사명과 담당자 이름은 비울 수 없습니다." }, 400);
      if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(next.email))) return json({ error: "이메일 주소를 확인해 주세요." }, 400);
      // 로그인하는 회원이면 이메일을 바꿀 때 로그인 이메일도 같이 바꾼다
      const auth = cur.auth as MemberAuth | undefined;
      if (auth && next.email && normEmail(String(next.email)) !== auth.email) {
        if (!(await moveEmail(bucket, bizno, auth.email, String(next.email)))) return json({ error: "이 이메일은 다른 회원이 로그인에 쓰고 있습니다." }, 409);
        next.auth = { ...auth, email: normEmail(String(next.email)) };
      }
      await putJson(bucket, `members/${bizno}.json`, next);
      audit("member-edit", `${bizno}${cur.status !== next.status ? ` 상태 ${next.status === "suspended" ? "이용 정지" : "정상"}` : ""}`);
      return json({ status: "ok", member: adminMember(next) }, 200, noStore);
    }
    case "password-temp": {
      if (!post || !needBizno()) break;
      const r = await issueTempPassword(bucket, bizno);
      if ("error" in r) return json(r, 400, noStore);
      audit("password-temp", bizno);
      return json({ status: "ok", ...r }, 200, noStore);
    }
    case "member-delete": {
      if (!post || !needBizno()) break;
      await deleteAccountData(bucket, await readJson(bucket, `members/${bizno}.json`), bizno);
      await bucket.delete(`members/${bizno}.json`);
      await bucket.delete(`billing/${bizno}.json`);
      audit("member-delete", bizno);
      return json({ status: "deleted" }, 200, noStore);
    }
    case "trial-reset": {
      if (!post || !needBizno()) break;
      await bucket.delete(`trial/${bizno}.json`);
      audit("trial-reset", bizno);
      return json({ status: "ok" }, 200, noStore);
    }
    case "member-limit": {
      // 회원별 개별 이용 한도. { quota: 숫자 | null(무제한) , memo } 저장, { reset: true } 면 요금제 기본 한도로 되돌린다
      if (!post || !needBizno()) break;
      const cur = await readJson(bucket, `members/${bizno}.json`);
      if (!cur) return json({ error: "가입 정보가 없습니다." }, 404);
      let b: Record<string, unknown> = {};
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "잘못된 요청" }, 400); }
      const next: Record<string, unknown> = { ...cur };
      if (b.reset === true) delete next.limit;
      else {
        const q = b.quota === null ? null : Math.round(Number(b.quota));
        if (q !== null && !(Number.isFinite(q) && q >= 0 && q <= MAX_QUOTA)) return json({ error: `한도는 0 ~ ${MAX_QUOTA.toLocaleString()}건 사이로 정해 주세요.` }, 400);
        next.limit = { quota: q, memo: s(b.memo, 200) || undefined, at: new Date().toISOString() };
      }
      await putJson(bucket, `members/${bizno}.json`, next);
      const cfg = await readSiteConfig(bucket);
      const bill = await readJson(bucket, `billing/${bizno}.json`);
      const t = await readJson(bucket, `trial/${bizno}.json`);
      const quota = await memberLimit(bucket, next, bill, cfg, ((t?.used as unknown[]) ?? []).length);
      audit("member-limit", `${bizno} ${b.reset === true ? "기본 한도" : next.limit && (next.limit as { quota: number | null }).quota === null ? "무제한" : `${(next.limit as { quota: number }).quota}건`}`);
      return json({ status: "ok", member: adminMember(next), quota }, 200, noStore);
    }
    case "usage-reset": {
      // 유료 이용권 이번 기간 공고 예측 사용 기록을 지운다 (무료 체험은 trial-reset)
      if (!post || !needBizno()) break;
      const cfg = await readSiteConfig(bucket);
      const bill = await readJson(bucket, `billing/${bizno}.json`);
      const lim = limitOf(bill as Parameters<typeof limitOf>[0], cfg.pricing, cfg.trialLimit, null);
      if (lim.tier === "trial" || !lim.period) return json({ error: "이용 중인 이용권이 없습니다." }, 400);
      await bucket.delete(`usage/${bizno}/${lim.period.from}.json`);
      audit("usage-reset", `${bizno} ${lim.period.from}`);
      return json({ status: "ok" }, 200, noStore);
    }
    case "billing": {
      if (!needBizno()) break;
      if (!post) return json({ billing: (await readJson(bucket, `billing/${bizno}.json`)) ?? null }, 200, noStore);
      let b: Record<string, unknown> = {};
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "잘못된 요청" }, 400); }
      const rec = cleanBilling(b);
      if ("error" in rec) return json(rec, 400);
      await putJson(bucket, `billing/${bizno}.json`, { ...rec, updatedAt: new Date().toISOString() });
      audit("billing", `${bizno} ${rec.plan || "-"} ${rec.status}`);
      return json({ status: "ok", billing: rec }, 200, noStore);
    }
    case "settings": {
      if (!post) return json({ config: await readSiteConfig(bucket), defaults: DEFAULT_CONFIG }, 200, noStore);
      let b: unknown;
      try { b = await req.json(); } catch { return json({ error: "잘못된 요청" }, 400); }
      const prev = await readSiteConfig(bucket);
      const next = { ...normalizeConfig(b), updatedAt: new Date().toISOString() };
      await putJson(bucket, "config/site.json", next);
      cfgCache = { at: Date.now(), v: next };
      const changed = (["banner", "pricing", "trialLimit", "features"] as const).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
      audit("settings", changed.length ? `바뀐 항목: ${changed.join(", ")}` : "변경 없음");
      return json({ status: "ok", config: next }, 200, noStore);
    }
    case "apiusage": {
      if (post) break;
      const days = Math.min(60, Math.max(1, Number(sp.get("days") || 30)));
      return json(await apiUsage(bucket, env.METRICS, days), 200, noStore);
    }
    case "storage": {
      if (post) break;
      return json(await storage(bucket, sp.get("fresh") === "1"), 200, noStore);
    }
    case "actions": {
      if (post) break;
      try { return json(await actions(env.GITHUB_REPO || "nparkup/vidding", env.GITHUB_TOKEN), 200, noStore); } catch (e) { return json({ error: (e as Error).message }, 502); }
    }
    case "opsconfig": {
      if (!post) return json({ ops: (await readJson(bucket, "config/admin.json")) ?? {} }, 200, noStore);
      let b: Record<string, unknown> = {};
      try { b = (await req.json()) as Record<string, unknown>; } catch { return json({ error: "잘못된 요청" }, 400); }
      const quotas: Record<string, number> = {};
      for (const [k, v] of Object.entries((b.quotas ?? {}) as Record<string, unknown>).slice(0, 100)) {
        const n = Math.round(Number(v));
        if (/^[\w.-]{1,80}$/.test(k) && n > 0 && n < 1e9) quotas[k] = n;
      }
      const rate = Math.round(Number(b.krwPerUsd));
      const ops = { quotas, krwPerUsd: rate > 100 && rate < 10000 ? rate : 1400, updatedAt: new Date().toISOString() };
      await putJson(bucket, "config/admin.json", ops);
      audit("opsconfig", `API 한도 ${Object.keys(quotas).length}개, 환율 ${ops.krwPerUsd}`);
      return json({ status: "ok", ops }, 200, noStore);
    }
    case "hits":
    case "logs":
    case "audit": {
      if (post) break;
      if (!env.METRICS) return json({ error: "지표 저장소가 아직 없습니다." }, 503);
      const q = new URLSearchParams();
      for (const k of ["days", "kinds", "limit", "errors"]) { const v = sp.get(k); if (v) q.set(k, v); }
      const r = await metricsStub(env.METRICS).fetch(`https://metrics/${action}?${q}`);
      return json(await r.json(), r.status, noStore);
    }
  }
  return json({ error: "지원하지 않는 요청입니다." }, 400);
}

const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map((x) => s(x, 60)).filter(Boolean).slice(0, max) : undefined);

/** 관리자가 고칠 수 있는 가입 정보만 골라 다듬는다 (사업자번호·가입일은 못 바꾼다) */
function cleanMember(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const str: [string, number][] = [["company", 100], ["name", 40], ["email", 120], ["phone", 30], ["size", 40], ["keywords", 200], ["plan", 20], ["memo", 1000]];
  for (const [k, max] of str) if (k in b) out[k] = s(b[k], max);
  for (const [k, max] of [["licenses", 40], ["regions", 20]] as [string, number][]) { const l = list(b[k], max); if (l) out[k] = l; }
  if ("agreeMail" in b) out.agreeMail = b.agreeMail === true;
  if ("status" in b) out.status = b.status === "suspended" ? "suspended" : "active";
  return out;
}

export interface Payment { id: string; date: string; kind: "pay" | "refund"; amount: number; method: string; memo: string }
export interface Billing {
  /** 이용권 (lite·standard). unlimited·monthly·annual은 예전 요금제로 남은 기록 */
  plan: "" | "lite" | "standard" | "unlimited" | "monthly" | "annual";
  status: "none" | "active" | "cancelled" | "expired" | "refunded";
  start: string;
  end: string;
  memo: string;
  payments: Payment[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function cleanBilling(b: Record<string, unknown>): Billing | { error: string } {
  const plan = (["lite", "standard", "unlimited", "monthly", "annual"] as const).find((x) => x === b.plan) ?? "";
  const status = (["none", "active", "cancelled", "expired", "refunded"] as const).find((x) => x === b.status) ?? "none";
  const start = s(b.start, 10);
  const end = s(b.end, 10);
  if ((start && !DATE.test(start)) || (end && !DATE.test(end))) return { error: "날짜는 YYYY-MM-DD 로 적어 주세요." };
  if (start && end && end < start) return { error: "종료일이 시작일보다 빠릅니다." };
  const raw = Array.isArray(b.payments) ? b.payments.slice(0, 200) : [];
  const payments: Payment[] = [];
  for (const p of raw as Record<string, unknown>[]) {
    const date = s(p?.date, 10);
    const amount = Math.round(Number(p?.amount));
    if (!DATE.test(date) || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000) return { error: "결제 내역의 날짜·금액을 확인해 주세요." };
    payments.push({ id: s(p.id, 40) || crypto.randomUUID(), date, kind: p.kind === "refund" ? "refund" : "pay", amount, method: s(p.method, 30), memo: s(p.memo, 200) });
  }
  payments.sort((a, z) => a.date.localeCompare(z.date));
  return { plan, status, start, end, memo: s(b.memo, 1000), payments };
}

/** 가입자 목록: members/ 전부와 사업자번호별 무료 체험 사용 공고(trial/), 결제 기록(billing/), 마지막 조회(Metrics seen) */
async function listMembers(bucket: AdminBucket, env: AdminEnv, cfg: SiteConfig) {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await bucket.list({ prefix: "members/", cursor, limit: 1000 });
    keys.push(...r.objects.map((o) => o.key));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor && keys.length < 5000);
  // 결제 기록이 있는 번호만 읽는다
  const billed = new Set<string>();
  cursor = undefined;
  do {
    const r = await bucket.list({ prefix: "billing/", cursor, limit: 1000 });
    for (const o of r.objects) billed.add(o.key.slice(8, 18));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor && billed.size < 5000);
  let seen: Record<string, { last: number; n: number }> = {};
  if (env.METRICS) {
    try {
      const r = (await (await metricsStub(env.METRICS).fetch("https://metrics/seen")).json()) as { rows: { bizno: string; last: number; n: number }[] };
      seen = Object.fromEntries(r.rows.map((x) => [x.bizno, { last: x.last, n: x.n }]));
    } catch { /* 지표가 없으면 비워 둔다 */ }
  }
  const out: unknown[] = [];
  for (let i = 0; i < keys.length; i += 20) {
    const part = await Promise.all(keys.slice(i, i + 20).map(async (k) => {
      const m = await readJson(bucket, k);
      if (!m) return null;
      const no = String(m.bizno);
      const [t, bill] = await Promise.all([readJson(bucket, `trial/${no}.json`), billed.has(no) ? readJson(bucket, `billing/${no}.json`) : null]);
      const trial = (t?.used as unknown[]) ?? [];
      const quota = await memberLimit(bucket, m, bill, cfg, trial.length);
      return { ...adminMember(m), trial, billing: bill, quota, seen: seen[no] ?? null };
    }));
    out.push(...part.filter(Boolean));
  }
  return { members: out, limit: cfg.trialLimit, pricing: cfg.pricing, at: new Date().toISOString() };
}

/** 관리자 비밀번호 비교: 해시끼리 끝까지 비교해 응답 시간으로 맞힌 글자 수를 알 수 없게 한다 */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const h = async (x: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = a.length ? 0 : 1;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/** 관리자 토큰 서명 키: 아이디·비밀번호에서 만든다. 비밀번호를 바꾸면 이전 토큰은 모두 무효가 된다 */
async function adminKey(env: AdminEnv) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bidmate-admin:${env.ADMIN_ID}:${env.ADMIN_PASSWORD}`));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function signAdmin(exp: number, env: AdminEnv): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await adminKey(env), new TextEncoder().encode(`admin.${exp}`));
  return `${exp}.${hex(sig)}`;
}
export async function checkAdmin(token: string, env: AdminEnv): Promise<boolean> {
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(token);
  if (!m || Number(m[1]) < Date.now()) return false;
  return sameSecret(token, await signAdmin(Number(m[1]), env));
}
