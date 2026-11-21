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
 * - GET /?awards=사업자번호&biz=용역 : 그 업체의 최근 3년 낙찰을 공고 분류와 함께. 조달청 API를 부르지 않는다 (6시간 캐시)
 * - GET /?awardmeta=1 : 저장소 수집 범위·완료 여부
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
 * - GET /?relate=공고번호-차수 : 사이트의 /award-analysis/{공고}.json 에 있는 '같은 사업인지 애매한 후보'와 '핵심어로 찾은 다른 기관 낙찰'을 Claude로 확인한다
 *   (src/lib/awards/relate.ts). 결과는 R2 ai-relate/v{버전}/{공고}-{후보 해시}.json
 */
import { lookupCompany, normalizeBizno, validBizno } from "../../src/lib/corpLookup";
import { fetchNtceClasses, fetchWins, perfBizOf } from "../../src/lib/perfLookup";
import { readAwards, type R2BucketLike } from "../../src/lib/awards/read";
import Anthropic from "@anthropic-ai/sdk";
import { RELATE_VERSION, relateAll, relateHash, type RelateResult } from "../../src/lib/awards/relate";
import type { AwardAnalysis } from "../../src/lib/awards/analysis";
import { AI_SHEET_VERSION, readAiInput, type AiInput, type AiSheetResult } from "../../src/lib/nara/aiSheet";
import { liveKey, readSheetLive, type LiveDocs } from "../../src/lib/nara/liveSheet";

interface Env {
  DATA_GO_KR_SERVICE_KEY: string;
  /** 낙찰 저장소 (wrangler.toml r2_buckets). 없으면 ?awards 는 ready:false */
  AWARDS?: R2BucketLike & { put(key: string, value: string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> };
  /** 공고 배점표 AI 판독용 Anthropic API 키 (Worker 비밀값). 없으면 ?aisheet 는 503 */
  ANTHROPIC_API_KEY?: string;
  /** AI 판독 모델 (기본 claude-haiku-5-5) */
  AI_SHEET_MODEL?: string;
  /** AI 판독 입력을 읽어 올 사이트 주소, 예: https://nparkup.github.io/vidding */
  SITE_URL?: string;
  /** 그 자리에서 첨부를 받을 때 허용하는 호스트 (쉼표 구분, 기본 www.g2b.go.kr) */
  ATTACH_HOSTS?: string;
  /** 쉼표로 구분한 허용 Origin, 예: https://nparkup.github.io,http://localhost:3000 */
  ALLOWED_ORIGINS?: string;
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
/** 무료 체험으로 분석할 수 있는 공고 수 (src/lib/trial.ts TRIAL_LIMIT 와 같게) */
const TRIAL_LIMIT = 3;

export default {
  async fetch(req: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGINS ?? "https://nparkup.github.io").split(",").map((s) => s.trim()).filter(Boolean);
    const cors: Record<string, string> = allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" }
      : {};
    const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Max-Age": "86400" } });
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
    if (sp.has("trial")) {
      // 무료 체험 사용 공고 (src/lib/trial.ts): 사업자번호마다 처음 분석한 공고 3건까지만 남긴다. 저장 값은 공고 키와 시각뿐
      const bizno = sp.get("trial") ?? "";
      const keys = (sp.get("bids") ?? "").split(",").filter((k) => /^(nara|apt):[A-Za-z0-9._-]{1,60}$/.test(k)).slice(0, 6);
      if (!/^\d{10}$/.test(bizno)) return json({ error: "잘못된 사업자번호" }, 400);
      if (!env.AWARDS) return json({ error: "off" }, 503);
      const key = `trial/${bizno}.json`;
      const hit = await env.AWARDS.get(key);
      let used: { k: string; t: number }[] = [];
      if (hit) {
        try { used = (JSON.parse(new TextDecoder().decode(await hit.arrayBuffer())) as { used?: typeof used }).used ?? []; } catch { used = []; }
      }
      const before = used.length;
      const now = Date.now();
      for (const k of keys) if (used.length < TRIAL_LIMIT && !used.some((e) => e.k === k)) used.push({ k, t: now });
      if (used.length !== before) await env.AWARDS.put(key, JSON.stringify({ used }), { httpMetadata: { contentType: "application/json" } });
      return json({ used, limit: TRIAL_LIMIT }, 200, { "Cache-Control": "no-store" });
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
  },
};
