/**
 * 정적 사이트(GitHub Pages)용 기업 정보 중계 서버 (Cloudflare Worker).
 * 서비스키는 Worker 비밀값 DATA_GO_KR_SERVICE_KEY 에만 두고, 브라우저는 GET /?bizno=0000000000 만 부른다.
 * 허용한 사이트 주소(ALLOWED_ORIGINS)에서 온 요청에만 CORS를 열고, 같은 번호는 12시간 동안 캐시해 호출 한도를 아낀다.
 *
 * 유사 실적 조회 (src/lib/perfLookup.ts):
 * - GET /?perf=용역&bizno=..&from=YYYYMMDD&to=YYYYMMDD : 그 기간(최대 15주)의 낙찰 건. 지난 기간은 바뀌지 않아 30일 캐시한다
 * - GET /?ntce=공고번호,공고번호&biz=용역 : 공고번호별 세부품명·중분류 (30일 캐시)
 */
import { lookupCompany, normalizeBizno, validBizno } from "../../src/lib/corpLookup";
import { fetchNtceClasses, fetchWins, perfBizOf } from "../../src/lib/perfLookup";

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

    const sp = new URL(req.url).searchParams;
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
      if (!Object.keys(data.errors).length) {
        ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } })));
      }
      return json(data);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  },
};
