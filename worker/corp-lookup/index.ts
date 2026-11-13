/**
 * 정적 사이트(GitHub Pages)용 기업 정보 중계 서버 (Cloudflare Worker).
 * 서비스키는 Worker 비밀값 DATA_GO_KR_SERVICE_KEY 에만 두고, 브라우저는 GET /?bizno=0000000000 만 부른다.
 * 허용한 사이트 주소(ALLOWED_ORIGINS)에서 온 요청에만 CORS를 열고, 같은 번호는 12시간 동안 캐시해 호출 한도를 아낀다.
 */
import { lookupCompany, normalizeBizno } from "../../src/lib/corpLookup";

interface Env {
  DATA_GO_KR_SERVICE_KEY: string;
  /** 쉼표로 구분한 허용 Origin, 예: https://nparkup.github.io,http://localhost:3000 */
  ALLOWED_ORIGINS?: string;
}

const CACHE_SECONDS = 12 * 3600;

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
    if (!env.DATA_GO_KR_SERVICE_KEY) return json({ error: "중계 서버에 공공데이터포털 인증키가 없습니다." }, 503);

    const no = normalizeBizno(new URL(req.url).searchParams.get("bizno") ?? "");
    const cacheKey = new Request(`https://corp-lookup.cache/${no}`);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(cacheKey);
    if (hit) return json(await hit.json(), 200, { "X-Cache": "HIT" });

    try {
      const data = await lookupCompany(no, env.DATA_GO_KR_SERVICE_KEY);
      // 출처 중 하나라도 실패했으면 캐시하지 않는다 (일시 장애가 12시간 남지 않게)
      if (!Object.keys(data.errors).length) {
        ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
      }
      return json(data);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  },
};
