/**
 * 운영 지표 (관리자 화면 시스템 정보·API 사용량·회원 사용량).
 *
 * Durable Object(Metrics) 하나가 SQLite에 날짜별 집계만 둔다. 무료 요금제에서도 되는 SQLite 기반이다.
 * - hits(day, kind, key, n): 한국 날짜별 횟수·합계. kind 예: req(경로별 요청), status(경로:상태), ms(경로별 처리 시간 합),
 *   api(공공데이터포털 서비스/오퍼레이션 호출), apierr, ai(모델 호출), ai_in·ai_out(토큰), pv(페이지 조회), ref(유입 사이트), country, device, uv(순 방문 브라우저)
 * - uv(day, h): 그날 처음 본 브라우저인지 가리는 값. IP·브라우저 정보를 그날만 쓰는 무작위 값과 섞은 해시 앞 16자라 다른 날과 이어지지 않고, 이틀 뒤 지운다
 * - seen(bizno, last, n): 사업자번호를 넣은 조회(기업 정보·유사 실적·낙찰·무료 체험)가 마지막으로 온 때와 횟수. 회원 사용량에 쓴다
 * - log: 최근 요청 3,000건(경로·상태·처리 시간·나라·IP 앞자리). 30일 지나면 지운다
 * - audit: 관리자 로그인·변경 기록 (IP 앞자리만)
 *
 * IP는 앞 세 자리(IPv4 a.b.c.*, IPv6 앞 세 묶음)만 남긴다. 이름·연락처 같은 개인 정보는 여기에 쓰지 않는다.
 */

export interface Hit { kind: string; key: string; n?: number }
export interface LogRow { ts: number; route: string; status: number; ms: number; ip: string; country: string; msg?: string }
export interface AuditRow { ts: number; action: string; detail: string; ip: string }
export interface RecBody {
  hits?: Hit[];
  uv?: string;
  seen?: string[];
  logs?: LogRow[];
  audit?: AuditRow[];
}

/** 한국 날짜 YYYY-MM-DD */
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

/** IP 앞자리만 남긴다 */
export function truncIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(".")) return ip.split(".").slice(0, 3).join(".") + ".*";
  return ip.split(":").slice(0, 3).join(":") + ":*";
}

interface SqlCursor { toArray(): Record<string, unknown>[]; one(): Record<string, unknown> }
interface Sql { exec(q: string, ...args: unknown[]): SqlCursor }
interface DoState { storage: { sql: Sql } }

export class Metrics {
  private sql: Sql;
  constructor(state: DoState) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (day TEXT, kind TEXT, key TEXT, n INTEGER, PRIMARY KEY (day, kind, key))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS uv (day TEXT, h TEXT, PRIMARY KEY (day, h))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seen (bizno TEXT PRIMARY KEY, last INTEGER, n INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS log (ts INTEGER, route TEXT, status INTEGER, ms INTEGER, ip TEXT, country TEXT, msg TEXT)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS log_ts ON log (ts)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS audit (ts INTEGER, action TEXT, detail TEXT, ip TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS salt (day TEXT PRIMARY KEY, v TEXT)`);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const out = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
    if (req.method === "POST" && url.pathname === "/rec") {
      this.rec((await req.json()) as RecBody);
      return out({ ok: true });
    }
    if (url.pathname === "/salt") return out({ salt: this.salt(kstDay()) });
    if (url.pathname === "/hits") {
      const days = Math.min(400, Math.max(1, Number(url.searchParams.get("days") || 30)));
      const from = kstDay(Date.now() - (days - 1) * 86400_000);
      const kinds = (url.searchParams.get("kinds") ?? "").split(",").filter((k) => /^[a-z_]{1,20}$/.test(k));
      const rows = kinds.length
        ? this.sql.exec(`SELECT day, kind, key, n FROM hits WHERE day >= ? AND kind IN (${kinds.map(() => "?").join(",")}) ORDER BY day`, from, ...kinds).toArray()
        : this.sql.exec(`SELECT day, kind, key, n FROM hits WHERE day >= ? ORDER BY day`, from).toArray();
      return out({ from, rows });
    }
    if (url.pathname === "/logs") {
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 300)));
      const errors = url.searchParams.get("errors") === "1";
      const rows = this.sql.exec(`SELECT ts, route, status, ms, ip, country, msg FROM log ${errors ? "WHERE status >= 500 OR msg != ''" : ""} ORDER BY ts DESC LIMIT ?`, limit).toArray();
      return out({ rows });
    }
    if (url.pathname === "/audit") {
      const rows = this.sql.exec(`SELECT ts, action, detail, ip FROM audit ORDER BY ts DESC LIMIT 300`).toArray();
      return out({ rows });
    }
    if (url.pathname === "/seen") {
      return out({ rows: this.sql.exec(`SELECT bizno, last, n FROM seen`).toArray() });
    }
    return new Response("not found", { status: 404 });
  }

  /** 그날만 쓰는 무작위 값 (순 방문 브라우저 해시용) */
  private salt(day: string): string {
    const r = this.sql.exec(`SELECT v FROM salt WHERE day = ?`, day).toArray()[0];
    if (r) return String(r.v);
    const v = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((x) => x.toString(16).padStart(2, "0")).join("");
    this.sql.exec(`INSERT OR IGNORE INTO salt (day, v) VALUES (?, ?)`, day, v);
    this.sql.exec(`DELETE FROM salt WHERE day < ?`, kstDay(Date.now() - 2 * 86400_000));
    return v;
  }

  private rec(b: RecBody) {
    const day = kstDay();
    const add = (kind: string, key: string, n = 1) =>
      this.sql.exec(`INSERT INTO hits (day, kind, key, n) VALUES (?, ?, ?, ?) ON CONFLICT (day, kind, key) DO UPDATE SET n = n + excluded.n`, day, kind, key.slice(0, 120), n);
    for (const h of b.hits ?? []) if (h.kind && h.key) add(h.kind, h.key, Math.round(h.n ?? 1));
    if (b.uv) {
      const before = this.sql.exec(`SELECT COUNT(*) AS c FROM uv WHERE day = ? AND h = ?`, day, b.uv).one().c as number;
      if (!before) {
        this.sql.exec(`INSERT OR IGNORE INTO uv (day, h) VALUES (?, ?)`, day, b.uv);
        add("uv", "all");
      }
    }
    const now = Date.now();
    for (const s of b.seen ?? []) {
      if (/^\d{10}$/.test(s)) this.sql.exec(`INSERT INTO seen (bizno, last, n) VALUES (?, ?, 1) ON CONFLICT (bizno) DO UPDATE SET last = excluded.last, n = n + 1`, s, now);
    }
    for (const l of b.logs ?? []) {
      this.sql.exec(`INSERT INTO log (ts, route, status, ms, ip, country, msg) VALUES (?, ?, ?, ?, ?, ?, ?)`, l.ts, l.route.slice(0, 40), l.status, Math.round(l.ms), l.ip.slice(0, 50), (l.country ?? "").slice(0, 4), (l.msg ?? "").slice(0, 300));
    }
    for (const a of b.audit ?? []) {
      this.sql.exec(`INSERT INTO audit (ts, action, detail, ip) VALUES (?, ?, ?, ?)`, a.ts, a.action.slice(0, 40), a.detail.slice(0, 300), a.ip.slice(0, 50));
    }
    // 가끔 오래된 기록을 지운다
    if (Math.random() < 0.02) {
      this.sql.exec(`DELETE FROM uv WHERE day < ?`, kstDay(now - 2 * 86400_000));
      this.sql.exec(`DELETE FROM log WHERE ts < ?`, now - 30 * 86400_000);
      this.sql.exec(`DELETE FROM log WHERE ts < (SELECT ts FROM log ORDER BY ts DESC LIMIT 1 OFFSET 3000)`);
      this.sql.exec(`DELETE FROM audit WHERE ts < ?`, now - 400 * 86400_000);
      this.sql.exec(`DELETE FROM hits WHERE day < ?`, kstDay(now - 400 * 86400_000));
    }
  }
}

/* ---------- Worker 쪽: 요청 하나에서 모은 것을 Metrics에 보낸다 ---------- */

export interface MetricsNs { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request | string, init?: RequestInit): Promise<Response> } }

export const metricsStub = (ns: MetricsNs) => ns.get(ns.idFromName("site"));

/** 바깥 호출(공공데이터포털·Anthropic)은 전역 fetch를 감싸 센다. 동시에 처리 중인 요청끼리 섞여도 합계는 맞다 */
const pending: Hit[] = [];
/** 아직 다 읽지 않은 Anthropic 응답 (보내기 전에 기다린다) */
const inflight = new Set<Promise<unknown>>();
let patched = false;

/** 공공데이터포털 주소에서 서비스/오퍼레이션 이름 */
export function dataGoKrKey(u: URL): string {
  const parts = u.pathname.split("/").filter(Boolean);
  // 예: /1230000/ad/BidPublicInfoService02/getBidPblancListInfoServcPPSSrch02 → BidPublicInfoService02/getBid…
  const op = parts[parts.length - 1] ?? "";
  const svc = parts[parts.length - 2] ?? "";
  return `${svc}/${op}`.slice(0, 100);
}

export function patchFetch() {
  if (patched) return;
  patched = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let u: URL | null = null;
    try { u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url); } catch { u = null; }
    const host = u?.hostname ?? "";
    try {
      const res = await orig(input as RequestInfo, init);
      if (u && (host === "apis.data.go.kr" || host.endsWith(".data.go.kr") || host === "plus.kipris.or.kr")) {
        const key = dataGoKrKey(u);
        pending.push({ kind: "api", key });
        if (!res.ok) pending.push({ kind: "apierr", key: `${key}:${res.status}` });
      } else if (host === "api.anthropic.com" && u?.pathname.includes("/messages")) {
        countAnthropic(res);
      }
      return res;
    } catch (e) {
      if (u && host.endsWith("data.go.kr")) pending.push({ kind: "api", key: dataGoKrKey(u) }, { kind: "apierr", key: `${dataGoKrKey(u)}:network` });
      if (host === "api.anthropic.com") pending.push({ kind: "aierr", key: "network" });
      throw e;
    }
  }) as typeof fetch;
}

/** Anthropic 응답(스트리밍 또는 JSON)에서 모델·토큰 수를 읽는다. 본문을 복제해 따로 읽어 화면 응답을 늦추지 않는다 */
function countAnthropic(res: Response) {
  if (!res.ok) { pending.push({ kind: "aierr", key: String(res.status) }); return; }
  const c = res.clone();
  const p: Promise<unknown> = c.text().then((t) => {
    const model = /"model"\s*:\s*"([^"]+)"/.exec(t)?.[1] ?? "unknown";
    const num = (name: string) => { let s = 0; for (const m of t.matchAll(new RegExp(`"${name}"\\s*:\\s*(\\d+)`, "g"))) s = Math.max(s, Number(m[1])); return s; };
    // 스트리밍은 message_start 에 입력 토큰, 마지막 message_delta 에 누적 출력 토큰이 온다 (가장 큰 값을 쓴다)
    pending.push(
      { kind: "ai", key: model },
      { kind: "ai_in", key: model, n: num("input_tokens") },
      { kind: "ai_cache_w", key: model, n: num("cache_creation_input_tokens") },
      { kind: "ai_cache_r", key: model, n: num("cache_read_input_tokens") },
      { kind: "ai_out", key: model, n: num("output_tokens") },
    );
  }).catch(() => pending.push({ kind: "aierr", key: "read" })).finally(() => inflight.delete(p));
  inflight.add(p);
}

/** 지금까지 모인 바깥 호출 기록을 꺼낸다 */
export async function takePending(): Promise<Hit[]> {
  if (inflight.size) await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, 20_000))]);
  return pending.splice(0, pending.length);
}
