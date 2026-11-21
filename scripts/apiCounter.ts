/**
 * 빌드·수집 스크립트의 공공데이터포털 호출 수를 센다 (관리자 화면 'API 사용량').
 * 불러오기만 하면 전역 fetch를 감싸 서비스/오퍼레이션별 호출·실패 수를 모으고, flushApiCounts() 가 R2 ops/api-calls/{한국 날짜}/{출처}-{실행 번호}.json 에 남긴다.
 * Cloudflare 토큰이 없거나 올리지 못해도 스크립트는 그대로 끝난다 (경고만).
 */
import { r2Put } from "./awards/r2";

const calls = new Map<string, number>();
const errors = new Map<string, number>();
const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function keyOf(u: URL): string {
  const parts = u.pathname.split("/").filter(Boolean);
  return `${parts[parts.length - 2] ?? ""}/${parts[parts.length - 1] ?? ""}`.slice(0, 100);
}

const orig = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let u: URL | null = null;
  try { u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url); } catch { u = null; }
  const ours = !!u && u.hostname.endsWith("data.go.kr");
  try {
    const r = await orig(input as RequestInfo, init);
    if (ours) { add(calls, keyOf(u!)); if (!r.ok) add(errors, `${keyOf(u!)}:${r.status}`); }
    return r;
  } catch (e) {
    if (ours) { add(calls, keyOf(u!)); add(errors, `${keyOf(u!)}:network`); }
    throw e;
  }
}) as typeof fetch;

export async function flushApiCounts(source: string): Promise<void> {
  if (!calls.size) return;
  if (!process.env.R2_LOCAL_DIR && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) return;
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : String(Date.now());
  const body = { source, run, at: new Date().toISOString(), calls: Object.fromEntries(calls), errors: Object.fromEntries(errors) };
  try {
    await r2Put(`ops/api-calls/${day}/${source}-${run}.json`, Buffer.from(JSON.stringify(body)), "application/json");
    console.log(`공공데이터포털 호출 ${[...calls.values()].reduce((s, n) => s + n, 0).toLocaleString()}회 기록 (${source})`);
  } catch (e) {
    console.warn("API 호출 수 기록 건너뜀:", e instanceof Error ? e.message : e);
  }
  calls.clear();
  errors.clear();
}
