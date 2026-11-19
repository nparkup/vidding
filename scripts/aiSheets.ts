/**
 * 배포 빌드에서 규칙 파서가 배점표를 못 읽은 공고만 골라 Claude로 배점표를 읽는다 (src/lib/nara/aiSheet.ts).
 * - ANTHROPIC_API_KEY (GitHub Actions secret) 가 없으면 아무것도 하지 않는다.
 * - 결과는 공고별로 본문 해시와 함께 캐시한다: 낙찰 저장소(R2)가 있으면 R2 한 파일, 없으면 Actions 캐시 폴더.
 *   같은 본문이면 다시 보내지 않고, 지금 공고 목록에 없는 공고는 캐시에서 지운다.
 * - 한 번 실행에 보내는 공고 수(AI_SHEET_MAX)와 시간(AI_SHEET_BUDGET_MIN)에 한도를 둔다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { gunzipSync, gzipSync } from "zlib";
import type { Bid } from "../src/lib/types";
import type { EvalBasis } from "../src/lib/criteria";
import { adoptable } from "../src/lib/criteria";
import type { EvalSheet } from "../src/lib/evalscore";
import { AI_SHEET_VERSION, DEFAULT_AI_MODEL, excerpt, hashOf, hasTableSignal, readSheetWithAI, type AiSheetResult } from "../src/lib/nara/aiSheet";
import { r2Get, r2Put } from "./awards/r2";

const R2_KEY = `ai-sheets/v${AI_SHEET_VERSION}.json.gz`;
const LOCAL = `${process.env.AWARD_CACHE_DIR ?? ".cache/award"}/ai-sheets-v${AI_SHEET_VERSION}.json.gz`;
/** 100만 토큰당 달러 (입력, 출력). 로그의 비용 추정용 */
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

interface Candidate { bid: Bid; text: string }

export function aiSheetsEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** docExtract 의 collect 콜백: 규칙 파서 결과가 화면에서 쓰이지 못할 공고만 후보로 모은다 */
export function makeCollector(quals: Record<string, { basis?: EvalBasis } | undefined>) {
  const candidates: Candidate[] = [];
  const collect = (bid: Bid, text: string, rule: EvalSheet | undefined) => {
    if (!text || !hasTableSignal(text)) return;
    if (rule && adoptable(rule, quals[bid.id]?.basis)) return;
    candidates.push({ bid, text: excerpt(text) });
  };
  return { candidates, collect };
}

const useR2 = () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) || Boolean(process.env.R2_LOCAL_DIR);

async function loadCache(): Promise<Record<string, AiSheetResult>> {
  try {
    const buf = useR2() ? await r2Get(R2_KEY) : existsSync(LOCAL) ? readFileSync(LOCAL) : null;
    return buf ? JSON.parse(gunzipSync(buf).toString("utf8")) : {};
  } catch (e) {
    console.warn("AI 판독 캐시 읽기 실패 (새로 시작):", e instanceof Error ? e.message : e);
    return {};
  }
}

async function saveCache(cache: Record<string, AiSheetResult>): Promise<void> {
  const buf = gzipSync(Buffer.from(JSON.stringify(cache)));
  if (useR2()) await r2Put(R2_KEY, buf, "application/gzip");
  else { mkdirSync(dirname(LOCAL), { recursive: true }); writeFileSync(LOCAL, buf); }
}

export async function runAiSheets(
  candidates: Candidate[],
  quals: Record<string, { basis?: EvalBasis } | undefined>,
  allIds: Set<string>,
): Promise<{ sheets: Record<string, EvalSheet>; log: string }> {
  const model = process.env.AI_SHEET_MODEL || DEFAULT_AI_MODEL;
  const max = Number(process.env.AI_SHEET_MAX ?? 150);
  const budget = Date.now() + Number(process.env.AI_SHEET_BUDGET_MIN ?? 15) * 60_000;
  const cache = await loadCache();
  // 지금 공고 목록에 없는 공고는 지운다 (캐시가 끝없이 커지지 않게)
  for (const id of Object.keys(cache)) if (!allIds.has(id)) delete cache[id];

  const sheets: Record<string, EvalSheet> = {};
  const todo: (Candidate & { hash: string })[] = [];
  let hit = 0;
  for (const c of candidates) {
    const hash = hashOf(`${model}\n${c.text}`);
    const prev = cache[c.bid.id];
    if (prev && prev.hash === hash && prev.status !== "error") {
      hit++;
      if (prev.status === "ok" && prev.sheet) sheets[c.bid.id] = prev.sheet;
      continue;
    }
    todo.push({ ...c, hash });
  }
  // 협상계약(공고마다 표가 다르다) 먼저, 그다음 마감이 가까운 순
  todo.sort((a, b) => Number(b.bid.contractMethod === "협상에 의한 계약") - Number(a.bid.contractMethod === "협상에 의한 계약") || a.bid.closeAt.localeCompare(b.bid.closeAt));
  const queue = todo.slice(0, max);

  const client = new Anthropic({ maxRetries: 3, timeout: 5 * 60_000 });
  const count = { ok: 0, none: 0, rejected: 0, error: 0 };
  const tokens = { input: 0, output: 0 };
  const rejects: string[] = [];
  let next = 0;
  let stopped = "";
  async function worker() {
    while (next < queue.length && !stopped) {
      if (Date.now() > budget) { stopped = "시간 한도"; return; }
      const c = queue[next++];
      const basis = quals[c.bid.id]?.basis;
      let r: Omit<AiSheetResult, "hash" | "v" | "at">;
      try {
        r = await readSheetWithAI(client, c.bid, c.text, { model, techRatio: basis?.techRatio, priceRatio: basis?.priceRatio });
      } catch (e) {
        // 키·권한 오류는 다시 해도 같으므로 멈춘다
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { stopped = `API 키 오류 (${e.status})`; return; }
        if (e instanceof Anthropic.BadRequestError && /credit|balance|billing/i.test(e.message)) { stopped = "API 크레딧 부족"; return; }
        r = { model, status: "error", reason: e instanceof Error ? e.message.slice(0, 200) : String(e) };
      }
      count[r.status]++;
      if (r.usage) { tokens.input += r.usage.input; tokens.output += r.usage.output; }
      // 화면의 최종 판단(adoptable)까지 통과해야 쓴다. 공고의 기술·가격 비율과 다르면 버린다
      if (r.status === "ok" && r.sheet && !adoptable(r.sheet, basis)) {
        count.ok--; count.rejected++;
        r = { ...r, status: "rejected", sheet: undefined, reason: "나라장터 기술·가격 배점과 다름" };
      }
      if (r.status === "rejected" && rejects.length < 5) rejects.push(`${c.bid.id} ${r.reason}`);
      if (r.status === "ok" && r.sheet) sheets[c.bid.id] = r.sheet;
      cache[c.bid.id] = { ...r, v: AI_SHEET_VERSION, hash: c.hash, at: new Date().toISOString() };
    }
  }
  if (queue.length) await Promise.all(Array.from({ length: Number(process.env.AI_SHEET_CONCURRENCY ?? 6) }, worker));
  try { await saveCache(cache); } catch (e) { console.warn("AI 판독 캐시 저장 실패:", e instanceof Error ? e.message : e); }

  const [pin, pout] = PRICE[model] ?? [0, 0];
  const usd = (tokens.input * pin + tokens.output * pout) / 1e6;
  const done = count.ok + count.none + count.rejected + count.error;
  const log = [
    `AI 판독(${model}): 후보 ${candidates.length}건, 캐시 ${hit}건, 이번 호출 ${done}건 (배점표 ${count.ok}, 표 없음 ${count.none}, 검증 탈락 ${count.rejected}, 오류 ${count.error})`,
    `남은 후보 ${Math.max(0, todo.length - done)}건${stopped ? `, 중단: ${stopped}` : ""}`,
    `토큰 입력 ${tokens.input.toLocaleString()} / 출력 ${tokens.output.toLocaleString()}, 추정 비용 $${usd.toFixed(2)}${done ? ` (공고당 $${(usd / done).toFixed(3)})` : ""}`,
    ...(rejects.length ? [`검증 탈락 예: ${rejects.join(" | ")}`] : []),
  ].join("\n");
  return { sheets, log };
}
