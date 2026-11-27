/**
 * 회원 개인정보·비밀값 암호화 저장 (AES-256-GCM).
 *
 * R2 버킷(AWARDS)을 감싸서, 아래 SEALED 경로의 파일은 쓸 때 암호화하고 읽을 때 푼다. 다른 코드는 바뀌지 않는다.
 * - 키: Worker 비밀값 MEMBER_KEY (저장소 Secrets MEMBER_KEY → corp-worker.yml). 바꿀 때는 예전 키를 MEMBER_KEY_OLD 로 함께 둔다.
 * - 파일마다 무작위 IV, 파일 경로를 추가 인증 데이터(AAD)로 묶어 다른 회원 파일로 바꿔치기하면 풀리지 않는다.
 * - 저장 형식: {"$bm":"enc1","k":키 ID,"iv":…,"d":…} (base64). 키 ID는 키의 해시 앞 8자리라 키를 드러내지 않는다.
 * - MEMBER_KEY 가 없으면 예전처럼 평문으로 쓴다(배포가 키보다 먼저 와도 사이트가 멈추지 않게). 암호화된 파일을 키 없이 읽으면 오류를 낸다
 *   (빈 값으로 보고 같은 사업자번호로 다시 가입받는 일이 없게).
 * - 예전 평문 파일은 읽을 때 그대로 읽고, sealExisting 이 매시간 예약 작업에서 암호화해 둔다.
 */

/** 암호화하는 경로. 회원 가입 정보·결제·탈퇴·보존 결제 기록·서류함, 로그인 서명 키, 관리자 2단계 인증 비밀값 */
export const SEALED_PREFIXES = ["members/", "billing/", "withdraw/", "retain/", "mybox/"];
export const SEALED_KEYS = ["config/auth-key.json", "config/admin-totp.json"];
/** 암호화 진행 상태 (평문 파일이 남았는지) */
export const SEAL_STATE_KEY = "config/seal-state.json";

export const isSealedKey = (key: string) => SEALED_KEYS.includes(key) || SEALED_PREFIXES.some((p) => key.startsWith(p));

const te = new TextEncoder();
const td = new TextDecoder();
const MARK = '{"$bm":"enc1"';

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

export interface SealKey { kid: string; key: CryptoKey }
export interface Keyring { current?: SealKey; all: SealKey[] }

async function makeKey(secret: string): Promise<SealKey> {
  const raw = await crypto.subtle.digest("SHA-256", te.encode(`bidmate-member-data:${secret}`));
  const kid = hex(await crypto.subtle.digest("SHA-256", te.encode(`bidmate-member-kid:${secret}`))).slice(0, 8);
  return { kid, key: await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]) };
}

const ringCache = new Map<string, Promise<Keyring>>();
/** MEMBER_KEY(지금 키)와 MEMBER_KEY_OLD(바꾸기 전 키, 쉼표로 여러 개). 16자보다 짧은 값은 쓰지 않는다 */
export function keyringOf(env: { MEMBER_KEY?: string; MEMBER_KEY_OLD?: string }): Promise<Keyring> {
  const cur = (env.MEMBER_KEY ?? "").trim();
  const old = (env.MEMBER_KEY_OLD ?? "").split(",").map((s) => s.trim()).filter((s) => s.length >= 16 && s !== cur);
  const id = `${cur}\u0000${old.join("\u0000")}`;
  let p = ringCache.get(id);
  if (!p) {
    p = (async () => {
      const current = cur.length >= 16 ? await makeKey(cur) : undefined;
      const all = [...(current ? [current] : []), ...(await Promise.all(old.map(makeKey)))];
      return { current, all };
    })();
    ringCache.set(id, p);
  }
  return p;
}

export const isSealedText = (s: string) => s.startsWith(MARK);
export const sealedKid = (s: string): string | null => {
  if (!isSealedText(s)) return null;
  try { return String((JSON.parse(s) as { k?: string }).k ?? ""); } catch { return null; }
};

export async function sealText(ring: Keyring, path: string, text: string): Promise<string> {
  if (!ring.current) return text;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(path) }, ring.current.key, te.encode(text)));
  return `${MARK},"k":"${ring.current.kid}","iv":"${b64(iv)}","d":"${b64(ct)}"}`;
}

export async function openText(ring: Keyring, path: string, text: string): Promise<string> {
  if (!isSealedText(text)) return text;
  const env = JSON.parse(text) as { k: string; iv: string; d: string };
  const k = ring.all.find((x) => x.kid === env.k);
  if (!k) throw new Error(`암호화 키가 맞지 않아 회원 자료를 풀 수 없습니다 (${path}, 키 ${env.k}). MEMBER_KEY·MEMBER_KEY_OLD 를 확인해 주세요.`);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv), additionalData: te.encode(path) }, k.key, unb64(env.d));
  return td.decode(pt);
}

/** 이미 읽은 내용을 R2 객체처럼 돌려준다 (arrayBuffer·text·json·body) */
function bodyOf(text: string) {
  const bytes = te.encode(text);
  return {
    get body() { return new Response(bytes).body as ReadableStream; },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    text: async () => text,
    json: async <T = unknown>() => JSON.parse(text) as T,
  };
}

interface RawBucket {
  get(key: string, ...rest: unknown[]): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: unknown, ...rest: unknown[]): Promise<unknown>;
}

/**
 * 버킷을 감싼다. SEALED 경로만 get·put 을 가로채고 나머지(낙찰 자료 등)는 그대로 넘긴다.
 * 감싼 버킷은 원래 버킷과 같은 모양이라 그대로 넘겨 쓰면 된다.
 */
export function sealBucket<B extends RawBucket>(bucket: B, ring: Keyring): B {
  return new Proxy(bucket, {
    get(target, prop) {
      if (prop === "get") {
        return async (key: string, ...rest: unknown[]) => {
          const o = await target.get(key, ...rest);
          if (!o || !isSealedKey(key)) return o;
          const text = td.decode(await o.arrayBuffer());
          return bodyOf(await openText(ring, key, text));
        };
      }
      if (prop === "put") {
        return async (key: string, value: unknown, ...rest: unknown[]) => {
          if (isSealedKey(key) && typeof value === "string") return target.put(key, await sealText(ring, key, value), ...rest);
          return target.put(key, value, ...rest);
        };
      }
      const v = Reflect.get(target, prop);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

export interface SealStatus { on: boolean; kid: string | null; sealed: number; plain: number; otherKey: number; at: string; done: boolean }

interface ListBucket extends RawBucket {
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

/**
 * 원래(감싸지 않은) 버킷에서 평문이나 예전 키로 된 파일을 지금 키로 다시 쓴다. 한 번에 max 개까지 고치고 상태를 남긴다.
 * dry 면 세기만 한다.
 */
export async function sealExisting(raw: ListBucket, ring: Keyring, opts: { max?: number; dry?: boolean } = {}): Promise<SealStatus> {
  const max = opts.max ?? 300;
  let sealed = 0, plain = 0, otherKey = 0, fixed = 0;
  const keys: string[] = [...SEALED_KEYS];
  for (const p of SEALED_PREFIXES) {
    let cursor: string | undefined;
    do {
      const r = await raw.list({ prefix: p, cursor, limit: 1000 });
      for (const o of r.objects) keys.push(o.key);
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
  }
  for (const key of keys) {
    const o = await raw.get(key);
    if (!o) continue;
    const text = td.decode(await o.arrayBuffer());
    const kid = sealedKid(text);
    const ok = kid !== null && kid === ring.current?.kid;
    if (ok) { sealed++; continue; }
    if (kid === null) plain++; else otherKey++;
    if (opts.dry || !ring.current || fixed >= max) continue;
    let plainText: string;
    try { plainText = await openText(ring, key, text); } catch { continue; }
    await raw.put(key, await sealText(ring, key, plainText), { httpMetadata: { contentType: "application/json" } });
    fixed++;
    if (kid === null) plain--; else otherKey--;
    sealed++;
  }
  const st: SealStatus = { on: !!ring.current, kid: ring.current?.kid ?? null, sealed, plain, otherKey, at: new Date().toISOString(), done: !!ring.current && plain === 0 && otherKey === 0 };
  if (!opts.dry) await raw.put(SEAL_STATE_KEY, JSON.stringify(st), { httpMetadata: { contentType: "application/json" } });
  return st;
}

/** 상태 파일만 읽는다 (관리자 화면). 키가 바뀌었으면 done 을 다시 거짓으로 본다 */
export async function readSealState(raw: RawBucket, ring: Keyring): Promise<SealStatus | null> {
  const o = await raw.get(SEAL_STATE_KEY);
  if (!o) return null;
  try {
    const st = JSON.parse(td.decode(await o.arrayBuffer())) as SealStatus;
    if (st.kid !== (ring.current?.kid ?? null)) st.done = false;
    return st;
  } catch { return null; }
}
