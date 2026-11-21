import { createHash } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { Bid, BidAttachment } from "../types";
import { adoptable, type EvalBasis } from "../criteria";
import { extractSheet, templateSheet } from "../evalscore";
import { AI_SHEET_VERSION, excerpt, hasTableSignal, readSheetWithAI, type AiSheetResult } from "./aiSheet";
import { download, dropRepeatedEntries, rankFiles, textOf } from "./attachText";

/**
 * 빌드에서 첨부를 다 읽지 못한 공고: 평가점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?aisheet=)가
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
}

/** 첨부 주소만 보고 만든 캐시 키 (첨부가 바뀌면 새로 읽는다) */
export const liveKey = (docs: LiveDocs) => createHash("sha1").update(`${AI_SHEET_VERSION}\n${rankFiles(docs.files).map((f) => `${f.name}\t${f.url}`).join("\n")}`).digest("hex").slice(0, 16);

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
        const buf = await download(files[i].url, opts.timeoutMs ?? 25_000);
        if (buf) got[i] = { name: files[i].name, text: await textOf(files[i], buf) };
      } catch (e) { why[i] = (e as Error).message.slice(0, 120); }
    }
  }));
  const read = files.filter((_, i) => got[i]).map((f) => f.name);
  const failed = files.flatMap((f, i) => (got[i] ? [] : [`${f.name} (${why[i]})`]));
  // 같은 파일명은 하나만: 압축 안 문서가 다른 첨부(또는 앞의 압축 안 문서)와 이름이 같으면 뺀다
  const seen = new Set(files.map((f) => f.name.trim()));
  for (const g of got) if (g) g.text = dropRepeatedEntries(g.text, seen);
  const docsRead = got.filter((g): g is { name: string; text: string } => !!g && !!g.text.trim());
  if (!docsRead.length) return { ...base, status: failed.length ? "error" : "none", reason: failed.length ? "첨부를 받지 못함" : "첨부에서 글을 읽지 못함", read, failed };
  const all = docsRead.map((d) => d.text).join("\n");
  const named = docsRead.map((d) => `=== 파일: ${d.name} ===\n${d.text}`).join("\n");
  const like = { contractMethod: bid.contractMethod, bizType: bid.bizType, baseAmount: bid.baseAmount ?? 0, category: bid.category, lowerLimitRate: bid.lowerLimitRate } as Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">;
  const rule = extractSheet(all, templateSheet(like, basis));
  if (rule && adoptable(rule, basis)) return { ...base, status: "ok", sheet: rule, read, failed, by: "rule" };
  if (!hasTableSignal(named)) return { ...base, status: "none", reason: "첨부에 배점표가 없음", read, failed };
  if (!client) return { ...base, status: "error", reason: "판독 꺼짐", read, failed };
  try {
    const r = await readSheetWithAI(client, { id: bid.id, title: bid.title, contractMethod: bid.contractMethod, agency: bid.agency, baseAmount: bid.baseAmount }, excerpt(named), { model: opts.model, techRatio: basis?.techRatio, priceRatio: basis?.priceRatio });
    return { ...base, ...r, read, failed, by: "ai" };
  } catch (e) {
    return { ...base, status: "error", reason: (e as Error).message.slice(0, 200), read, failed };
  }
}
