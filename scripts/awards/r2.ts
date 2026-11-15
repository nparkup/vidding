/**
 * Cloudflare R2 버킷을 Cloudflare API 토큰으로 읽고 쓴다 (wrangler r2 object 명령이 쓰는 것과 같은 주소).
 * 필요한 환경변수: CLOUDFLARE_API_TOKEN (Workers R2 Storage Write 권한), CLOUDFLARE_ACCOUNT_ID
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { BUCKET } from "../../src/lib/awards/format";

/** 시험용: R2_LOCAL_DIR 를 주면 R2 대신 그 폴더에 읽고 쓴다 */
const LOCAL = process.env.R2_LOCAL_DIR;

const token = () => {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) throw new Error("CLOUDFLARE_API_TOKEN 이 없습니다.");
  return t;
};
const account = () => {
  const a = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!a) throw new Error("CLOUDFLARE_ACCOUNT_ID 가 없습니다.");
  return a;
};
const bucket = () => process.env.R2_BUCKET || BUCKET;
const objectUrl = (key: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${account()}/r2/buckets/${bucket()}/objects/${encodeURIComponent(key)}`;

async function req(method: string, url: string, body?: Buffer, contentType?: string): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < 4; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500 * i));
    try {
      const r = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token()}`, ...(contentType ? { "Content-Type": contentType } : {}) },
        body: body ? new Uint8Array(body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      // 권한·주소 오류는 다시 시도해도 같다
      if (r.status === 401 || r.status === 403 || r.status === 400) {
        throw Object.assign(new Error(`R2 ${method} ${r.status}: ${(await r.text()).slice(0, 300)}`), { fatal: true });
      }
      if (r.status >= 500 || r.status === 429) { last = new Error(`R2 ${method} ${r.status}`); continue; }
      return r;
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      last = e;
    }
  }
  throw last;
}

export async function r2Get(key: string): Promise<Buffer | null> {
  if (LOCAL) return existsSync(join(LOCAL, key)) ? readFileSync(join(LOCAL, key)) : null;
  const r = await req("GET", objectUrl(key));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 GET ${key} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function r2Put(key: string, body: Buffer, contentType = "application/octet-stream"): Promise<void> {
  if (LOCAL) { mkdirSync(dirname(join(LOCAL, key)), { recursive: true }); writeFileSync(join(LOCAL, key), body); return; }
  const r = await req("PUT", objectUrl(key), body, contentType);
  if (!r.ok) throw new Error(`R2 PUT ${key} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export async function r2Delete(key: string): Promise<void> {
  if (LOCAL) { rmSync(join(LOCAL, key), { force: true }); return; }
  const r = await req("DELETE", objectUrl(key));
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${key} ${r.status}`);
}

/**
 * Cloudflare가 집계한 이 버킷의 저장 용량(바이트). 집계가 늦거나 권한이 없으면 undefined.
 * 수집 스크립트는 직접 센 크기와 이 값 중 큰 쪽으로 한도를 판단한다.
 */
export async function r2BucketBytes(): Promise<number | undefined> {
  if (LOCAL) return undefined;
  try {
    const r = await req("GET", `https://api.cloudflare.com/client/v4/accounts/${account()}/r2/metrics`);
    if (!r.ok) return undefined;
    const j = (await r.json()) as { result?: Record<string, unknown> };
    // 응답 형태: result.standard.published.payloadSize 등 (계정 전체). 이 계정은 이 버킷만 쓴다고 보고 합친다
    let total = 0;
    let found = false;
    const walk = (o: unknown) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if ((k === "payloadSize" || k === "metadataSize") && typeof v === "number") { total += v; found = true; }
        else if (k !== "uploaded") walk(v);
      }
    };
    walk(j.result?.standard ?? j.result);
    return found ? total : undefined;
  } catch {
    return undefined;
  }
}
