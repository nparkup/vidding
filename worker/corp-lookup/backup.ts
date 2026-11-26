/**
 * 회원·결제 자료 백업과 법정 보존 기록 정리 (매일 0시 10분 한국, wrangler.toml crons → index.ts scheduled).
 *
 * 백업
 * - 낙찰 저장소 버킷(bidmate-awards)의 회원 관련 자료만 모아 별도 비공개 버킷 bidmate-backup(바인딩 BACKUP)에 한 파일로 둔다.
 *   낙찰·공고 데이터는 수집 스크립트로 다시 받을 수 있어 백업하지 않는다.
 * - Worker 비밀값 BACKUP_KEY 가 있으면 AES-256-GCM으로 암호화한다(.enc). 키는 저장소 Secrets BACKUP_KEY → corp-worker.yml 이 넣는다.
 *   키를 잃어버리면 암호화한 백업은 풀 수 없으니 따로 안전하게 보관한다.
 * - daily/{날짜} 14개, 매달 1일은 monthly/{연-월} 3개만 남긴다 (src/lib/privacy.ts, 개인정보처리방침에 적은 기간).
 * - 한 번에 읽는 파일은 MAX_OBJECTS 까지. 넘으면 중요한 자료(회원·결제)부터 담고 나머지는 빠졌다고 기록한다.
 *
 * 법정 보존
 * - 탈퇴하면 결제 기록은 retain/billing/{사업자번호}-{시각}.json 으로 옮기고 5년 뒤 지운다 (account.ts finishWithdraw).
 * - 탈퇴 기록 withdraw/done/ 도 5년이 지나면, 무료 체험 기록 trial/ 은 마지막 사용 후 1년이 지나면 지운다 (매달 1일).
 */
import { BACKUP_DAILY_KEEP, BACKUP_MONTHLY_KEEP } from "../../src/lib/privacy";

export interface BBucket {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string; size?: number; uploaded?: Date }[]; truncated: boolean; cursor?: string }>;
}

/** 중요한 순서. 앞쪽부터 담는다 */
const PREFIXES = ["members/", "billing/", "retain/", "withdraw/", "auth/email/", "usage/", "mybox/", "config/site.json", "config/admin.json", "trial/"];
const MAX_OBJECTS = 800;

const kst = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString();

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`bidmate-backup:${secret}`));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(secret: string, text: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(4 + iv.length + ct.length);
  out.set(new TextEncoder().encode("BMB1"), 0);
  out.set(iv, 4);
  out.set(ct, 16);
  return out;
}
export async function decrypt(secret: string, buf: Uint8Array): Promise<string> {
  if (new TextDecoder().decode(buf.slice(0, 4)) !== "BMB1") throw new Error("백업 파일 형식이 아닙니다.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(4, 16) }, await aesKey(secret), buf.slice(16));
  return new TextDecoder().decode(pt);
}

export interface BackupSnapshot { v: 1; at: string; objects: Record<string, string>; skipped: string[]; counts: Record<string, number> }

/** 지금 자료를 모은다 */
async function snapshot(src: BBucket): Promise<BackupSnapshot> {
  const objects: Record<string, string> = {};
  const skipped: string[] = [];
  const counts: Record<string, number> = {};
  let n = 0;
  for (const p of PREFIXES) {
    let cursor: string | undefined;
    counts[p] = 0;
    do {
      const r = await src.list({ prefix: p, cursor, limit: 1000 });
      for (const o of r.objects) {
        if (p.endsWith(".json") && o.key !== p) continue;
        if (n >= MAX_OBJECTS) { skipped.push(o.key); continue; }
        const b = await src.get(o.key);
        n++;
        if (!b) continue;
        objects[o.key] = new TextDecoder().decode(await b.arrayBuffer());
        counts[p]++;
      }
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
  }
  return { v: 1, at: new Date().toISOString(), objects, skipped: skipped.slice(0, 200), counts };
}

/** 백업 하나를 만들고 오래된 것을 지운다 */
export async function runBackup(src: BBucket, dst: BBucket | undefined, key: string | undefined): Promise<{ key: string; bytes: number; counts: Record<string, number>; skipped: number; encrypted: boolean } | { error: string }> {
  if (!dst) return { error: "백업 버킷(bidmate-backup)이 아직 연결되지 않았습니다." };
  const snap = await snapshot(src);
  const text = JSON.stringify(snap);
  const body = key ? await encrypt(key, text) : new TextEncoder().encode(text);
  const ext = key ? "json.enc" : "json";
  const day = kst().slice(0, 10);
  const name = `daily/${day}.${ext}`;
  await dst.put(name, body, { httpMetadata: { contentType: key ? "application/octet-stream" : "application/json" } });
  if (day.endsWith("-01")) await dst.put(`monthly/${day.slice(0, 7)}.${ext}`, body, { httpMetadata: { contentType: "application/octet-stream" } });
  await prune(dst, "daily/", BACKUP_DAILY_KEEP);
  await prune(dst, "monthly/", BACKUP_MONTHLY_KEEP);
  await dst.put("last.json", JSON.stringify({ key: name, at: snap.at, bytes: body.byteLength, counts: snap.counts, skipped: snap.skipped.length, encrypted: !!key }), { httpMetadata: { contentType: "application/json" } });
  return { key: name, bytes: body.byteLength, counts: snap.counts, skipped: snap.skipped.length, encrypted: !!key };
}

async function prune(dst: BBucket, prefix: string, keep: number) {
  const r = await dst.list({ prefix, limit: 1000 });
  const keys = r.objects.map((o) => o.key).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - keep))) await dst.delete(k);
}

export async function listBackups(dst: BBucket | undefined) {
  if (!dst) return { ready: false, items: [], last: null };
  const [d, m, last] = await Promise.all([dst.list({ prefix: "daily/", limit: 100 }), dst.list({ prefix: "monthly/", limit: 100 }), dst.get("last.json")]);
  const items = [...d.objects, ...m.objects].map((o) => ({ key: o.key, size: o.size ?? 0 })).sort((a, b) => (a.key < b.key ? 1 : -1));
  let lastInfo: unknown = null;
  if (last) { try { lastInfo = JSON.parse(new TextDecoder().decode(await last.arrayBuffer())); } catch { lastInfo = null; } }
  return { ready: true, items, last: lastInfo };
}

/**
 * 복구 시험: 가장 최근 백업을 풀어 지금 저장소와 회원·결제 파일 수와 내용을 비교한다 (실제로 덮어쓰지는 않는다).
 */
export async function verifyBackup(src: BBucket, dst: BBucket | undefined, key: string | undefined) {
  if (!dst) return { ok: false, reason: "백업 버킷이 없습니다." };
  const last = await dst.get("last.json");
  if (!last) return { ok: false, reason: "아직 백업이 없습니다." };
  const info = JSON.parse(new TextDecoder().decode(await last.arrayBuffer())) as { key: string; encrypted: boolean };
  const obj = await dst.get(info.key);
  if (!obj) return { ok: false, reason: `백업 파일 ${info.key} 이 없습니다.` };
  const buf = new Uint8Array(await obj.arrayBuffer());
  if (info.encrypted && !key) return { ok: false, reason: "암호화 키(BACKUP_KEY)가 없어 풀 수 없습니다." };
  let snap: BackupSnapshot;
  try { snap = JSON.parse(info.encrypted ? await decrypt(key!, buf) : new TextDecoder().decode(buf)) as BackupSnapshot; }
  catch (e) { return { ok: false, reason: `백업을 풀지 못했습니다: ${(e as Error).message}` }; }
  const out: Record<string, { backup: number; live: number; same: number }> = {};
  for (const p of ["members/", "billing/", "retain/"]) {
    const keys = Object.keys(snap.objects).filter((k) => k.startsWith(p));
    let live = 0, same = 0;
    let cursor: string | undefined;
    do {
      const r = await src.list({ prefix: p, cursor, limit: 1000 });
      live += r.objects.length;
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
    for (const k of keys.slice(0, 200)) {
      const b = await src.get(k);
      if (b && new TextDecoder().decode(await b.arrayBuffer()) === snap.objects[k]) same++;
    }
    out[p] = { backup: keys.length, live, same };
  }
  return { ok: true, file: info.key, at: snap.at, parsed: Object.keys(snap.objects).length, compare: out };
}

/** 보존 기간이 지난 결제 기록·탈퇴 기록을 지운다 */
export async function purgeRetained(src: BBucket, now = Date.now()): Promise<number> {
  let n = 0;
  for (const p of ["retain/billing/", "withdraw/done/"]) {
    let cursor: string | undefined;
    do {
      const r = await src.list({ prefix: p, cursor, limit: 1000 });
      for (const o of r.objects) {
        // retain/billing/{YYYYMMDD 삭제일}-… 은 파일 이름만 보고 지운다
        const d = /^retain\/billing\/(\d{4})(\d{2})(\d{2})-/.exec(o.key);
        if (d) { if (Date.parse(`${d[1]}-${d[2]}-${d[3]}T00:00:00Z`) < now) { await src.delete(o.key); n++; } continue; }
        const b = await src.get(o.key);
        if (!b) continue;
        let v: { deleteAfter?: string; at?: string } = {};
        try { v = JSON.parse(new TextDecoder().decode(await b.arrayBuffer())); } catch { continue; }
        // deleteAfter 가 없는 예전 탈퇴 기록은 탈퇴 시각 + 5년
        const until = v.deleteAfter ? Date.parse(v.deleteAfter) : v.at ? Date.parse(v.at) + 5 * 365.25 * 86400e3 : NaN;
        if (Number.isFinite(until) && until < now) { await src.delete(o.key); n++; }
      }
      cursor = r.truncated ? r.cursor : undefined;
    } while (cursor);
  }
  // 무료 체험 사용 기록은 마지막으로 바뀐 지 1년이 지나면 지운다 (파일을 고칠 때마다 올린 시각이 새로 찍힌다)
  let cursor: string | undefined;
  do {
    const r = await src.list({ prefix: "trial/", cursor, limit: 1000 });
    for (const o of r.objects) if (o.uploaded && new Date(o.uploaded).getTime() < now - 365 * 86400e3) { await src.delete(o.key); n++; }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return n;
}
