/**
 * 관리자 화면 'API 사용량'·'시스템 정보'용 자료 (admin.ts 가 부른다).
 * - apiUsage: 중계 서버가 센 호출(Metrics hits)과 빌드·수집 스크립트가 남긴 호출(R2 ops/api-calls/)을 날짜별로 합친다
 * - storage: R2 사용량. 수집 스크립트가 잰 값(ops/r2-usage.json), 낙찰 저장소 목록(manifest.json·rank-state.json), 중계 서버가 쓰는 폴더 크기
 * - actions: GitHub Actions 최근 실행 (배포·수집 실패 확인). Worker 비밀값 GITHUB_TOKEN 이 있으면 쓰고, 없으면 공개 API(시간당 60회)를 쓴다
 */
import type { AdminBucket } from "./admin";
import { kstDay, metricsStub, type MetricsNs } from "./metrics";

const readJson = async <T,>(bucket: AdminBucket, key: string): Promise<T | null> => {
  const o = await bucket.get(key);
  if (!o) return null;
  try { return JSON.parse(new TextDecoder().decode(await o.arrayBuffer())) as T; } catch { return null; }
};

async function listAll(bucket: AdminBucket, prefix: string, maxPages = 20) {
  const out: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const r = await bucket.list({ prefix, cursor, limit: 1000 });
    out.push(...r.objects.map((o) => ({ key: o.key, size: o.size ?? 0 })));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor && ++pages < maxPages);
  return { objects: out, truncated: !!cursor };
}

export interface ApiRow { day: string; source: string; key: string; n: number; err: number }

/** 최근 days일의 공공데이터포털 호출: 출처(worker | pages-build | awards-…)·서비스/오퍼레이션별 */
export async function apiUsage(bucket: AdminBucket, metrics: MetricsNs | undefined, days: number) {
  const rows: ApiRow[] = [];
  const push = (day: string, source: string, key: string, n: number, err: number) => {
    const r = rows.find((x) => x.day === day && x.source === source && x.key === key);
    if (r) { r.n += n; r.err += err; } else rows.push({ day, source, key, n, err });
  };
  let ai: { day: string; kind: string; key: string; n: number }[] = [];
  if (metrics) {
    const j = (await (await metricsStub(metrics).fetch(`https://metrics/hits?days=${days}&kinds=api,apierr,ai,ai_in,ai_out,ai_cache_w,ai_cache_r,aierr`)).json()) as { rows: { day: string; kind: string; key: string; n: number }[] };
    for (const h of j.rows) {
      if (h.kind === "api") push(h.day, "worker", h.key, h.n, 0);
      else if (h.kind === "apierr") push(h.day, "worker", h.key.replace(/:[^:]+$/, ""), 0, h.n);
    }
    ai = j.rows.filter((h) => h.kind.startsWith("ai"));
  }
  const runs: { day: string; source: string; run: string; at: string; total: number }[] = [];
  const dayList = Array.from({ length: days }, (_, i) => kstDay(Date.now() - i * 86400_000));
  await Promise.all(dayList.map(async (day) => {
    const { objects } = await listAll(bucket, `ops/api-calls/${day}/`, 2);
    await Promise.all(objects.map(async (o) => {
      const r = await readJson<{ source: string; run: string; at: string; calls: Record<string, number>; errors: Record<string, number> }>(bucket, o.key);
      if (!r) return;
      let total = 0;
      for (const [k, n] of Object.entries(r.calls ?? {})) { push(day, r.source, k, n, 0); total += n; }
      for (const [k, n] of Object.entries(r.errors ?? {})) push(day, r.source, k.replace(/:[^:]+$/, ""), 0, n);
      runs.push({ day, source: r.source, run: r.run, at: r.at, total });
    }));
  }));
  runs.sort((a, b) => b.at.localeCompare(a.at));
  return { rows, ai, runs: runs.slice(0, 100) };
}

let storageCache: { at: number; v: unknown } | null = null;

/** R2 저장 용량 (1시간 캐시) */
export async function storage(bucket: AdminBucket, fresh: boolean) {
  if (!fresh && storageCache && Date.now() - storageCache.at < 3600_000) return storageCache.v;
  const measured = await readJson<{ bytes: number; approved?: number; at: string }>(bucket, "ops/r2-usage.json");
  const manifest = await readJson<{ files?: Record<string, { bytes: number }> }>(bucket, "manifest.json");
  const rank = await readJson<{ weeks?: Record<string, { bytes: number }> }>(bucket, "rank-state.json");
  const groups: Record<string, { files: number; bytes: number }> = {};
  const addG = (g: string, bytes: number) => { const x = (groups[g] ??= { files: 0, bytes: 0 }); x.files++; x.bytes += bytes; };
  for (const [k, f] of Object.entries(manifest?.files ?? {})) addG(`낙찰 저장소 ${k.split("/")[0]}/`, f.bytes);
  for (const w of Object.values(rank?.weeks ?? {})) addG("개찰 순위 rank/", w.bytes);
  const own: Record<string, string> = {
    "members/": "회원 가입 정보", "trial/": "무료 체험 사용", "billing/": "결제 기록", "config/": "사이트 설정",
    "ai-sheets/": "배점표 판독 결과", "ai-relate/": "같은 사업 판정 결과", "ops/": "운영 기록", "apt/": "공동주택 공고·낙찰",
  };
  const folders: { prefix: string; label: string; files: number; bytes: number; truncated: boolean }[] = [];
  for (const [prefix, label] of Object.entries(own)) {
    const { objects, truncated } = await listAll(bucket, prefix, prefix === "apt/" || prefix === "ai-sheets/" ? 10 : 5);
    folders.push({ prefix, label, files: objects.length, bytes: objects.reduce((s, o) => s + o.size, 0), truncated });
  }
  const v = {
    measured,
    approved: measured?.approved ?? 5e9,
    groups: Object.entries(groups).map(([name, g]) => ({ name, ...g })).sort((a, b) => b.bytes - a.bytes),
    folders,
    at: new Date().toISOString(),
  };
  storageCache = { at: Date.now(), v };
  return v;
}

let actionsCache: { at: number; v: unknown } | null = null;

/** GitHub Actions 최근 실행 50개 (3분 캐시) */
export async function actions(repo: string, token: string | undefined) {
  if (actionsCache && Date.now() - actionsCache.at < 180_000) return actionsCache.v;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=50`, {
    headers: { "User-Agent": "bidmate-admin", Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!r.ok) {
    const left = r.headers.get("x-ratelimit-remaining");
    throw new Error(r.status === 403 && left === "0" ? "GitHub 공개 API 호출 한도(시간당 60회)에 걸렸습니다. Worker 비밀값 GITHUB_TOKEN 을 넣으면 풀립니다." : `GitHub 응답 ${r.status}`);
  }
  const j = (await r.json()) as { workflow_runs: Record<string, unknown>[] };
  const v = {
    repo,
    authed: !!token,
    runs: j.workflow_runs.map((w) => ({
      id: w.id, name: w.name, title: w.display_title, event: w.event, status: w.status, conclusion: w.conclusion,
      branch: w.head_branch, url: w.html_url, created: w.created_at, updated: w.updated_at, started: w.run_started_at,
    })),
    at: new Date().toISOString(),
  };
  actionsCache = { at: Date.now(), v };
  return v;
}
