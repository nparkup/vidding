import { tierSheet } from "../tierSheet";
import { createHash } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { Bid, BidAttachment } from "../types";
import { adoptable, coarseSheet, type EvalBasis } from "../criteria";
import { extractQuantBlock, extractSheet, templateSheet, type EvalItem } from "../evalscore";
import { readNoticeCriteria, type NoticeCriteria } from "../noticeCriteria";
import { AI_SHEET_VERSION, excerpt, hasTableSignal, readSheetWithAI, type AiSheetResult } from "./aiSheet";
import { docStem, download, dropRepeatedEntries, dropRepeatedPreSpec, preSpecText, rankFiles, textOf } from "./attachText";

/**
 * 빌드에서 첨부를 다 읽지 못한 공고: 입찰점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?aisheet=)가
 * 그 자리에서 첨부를 모두 받아 읽는다 (같은 파일명은 하나만). 규칙 파서로 쓸 수 있는 배점표가 나오면 그대로,
 * 아니면 배점표 신호가 있을 때만 Claude로 읽는다. 첨부 목록과 공고 정보는 사이트의 /attachments/{공고}.json 에서만 받는다.
 */

/** /attachments/{공고}.json 중 여기서 쓰는 부분 */
export interface LiveDocs {
  files: BidAttachment[];
  read?: string[];
  ai?: string;
  qual?: { basis?: EvalBasis };
  bid?: Pick<Bid, "id" | "title" | "contractMethod" | "agency" | "bizType" | "category"> & { baseAmount?: number; lowerLimitRate?: number };
}

export interface LiveResult extends AiSheetResult {
  /** 읽은 파일 이름 */
  read: string[];
  /** 받지 못했거나 읽지 못한 파일 이름 (사유) */
  failed: string[];
  /** 배점표를 어디서 읽었는지: rule 규칙 파서, ai Claude */
  by?: "rule" | "ai";
  /** 공고서 문장에서 읽은 이 공고의 기준 (통과점수·하한율·기준비율·실적 인정 범위 등). 빌드가 첨부를 다 읽지 못한 공고는 여기서만 나온다 */
  notice?: NoticeCriteria;
  /** 협상 제안요청서의 정량평가 표 */
  quant?: { items: EvalItem[]; total: number; quote: string };
}

/** 즉석 판독 결과 모양을 바꾸면 올린다 (2: 공고서 문장 기준·정량평가 표를 함께 돌려줌) */
export const LIVE_VERSION = 3;

/** 첨부 주소만 보고 만든 캐시 키 (첨부가 바뀌면 새로 읽는다) */
export const liveKey = (docs: LiveDocs) => createHash("sha1").update(`${AI_SHEET_VERSION}\nlive${LIVE_VERSION}\n${rankFiles(docs.files).map((f) => `${f.name}\t${f.url}`).join("\n")}`).digest("hex").slice(0, 16);

export async function readSheetLive(
  client: Anthropic | undefined,
  docs: LiveDocs,
  opts: { id: string; model?: string; allowUrl: (url: string) => boolean; timeoutMs?: number },
): Promise<LiveResult> {
  const base = { v: AI_SHEET_VERSION, hash: liveKey(docs), at: new Date().toISOString(), model: opts.model ?? "" };
  const basis = docs.qual?.basis;
  // 공고 정보가 없는 예전 사이트 파일이면 참가자격 자료(낙찰방법·추정가격)로 채운다
  const bid = docs.bid ?? (basis?.method ? {
    id: opts.id, title: "", agency: basis.agency ?? "", bizType: basis.srvceDiv ? "용역" : undefined, category: "기타 용역",
    contractMethod: /^협상/.test(basis.method) ? "협상에 의한 계약" : "적격심사", baseAmount: basis.presmpt, lowerLimitRate: basis.lwlt,
  } as unknown as NonNullable<LiveDocs["bid"]> : undefined);
  const files = rankFiles(docs.files).filter((f) => opts.allowUrl(f.url));
  if (!files.length) return { ...base, status: "none", reason: "읽을 첨부 없음", read: [], failed: [] };
  if (!bid) return { ...base, status: "error", reason: "공고 정보 없음", read: [], failed: [] };
  // 동시에 3개씩 받는다
  const got: ({ name: string; text: string } | null)[] = new Array(files.length).fill(null);
  const why: string[] = new Array(files.length).fill("받지 못함");
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, async () => {
    while (next < files.length) {
      const i = next++;
      try {
        if (files[i].kind === "사전규격") {
          // 사전규격 규격서: 없는 순번이면 빈 본문 (실패로 세지 않는다)
          got[i] = { name: files[i].name, text: (await preSpecText(files[i].url, opts.timeoutMs ?? 25_000)) ?? "" };
          continue;
        }
        const buf = await download(files[i].url, opts.timeoutMs ?? 25_000);
        if (buf) got[i] = { name: files[i].name, text: await textOf(files[i], buf) };
      } catch (e) { why[i] = (e as Error).message.slice(0, 120); }
    }
  }));
  // 같은 파일명은 하나만: 압축 안 문서가 다른 첨부(또는 앞의 압축 안 문서)와 이름이 같으면 뺀다.
  // 사전규격 규격서는 본공고 첨부와 같은 문서(앞 번호·(사전공개) 꼬리만 다른 이름)면 뺀다
  const own = files.filter((f) => f.kind !== "사전규격");
  const seen = new Set(own.map((f) => f.name.trim()));
  const stems = new Set(own.map((f) => docStem(f.name)));
  got.forEach((g, i) => {
    if (!g) return;
    if (files[i].kind !== "사전규격") { g.text = dropRepeatedEntries(g.text, seen); return; }
    const d = dropRepeatedPreSpec(g.text, stems);
    if (!d.name) { got[i] = null; why[i] = ""; return; }
    g.name = `${g.name} (${d.name})`;
    g.text = d.text;
  });
  const read = files.filter((_, i) => got[i]).map((f) => f.name);
  // 사전규격 규격서를 받지 못한 것은 실패로 세지 않는다 (본공고 첨부가 기준, 다음에 고를 때 다시 읽지 않아도 된다)
  const failed = files.flatMap((f, i) => (got[i] || f.kind === "사전규격" ? [] : [`${f.name} (${why[i]})`]));
  const docsRead = got.filter((g): g is { name: string; text: string } => !!g && !!g.text.trim());
  if (!docsRead.length) return { ...base, status: failed.length ? "error" : "none", reason: failed.length ? "첨부를 받지 못함" : "첨부에서 글을 읽지 못함", read, failed };
  const all = docsRead.map((d) => d.text).join("\n");
  const named = docsRead.map((d) => `=== 파일: ${d.name} ===\n${d.text}`).join("\n");
  // 배점표와 별개로 공고서 문장 기준과 협상 정량평가 표도 읽는다 (빌드 추출과 같게)
  const notice = readNoticeCriteria(all);
  const quant = bid.contractMethod === "협상에 의한 계약" ? extractQuantBlock(all) : undefined;
  const extra = { ...(notice ? { notice } : {}), ...(quant ? { quant } : {}) };
  const like = { contractMethod: bid.contractMethod, bizType: bid.bizType, baseAmount: bid.baseAmount ?? 0, category: bid.category, lowerLimitRate: bid.lowerLimitRate } as Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">;
  const template = templateSheet(like, basis);
  const rule0 = extractSheet(all, template);
  // 추정가격 구간마다 배점이 다른 표(지자체 세부기준 전문)는 공고의 구간 열을 쓴다
  const rule = tierSheet(named, basis?.presmpt, rule0 ?? template) ?? rule0;
  const ruleOk = rule && adoptable(rule, basis) ? rule : undefined;
  // 큰 묶음(정량·정성·가격)만 적힌 요약표면 상세 배점표를 한 번 더 찾고, 못 찾으면 요약표를 쓴다
  const fallback = ruleOk ? { ...base, ...extra, status: "ok" as const, sheet: ruleOk, read, failed, by: "rule" as const } : undefined;
  if (ruleOk && !coarseSheet(ruleOk)) return fallback!;
  if (!hasTableSignal(named)) return fallback ?? { ...base, ...extra, status: "none", reason: "첨부에 배점표가 없음", read, failed };
  if (!client) return fallback ?? { ...base, ...extra, status: "error", reason: "판독 꺼짐", read, failed };
  try {
    const r = await readSheetWithAI(client, { id: bid.id, title: bid.title, contractMethod: bid.contractMethod, agency: bid.agency, baseAmount: bid.baseAmount, estimated: basis?.presmpt }, excerpt(named), { model: opts.model, techRatio: basis?.techRatio, priceRatio: basis?.priceRatio });
    if (r.status !== "ok" && fallback) return { ...fallback, usage: r.usage };
    return { ...base, ...extra, ...r, read, failed, by: "ai" };
  } catch (e) {
    return fallback ?? { ...base, ...extra, status: "error", reason: (e as Error).message.slice(0, 200), read, failed };
  }
}
