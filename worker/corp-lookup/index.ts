/**
 * 정적 사이트(GitHub Pages)용 기업 정보 중계 서버 (Cloudflare Worker).
 * 서비스키는 Worker 비밀값 DATA_GO_KR_SERVICE_KEY 에만 두고, 브라우저는 GET /?bizno=0000000000 만 부른다.
 * 허용한 사이트 주소(ALLOWED_ORIGINS)에서 온 요청에만 CORS를 열고, 같은 번호는 12시간 동안 캐시해 호출 한도를 아낀다.
 *
 * 유사 실적 조회 (src/lib/perfLookup.ts):
 * - GET /?perf=용역&bizno=..&from=YYYYMMDD&to=YYYYMMDD : 그 기간(최대 15주)의 낙찰 건. 지난 기간은 바뀌지 않아 30일 캐시한다
 * - GET /?ntce=공고번호,공고번호&biz=용역 : 공고번호별 세부품명·중분류 (30일 캐시)
 *
 * 낙찰 저장소 (R2 버킷 bidmate-awards, scripts/awards/collect.ts 가 매일 채운다):
 * - GET /?corps=기업명 : 기업명 앞부분(법인 형태 글자 빼고)으로 낙찰·개찰 상위 업체 후보를 찾는다 (src/lib/awards/corps.ts, 1시간 캐시)
 * - GET /?awards=사업자번호&biz=용역 : 그 업체의 최근 3년 낙찰을 공고 분류와 함께. 조달청 API를 부르지 않는다 (6시간 캐시)
 * - GET /?awardmeta=1 : 저장소 수집 범위·완료 여부
 *
 * 회원 로그인 (account.ts): ?account=동작. 가입·로그인·내 정보·이용권 공고 예측 건수 차감·내 서류함.
 * 관리자 화면 (admin.ts): ?admin=동작. 로그인 뒤 서명 토큰으로 회원·결제·사용량·지표를 읽고 쓴다.
 * 운영 지표 (metrics.ts): 요청마다 경로·상태·처리 시간과 바깥 API 호출 수를 Durable Object Metrics에 날짜별로 더한다. ?pv= 는 페이지 조회.
 *
 * 실시간 이용자 수 (src/lib/presence.ts, 메인 상단 현황 줄):
 * - GET /?presence=브라우저ID : 사이트를 연 브라우저가 1분마다 부른다. 최근 PRESENCE_WINDOW_MS 안에 부른 브라우저 수를 돌려준다.
 *   Durable Object(Presence) 하나가 메모리에만 들고 있다 (저장소에 쓰지 않는다). ID 없이 부르면 세기만 한다.
 *
 * 공고 배점표 AI 판독 (src/lib/nara/aiSheet.ts):
 * - GET /?aisheet=공고번호-차수 : 사이트가 빌드 때 만든 /ai-input/{공고}.json 본문을 Claude로 읽어 검증한 배점표를 돌려준다.
 *   결과는 R2 ai-sheets/v{버전}/{공고}-{본문 해시}.json 에 두어 같은 공고는 한 번만 부른다. 키는 Worker 비밀값 ANTHROPIC_API_KEY.
 *   빌드가 첨부를 다 읽지 못한 공고(/attachments/{공고}.json 에 read 가 없음)는 여기서 첨부를 모두 받아 읽는다
 *   (src/lib/nara/liveSheet.ts, 같은 파일명은 하나만, 나라장터 주소만). 결과는 R2 ai-sheets/v{버전}/{공고}-live-{첨부 해시}.json
 * 기업 특허 (src/lib/patents.ts, 평가점수 예측의 특허 항목):
 * - GET /?patents=사업자번호 : 특허청 등록원부 사업자 권리목록(공공데이터포털, 서비스키 DATA_GO_KR_SERVICE_KEY)으로 지금 살아 있는 특허권.
 *   실패하고 KIPRIS_API_KEY 가 있으면 KIPRIS Plus(출원인 법인 → 등록공보)로 한 번 더 찾는다 (월 호출 수를 patents/usage-YYYYMM.json 에 세어 상한 안에서).
 *   결과는 R2 patents/v2/{사업자번호}.json 에 30일 둔다
 * - GET /?relate=공고번호-차수 : 사이트의 /award-analysis/{공고}.json 에 있는 '같은 사업인지 애매한 후보'와 '핵심어로 찾은 다른 기관 낙찰'을 Claude로 확인한다
 *   (src/lib/awards/relate.ts). 결과는 R2 ai-relate/v{버전}/{공고}-{후보 해시}.json
 */
import { lookupCompany, normalizeBizno, validBizno } from "../../src/lib/corpLookup";
import { fetchNtceClasses, fetchWins, perfBizOf } from "../../src/lib/perfLookup";
import { readAwards, type R2BucketLike } from "../../src/lib/awards/read";
import { searchCorps } from "../../src/lib/awards/corps";
import Anthropic from "@anthropic-ai/sdk";
import { RELATE_VERSION, relateAll, relateHash, type RelateResult } from "../../src/lib/awards/relate";
import type { AwardAnalysis } from "../../src/lib/awards/analysis";
import { AI_SHEET_VERSION, readAiInput, type AiInput, type AiSheetResult } from "../../src/lib/nara/aiSheet";
import { liveKey, readSheetLive, type LiveDocs } from "../../src/lib/nara/liveSheet";
import { fetchPatents, fetchPatentsRgst, type PatentLookup } from "../../src/lib/patents";
import { handleAdmin, readSiteConfig } from "./admin";
import { handleAccount } from "./account";
import { metricsStub, patchFetch, takePending, truncIp, type MetricsNs, type RecBody } from "./metrics";
export { Metrics } from "./metrics";

interface Env {
  DATA_GO_KR_SERVICE_KEY: string;
  /** 낙찰 저장소 (wrangler.toml r2_buckets). 없으면 ?awards 는 ready:false */
  AWARDS?: R2BucketLike & {
    put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
    delete(key: string): Promise<unknown>;
    list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size?: number }[]; truncated: boolean; cursor?: string }>;
  };
  /** 운영 지표 (wrangler.toml durable_objects, metrics.ts). 없으면 기록하지 않는다 */
  METRICS?: MetricsNs;
  /** 공고 배점표 AI 판독용 Anthropic API 키 (Worker 비밀값). 없으면 ?aisheet 는 503 */
  ANTHROPIC_API_KEY?: string;
  /** AI 판독 모델 (기본 claude-haiku-5-5) */
  AI_SHEET_MODEL?: string;
  /** AI 판독 입력을 읽어 올 사이트 주소, 예: https://nparkup.github.io/vidding */
  SITE_URL?: string;
  /** 그 자리에서 첨부를 받을 때 허용하는 호스트 (쉼표 구분, 기본 www.g2b.go.kr) */
  ATTACH_HOSTS?: string;
  /** 기업 특허 조회 (KIPRIS Plus Open API 인증키, ?patents=). 없으면 status off */
  KIPRIS_API_KEY?: string;
  /** 특허 조회 월 호출 상한 (기본 950, KIPRIS Plus 무료 월 1,000회 안) */
  KIPRIS_MONTHLY_LIMIT?: string;
  /** 쉼표로 구분한 허용 Origin, 예: https://nparkup.github.io,http://localhost:3000 */
  ALLOWED_ORIGINS?: string;
  /** 관리자 화면(/admin) 아이디·비밀번호 (Worker 비밀값, 저장소 Secrets ADMIN_ID·ADMIN_PASSWORD 에서). 없으면 관리자 로그인은 503 */
  ADMIN_ID?: string;
  ADMIN_PASSWORD?: string;
  /** 회원 로그인 토큰 서명 키 (선택, 16자 이상). 없으면 R2 config/auth-key.json 에 만들어 둔 무작위 키를 쓴다 */
  MEMBER_SECRET?: string;
  /** 실시간 이용자 수 (wrangler.toml durable_objects). 없으면 ?presence 는 503 */
  PRESENCE?: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request | string): Promise<Response> } };
}

/** 이 시간 안에 신호를 보낸 브라우저를 '지금 보고 있는 이용자'로 센다. 화면은 1분마다 신호를 보낸다 */
const PRESENCE_WINDOW_MS = 150_000;

/** 지금 사이트를 열어 둔 브라우저 수. 한 인스턴스가 메모리에만 들고 있다 (아무도 없으면 지워져도 0이라 상관없다) */
export class Presence {
  private seen = new Map<string, number>();
  async fetch(req: Request): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const now = Date.now();
    if (id) this.seen.set(id, now);
    for (const [k, t] of this.seen) if (now - t > PRESENCE_WINDOW_MS) this.seen.delete(k);
    return new Response(JSON.stringify({ count: this.seen.size }), { headers: { "Content-Type": "application/json" } });
  }
}

const CACHE_SECONDS = 12 * 3600;

patchFetch();

export default {
  /** 요청마다 경로·상태·처리 시간과 그 사이 바깥 호출(공공데이터포털·Anthropic)을 지표 저장소(Metrics)에 남긴다 */
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const t0 = Date.now();
    let res: Response;
    let err = "";
    try {
      res = await handle(req, env, ctx);
    } catch (e) {
      err = (e as Error).message ?? String(e);
      res = new Response(JSON.stringify({ error: "중계 서버 오류" }), { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (env.METRICS && req.method !== "OPTIONS") ctx.waitUntil(flushMetrics(req, res, Date.now() - t0, err, env.METRICS).catch(() => undefined));
    return res;
  },
};

async function handle(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGINS ?? "https://nparkup.github.io").split(",").map((s) => s.trim()).filter(Boolean);
    const cors: Record<string, string> = allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", Vary: "Origin" }
      : {};
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "86400" } });
    {
      const sp0 = new URL(req.url).searchParams;
      if (sp0.has("admin") || sp0.has("adminlogin") || sp0.has("members")) {
        if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "허용되지 않은 사이트입니다." }, 403);
        return handleAdmin(req, env, json, ctx);
      }
      if (sp0.has("account")) {
        // 회원 로그인 (account.ts)
        if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "허용되지 않은 사이트입니다." }, 403);
        return handleAccount(req, env, json);
      }
      if (sp0.has("pv")) {
        // 페이지 조회 (src/components/PageBeacon.tsx). 경로·유입 사이트만 받고, 순 방문은 그날만 쓰는 해시로 센다
        if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "허용되지 않은 사이트입니다." }, 403);
        if (env.METRICS) ctx.waitUntil(recordPageView(req, env.METRICS).catch(() => undefined));
        return new Response(null, { status: 204, headers: cors });
      }
    }
    if (req.method === "POST" && new URL(req.url).searchParams.has("signup")) {
      if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "허용되지 않은 사이트입니다." }, 403);
      if (!env.AWARDS) return json({ error: "off" }, 503);
      return json(...(await signup(req, env.AWARDS)));
    }
    if (req.method !== "GET") return json({ error: "GET만 지원합니다." }, 405);
    if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "허용되지 않은 사이트입니다." }, 403);
    const sp = new URL(req.url).searchParams;
    if (sp.has("presence")) {
      if (!env.PRESENCE) return json({ error: "off" }, 503);
      const id = sp.get("presence") ?? "";
      if (id && !/^[a-z0-9]{8,40}$/.test(id)) return json({ error: "잘못된 ID" }, 400);
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName("site"));
      const r = await stub.fetch(`https://presence/?id=${id}`);
      return json(await r.json(), 200, { "Cache-Control": "no-store" });
    }
    if (sp.has("config")) {
      // 사이트 설정 (공개 값만: 공지 띠·요금·무료 체험 건수·기능). 관리자 화면에서 바꾸면 1~2분 안에 반영된다
      const c = await readSiteConfig(env.AWARDS);
      return json(c, 200, { "Cache-Control": "public, max-age=60" });
    }
    if (sp.has("trial")) {
      // 무료 체험 사용 공고 (src/lib/trial.ts): 사업자번호마다 처음 분석한 공고 3건까지만 남긴다. 저장 값은 공고 키와 시각뿐
      const bizno = sp.get("trial") ?? "";
      const TRIAL_LIMIT = (await readSiteConfig(env.AWARDS)).trialLimit;
      const keys = (sp.get("bids") ?? "").split(",").filter((k) => /^(nara|apt):[A-Za-z0-9._-]{1,60}$/.test(k)).slice(0, 6);
      if (!/^\d{10}$/.test(bizno)) return json({ error: "잘못된 사업자번호" }, 400);
      if (!env.AWARDS) return json({ error: "off" }, 503);
      const key = `trial/${bizno}.json`;
      // 관리자가 이용 정지한 사업자번호는 새 공고를 더하지 않는다
      const mem = await env.AWARDS.get(`members/${bizno}.json`);
      let suspended = false;
      if (mem) { try { suspended = (JSON.parse(new TextDecoder().decode(await mem.arrayBuffer())) as { status?: string }).status === "suspended"; } catch { /* 무시 */ } }
      const hit = await env.AWARDS.get(key);
      let used: { k: string; t: number }[] = [];
      if (hit) {
        try { used = (JSON.parse(new TextDecoder().decode(await hit.arrayBuffer())) as { used?: typeof used }).used ?? []; } catch { used = []; }
      }
      const before = used.length;
      const now = Date.now();
      if (!suspended) for (const k of keys) if (used.length < TRIAL_LIMIT && !used.some((e) => e.k === k)) used.push({ k, t: now });
      if (used.length !== before) await env.AWARDS.put(key, JSON.stringify({ used }), { httpMetadata: { contentType: "application/json" } });
      return json({ used, limit: TRIAL_LIMIT, ...(suspended ? { suspended: true } : {}) }, 200, { "Cache-Control": "no-store" });
    }
    if (sp.has("corps")) {
      try {
        const r = await searchCorps(env.AWARDS, (sp.get("corps") ?? "").slice(0, 40));
        return json(r, r.error ? 400 : 200, { "Cache-Control": "public, max-age=3600" });
      } catch (e) {
        return json({ error: (e as Error).message, ready: false, hits: [] }, 400);
      }
    }
    if (sp.has("awards") || sp.has("awardmeta")) {
      try {
        const r = await readAwards(env.AWARDS, sp.get("awards") ?? "", sp.get("biz") ?? "");
        return json(r, 200, { "Cache-Control": "public, max-age=3600" });
      } catch (e) {
        return json({ error: (e as Error).message, ready: false }, 400);
      }
    }
    if (sp.has("aisheet")) {
      const id = sp.get("aisheet") ?? "";
      if (!/^[A-Za-z0-9-]{6,40}$/.test(id)) return json({ error: "올바른 공고번호가 아닙니다." }, 400);
      if (!env.ANTHROPIC_API_KEY || !env.SITE_URL) return json({ status: "off" }, 503);
      try {
        // 본문은 사이트가 만든 파일에서만 읽는다 (브라우저가 보낸 글은 쓰지 않는다)
        const site = env.SITE_URL.replace(/\/$/, "");
        const r = await fetch(`${site}/ai-input/${encodeURIComponent(id)}.json`, { cf: { cacheTtl: 600 } } as RequestInit);
        const input = r.ok ? ((await r.json()) as AiInput & { none?: boolean }) : undefined;
        if (!input || input.none || !input.text || input.v !== AI_SHEET_VERSION) {
          // 빌드가 첨부를 다 읽지 못한 공고는 여기서 첨부를 모두 받아 읽는다 (첨부 목록은 사이트 파일에서만)
          const d = await fetch(`${site}/attachments/${encodeURIComponent(id)}.json`, { cf: { cacheTtl: 600 } } as RequestInit);
          if (!d.ok) return json({ status: "none", reason: "판독할 본문 없음" });
          const docs = (await d.json()) as LiveDocs;
          if (docs.read || !docs.files?.length) return json({ status: "none", reason: "첨부를 모두 읽었으나 배점표 없음" });
          const lkey = `ai-sheets/v${AI_SHEET_VERSION}/${id}-live-${liveKey(docs)}.json`;
          const lhit = await env.AWARDS?.get(lkey);
          if (lhit) return json(JSON.parse(new TextDecoder().decode(await lhit.arrayBuffer())), 200, { "X-Cache": "HIT" });
          const hosts = (env.ATTACH_HOSTS ?? "www.g2b.go.kr").split(",").map((h) => h.trim());
          const allowUrl = (u: string) => { try { const x = new URL(u); return (x.protocol === "https:" || x.protocol === "http:") && hosts.includes(x.hostname); } catch { return false; } };
          const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
          const live = await readSheetLive(client, docs, { id, model: env.AI_SHEET_MODEL || undefined, allowUrl });
          // 일시 오류, 받지 못한 첨부, 공고 정보가 없는 예전 사이트 파일이면 캐시하지 않는다 (다음에 고를 때 다시 읽는다)
          if (live.status !== "error" && !live.failed.length && docs.bid && env.AWARDS) ctx.waitUntil(env.AWARDS.put(lkey, JSON.stringify(live), { httpMetadata: { contentType: "application/json" } }));
          return json(live);
        }
        const key = `ai-sheets/v${AI_SHEET_VERSION}/${id}-${input.hash}.json`;
        const hit = await env.AWARDS?.get(key);
        if (hit) return json(JSON.parse(new TextDecoder().decode(await hit.arrayBuffer())), 200, { "X-Cache": "HIT" });
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
        const result: AiSheetResult = await readAiInput(client, input, env.AI_SHEET_MODEL || undefined);
        // 일시 오류는 캐시하지 않는다. 표 없음·검증 탈락은 다시 불러도 같으므로 캐시해 비용을 막는다
        if (result.status !== "error" && env.AWARDS) ctx.waitUntil(env.AWARDS.put(key, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } }));
        return json(result);
      } catch (e) {
        return json({ status: "error", reason: (e as Error).message.slice(0, 200) }, 502);
      }
    }
    if (sp.has("relate")) {
      const id = sp.get("relate") ?? "";
      if (!/^[A-Za-z0-9-]{6,40}$/.test(id)) return json({ error: "올바른 공고번호가 아닙니다." }, 400);
      if (!env.ANTHROPIC_API_KEY || !env.SITE_URL) return json({ status: "off", same: [] }, 503);
      try {
        // 후보는 사이트가 빌드 때 만든 낙찰 결과 분석 파일에서만 읽는다 (브라우저가 보낸 글은 쓰지 않는다)
        const r = await fetch(`${env.SITE_URL.replace(/\/$/, "")}/award-analysis/${encodeURIComponent(id)}.json`, { cf: { cacheTtl: 600 } } as RequestInit);
        if (!r.ok) return json({ status: "none", same: [] });
        const a = (await r.json()) as AwardAnalysis | null;
        if ((!a?.maybe?.length && !a?.related?.rows?.length) || !a.subject) return json({ status: "none", same: [] });
        const key = `ai-relate/v${RELATE_VERSION}/${id}-${relateHash(a)}.json`;
        const hit = await env.AWARDS?.get(key);
        if (hit) return json(JSON.parse(new TextDecoder().decode(await hit.arrayBuffer())), 200, { "X-Cache": "HIT" });
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
        const result: RelateResult = await relateAll(client, a, env.AI_SHEET_MODEL || undefined);
        if (result.status !== "error" && env.AWARDS) ctx.waitUntil(env.AWARDS.put(key, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } }));
        return json(result);
      } catch (e) {
        return json({ status: "error", same: [], reason: (e as Error).message.slice(0, 200) }, 502);
      }
    }
    if (sp.has("patents")) {
      const no = normalizeBizno(sp.get("patents") ?? "");
      if (!validBizno(no)) return json({ error: "올바른 사업자등록번호가 아닙니다." }, 400);
      return json(...(await patents(env, no, ctx)));
    }
    if (!env.DATA_GO_KR_SERVICE_KEY) return json({ error: "중계 서버에 공공데이터포털 인증키가 없습니다." }, 503);

    const cache0 = (caches as unknown as { default: Cache }).default;
    /** make 가 돌려준 ttl(초)만큼 캐시한다. 0이면 캐시하지 않는다 (일부 실패한 결과가 남지 않게) */
    const cached = async (key: string, make: () => Promise<{ body: unknown; ttl: number }>) => {
      const k = new Request(`https://corp-lookup.cache/${encodeURIComponent(key)}`);
      const hit = await cache0.match(k);
      if (hit) return json(await hit.json(), 200, { "X-Cache": "HIT" });
      const { body, ttl } = await make();
      if (ttl > 0) ctx.waitUntil(cache0.put(k, new Response(JSON.stringify(body), { headers: { "Cache-Control": `max-age=${ttl}` } })));
      return json(body);
    };

    try {
      if (sp.has("perf")) {
        const no = normalizeBizno(sp.get("bizno") ?? "");
        if (!validBizno(no)) return json({ error: "올바른 사업자등록번호가 아닙니다." }, 400);
        const biz = perfBizOf(sp.get("perf") ?? "");
        const from = sp.get("from") ?? "";
        const to = sp.get("to") ?? "";
        // 끝 날짜가 일주일 넘게 지난 기간은 낙찰 결과가 더 바뀌지 않는다
        const settled = Date.parse(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}T00:00:00+09:00`) < Date.now() - 7 * 86400e3;
        return await cached(`perf/${no}/${biz}/${from}-${to}`, async () => {
          const r = await fetchWins(env.DATA_GO_KR_SERVICE_KEY, no, biz, from, to);
          return { body: r, ttl: r.failed ? 0 : settled ? 30 * 86400 : 6 * 3600 };
        });
      }
      if (sp.has("ntce")) {
        const biz = perfBizOf(sp.get("biz") ?? "");
        const nos = (sp.get("ntce") ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort();
        return await cached(`ntce/${biz}/${nos.join(",")}`, async () => {
          const r = await fetchNtceClasses(env.DATA_GO_KR_SERVICE_KEY, biz, nos);
          // 공사는 분류가 비어 오는 경우가 많다: 다 채워졌으면 30일, 아니면 하루만 둔다
          return { body: r, ttl: r.every((c) => c.clsfcNo || c.midNm || c.mainWork) ? 30 * 86400 : 86400 };
        });
      }
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }

    const no = normalizeBizno(sp.get("bizno") ?? "");
    const cacheKey = new Request(`https://corp-lookup.cache/${no}`);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey);
    if (hit) return json(await hit.json(), 200, { "X-Cache": "HIT" });

    try {
      const data = await lookupCompany(no, env.DATA_GO_KR_SERVICE_KEY);
      // 출처 중 하나라도 실패했으면 캐시하지 않는다 (일시 장애가 12시간 남지 않게)
      // 활용신청 전인 자료(등록되지 않은 서비스키)는 다시 불러도 같으니 캐시를 막지 않는다
      if (!Object.values(data.errors).some((m) => !/등록되지 않은 서비스키/.test(m))) {
        ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
      }
      return json(data);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }
}

/** 요청 이름 (지표용) */
function routeOf(req: Request): string {
  const sp = new URL(req.url).searchParams;
  if (sp.has("admin") || sp.has("adminlogin") || sp.has("members")) return `admin:${(sp.get("admin") ?? (sp.has("adminlogin") ? "login" : "members")).slice(0, 20)}`;
  if (sp.has("account")) return `account:${(sp.get("account") ?? "").slice(0, 20)}`;
  for (const k of ["pv", "config", "signup", "trial", "awards", "awardmeta", "corps", "aisheet", "relate", "patents", "perf", "ntce", "presence", "bizno"]) if (sp.has(k)) return k;
  return "other";
}

/** 요청 하나의 지표를 Metrics에 보낸다. 사업자번호를 넣은 조회는 회원 사용량(seen)에 더한다 */
async function flushMetrics(req: Request, res: Response, ms: number, err: string, ns: MetricsNs) {
  const route = routeOf(req);
  const sp = new URL(req.url).searchParams;
  const hits = await takePending();
  const cls = `${Math.floor(res.status / 100)}xx`;
  hits.push({ kind: "req", key: route }, { kind: "status", key: `${route}:${cls}` }, { kind: "ms", key: route, n: ms });
  const bizno = ["bizno", "awards", "trial", "patents"].map((k) => sp.get(k) ?? "").map((v) => v.replace(/\D/g, "")).find((v) => v.length === 10);
  const cf = (req as unknown as { cf?: { country?: string } }).cf;
  const body: RecBody = {
    hits,
    seen: bizno && route !== "admin:members" ? [bizno] : [],
    // 페이지 조회 신호는 요청 기록에 남기지 않는다 (너무 많다)
    logs: route === "pv" && res.status < 500 ? [] : [{ ts: Date.now(), route, status: res.status, ms, ip: truncIp(req.headers.get("CF-Connecting-IP") ?? ""), country: cf?.country ?? "", msg: err }],
  };
  await metricsStub(ns).fetch("https://metrics/rec", { method: "POST", body: JSON.stringify(body) });
}

/** 페이지 조회 한 번: 경로, 유입 사이트(호스트만), 나라, 휴대폰 여부, 그날 처음 본 브라우저인지 */
async function recordPageView(req: Request, ns: MetricsNs) {
  const sp = new URL(req.url).searchParams;
  const path = (sp.get("p") ?? "/").replace(/[?#].*$/, "").slice(0, 80);
  if (!/^\/[\w\-./]*$/.test(path)) return;
  let ref = "";
  try { ref = new URL(sp.get("r") ?? "").hostname.replace(/^www\./, ""); } catch { ref = ""; }
  const ua = req.headers.get("User-Agent") ?? "";
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(ua)) return;
  const cf = (req as unknown as { cf?: { country?: string } }).cf;
  const stub = metricsStub(ns);
  const { salt } = (await (await stub.fetch("https://metrics/salt")).json()) as { salt: string };
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${req.headers.get("CF-Connecting-IP") ?? ""}|${ua}`));
  const uv = Array.from(new Uint8Array(raw).slice(0, 8)).map((x) => x.toString(16).padStart(2, "0")).join("");
  const hits = [
    { kind: "pv", key: path },
    { kind: "ref", key: ref || "(직접·북마크)" },
    { kind: "country", key: cf?.country ?? "??" },
    { kind: "device", key: /Mobi|Android|iPhone|iPad/i.test(ua) ? "휴대폰·태블릿" : "PC" },
  ];
  await stub.fetch("https://metrics/rec", { method: "POST", body: JSON.stringify({ hits, uv }) });
}

/**
 * 무료 체험 회원가입 (src/components/ApplyForm.tsx). 로그인 기능이 생기기 전이라 비밀번호는 받지 않고,
 * 사업자번호마다 가입 정보 하나를 R2 members/{사업자번호}.json 에 둔다. 이미 가입된 번호는 덮어쓰지 않는다(다른 사람이 연락처를 바꾸지 못하게).
 * 무료 체험 건수는 같은 사업자번호의 trial/{사업자번호}.json 으로 센다.
 */
async function signup(req: Request, bucket: NonNullable<Env["AWARDS"]>): Promise<[unknown, number]> {
  const raw = await req.text();
  if (raw.length > 8000) return [{ error: "입력이 너무 깁니다." }, 413];
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw) as Record<string, unknown>; } catch { return [{ error: "잘못된 요청" }, 400]; }
  const str = (k: string, max: number) => String(b[k] ?? "").trim().slice(0, max);
  const list = (k: string, max: number) => (Array.isArray(b[k]) ? (b[k] as unknown[]).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, max) : []);
  const bizno = normalizeBizno(str("bizno", 20));
  const m = {
    company: str("company", 100), bizno, name: str("name", 40), email: str("email", 120), phone: str("phone", 30),
    licenses: list("licenses", 40), regions: list("regions", 20), size: str("size", 40), keywords: str("keywords", 200),
    agreePrivacy: b.agreePrivacy === true, agreeMail: b.agreeMail === true, plan: str("plan", 20),
  };
  if (!m.company || !m.name || !m.phone) return [{ error: "회사명, 담당자 이름, 연락처를 입력해 주세요." }, 400];
  if (!validBizno(bizno)) return [{ error: "올바른 사업자등록번호가 아닙니다." }, 400];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) return [{ error: "이메일 주소를 확인해 주세요." }, 400];
  if (!m.agreePrivacy) return [{ error: "개인정보 수집·이용에 동의해 주세요." }, 400];
  const key = `members/${bizno}.json`;
  if (await bucket.get(key)) return [{ status: "exists" }, 200];
  await bucket.put(key, JSON.stringify({ ...m, joinedAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
  return [{ status: "ok" }, 200];
}

const PATENT_TTL_MS = 30 * 86400e3;

/**
 * 기업 특허 조회. 같은 사업자번호는 30일 동안 R2 결과를 쓴다 (특허 등록은 자주 바뀌지 않고, KIPRIS Plus 무료 호출은 월 1,000회).
 * 이번 달 호출 수가 상한에 가까우면 부르지 않고 status limit 을 돌려준다 (화면은 직접 입력으로 계산).
 */
async function patents(env: Env, no: string, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<[PatentLookup, number, Record<string, string>?]> {
  const off = (status: PatentLookup["status"], reason: string): PatentLookup => ({ bizno: no, status, applicants: [], items: [], total: 0, checkedAt: new Date().toISOString(), reason });
  const bucket = env.AWARDS;
  const key = `patents/v2/${no}.json`;
  if (bucket) {
    const hit = await bucket.get(key);
    if (hit) {
      try {
        const v = JSON.parse(new TextDecoder().decode(await hit.arrayBuffer())) as PatentLookup;
        if (Date.now() - Date.parse(v.checkedAt) < PATENT_TTL_MS) return [v, 200, { "X-Cache": "HIT" }];
      } catch { /* 새로 조회 */ }
    }
  }
  let result: PatentLookup = off("off", "특허 조회 인증키가 아직 없습니다");
  // 1) 특허청 등록원부 (공공데이터포털 키)
  if (env.DATA_GO_KR_SERVICE_KEY) {
    try {
      result = await fetchPatentsRgst(env.DATA_GO_KR_SERVICE_KEY, no);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 160);
      result = off(/등록되지 않은|SERVICE_KEY/.test(msg) ? "off" : "error", msg);
    }
  }
  // 2) KIPRIS Plus (키가 있을 때만, 등록원부가 실패했을 때)
  if (result.status !== "ok" && result.status !== "none" && env.KIPRIS_API_KEY) {
    const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7).replace("-", "");
    const ukey = `patents/usage-${month}.json`;
    let used = 0;
    if (bucket) {
      const u = await bucket.get(ukey);
      if (u) { try { used = Number((JSON.parse(new TextDecoder().decode(await u.arrayBuffer())) as { calls?: number }).calls) || 0; } catch { used = 0; } }
    }
    const limit = Number(env.KIPRIS_MONTHLY_LIMIT) || 950;
    if (used + 4 > limit) result = off("limit", "이번 달 특허 조회 한도에 다다랐습니다");
    else {
      let calls = 0;
      const counted: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { calls++; return fetch(input as RequestInfo, init); }) as typeof fetch;
      try {
        result = await fetchPatents(env.KIPRIS_API_KEY, no, counted);
      } catch (e) {
        result = off("error", (e as Error).message.slice(0, 160));
      }
      if (bucket) ctx.waitUntil(bucket.put(ukey, JSON.stringify({ calls: used + calls }), { httpMetadata: { contentType: "application/json" } }));
    }
  }
  if (bucket && (result.status === "ok" || result.status === "none")) ctx.waitUntil(bucket.put(key, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } }));
  return [result, 200, { "Cache-Control": "no-store" }];
}
