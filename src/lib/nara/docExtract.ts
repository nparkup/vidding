import "server-only";
import type { Bid, BidAttachment } from "../types";
import { extractQuantBlock, extractSheet, templateSheet, type EvalItem, type EvalSheet } from "../evalscore";
import { readNoticeCriteria, type NoticeCriteria } from "../noticeCriteria";
import type { AiInput } from "./aiSheet";
import { download, dropRepeatedEntries, rankFiles, textOf } from "./attachText";

/**
 * 배포(빌드) 때 공고 첨부파일을 내려받아 평가표를 미리 추출한다.
 * 브라우저는 나라장터 파일을 직접 열 수 없어(CORS), 공고를 고르면 여기서 만든 평가표를 바로 쓴다.
 * - 읽는 형식·순서는 attachText.ts. 평가 구조가 있는 계약방법(적격심사·협상)만, 첨부를 모두 읽는다(같은 파일명은 하나만).
 *   구형 HWP는 hwpText.ts (2026-11-16 실제 공고서 50건 시험: 모두 본문 읽힘, 같은 공고 PDF 대비 낱말 93%).
 * - 읽은 본문은 textCache(빌드 사이에 남는 캐시)에 두어, 다음 빌드는 새 첨부만 받는다.
 * - 전체 시간 한도를 넘으면 남은 공고는 다음 빌드로 미루고, 화면에서 공고를 고르면 중계 서버가 그 자리에서 첨부를 읽는다.
 */

export interface ExtractedSheet {
  /** 첨부에서 읽은 배점표 (없을 수 있다. 쓸지는 화면에서 criteria.ts adoptable 로 가린다) */
  sheet?: EvalSheet;
  file?: string;
  /** 공고서 문장에서 읽은 이 공고의 기준 (적용 기준·통과점수·낙찰하한율·기준비율·실적 인정 범위 등) */
  notice?: NoticeCriteria;
  /** 협상 제안요청서의 정량평가 표 */
  quant?: { items: EvalItem[]; total: number; quote: string };
  /** 규칙 파서가 배점표를 못 읽은 공고의 AI 판독 입력 (/ai-input/{공고}.json 으로 나간다) */
  ai?: AiInput;
  /** 빌드가 첨부를 모두 받아 읽었으면 읽은 파일 이름 (없으면 일부만 읽었거나 아직 못 읽은 공고) */
  read?: string[];
}

export { download, hwpxText, rankFiles, textOf } from "./attachText";

/** 빌드 사이에 남는 첨부 본문 캐시 (scripts/fetch-bids.ts 가 .cache/attach-text 에 둔다). 키는 첨부 주소 */
export interface TextCache {
  get(url: string): string | undefined;
  set(url: string, text: string): void;
}

/** 본문 캐시 키: 첨부 주소. 압축은 풀기 방식이 바뀌면 다시 읽도록 판 번호를 붙인다 (다른 형식의 캐시는 그대로 둔다) */
export const ZIP_TEXT_VERSION = 2;
export const textCacheKey = (f: BidAttachment) => (/\.zip$/i.test(f.name) ? `${f.url}#zip${ZIP_TEXT_VERSION}` : f.url);

export async function extractSheetsForBids(
  bids: Bid[],
  attachments: Record<string, BidAttachment[]>,
  opts: {
    budgetMs?: number; concurrency?: number;
    textCache?: TextCache;
    /** 공고마다 읽은 본문(파일 이름 머리글 포함)과 규칙 파서 결과를 넘긴다 (AI 판독 대상 고르기, aiSheet.ts) */
    collect?: (bid: Bid, text: string, ruleSheet: EvalSheet | undefined) => void;
  } = {},
): Promise<{ sheets: Record<string, ExtractedSheet>; stats: { bids: number; done: number; files: number; cached: number; downloadFailed: number; found: number; notice: number; timedOut: boolean } }> {
  const budget = Date.now() + (opts.budgetMs ?? 8 * 60_000);
  const targets = bids.filter((b) => (b.contractMethod === "적격심사" || b.contractMethod === "협상에 의한 계약") && attachments[b.id]?.length);
  // 캐시에 본문이 다 있는 공고를 먼저 (내려받지 않아 금방 끝난다), 나머지는 새 공고부터
  const uncached = (b: Bid) => rankFiles(attachments[b.id]).filter((f) => opts.textCache?.get(textCacheKey(f)) === undefined).length;
  targets.sort((a, b) => Number(uncached(a) > 0) - Number(uncached(b) > 0) || b.postedAt.localeCompare(a.postedAt));
  const sheets: Record<string, ExtractedSheet> = {};
  const stats = { bids: targets.length, done: 0, files: 0, cached: 0, downloadFailed: 0, found: 0, notice: 0, timedOut: false };
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      const bid = targets[next];
      const files = rankFiles(attachments[bid.id]);
      if (Date.now() > budget && files.some((f) => opts.textCache?.get(textCacheKey(f)) === undefined)) { stats.timedOut = true; return; }
      next++;
      const texts: string[] = [];
      const named: string[] = [];
      const read: string[] = [];
      let failed = 0;
      let best: ExtractedSheet | undefined;
      // 같은 파일명은 하나만: 압축 안 문서가 다른 첨부(또는 앞서 읽은 압축 안 문서)와 이름이 같으면 뺀다
      const seen = new Set(files.map((f) => f.name.trim()));
      for (const f of files) {
        stats.files++;
        let t = opts.textCache?.get(textCacheKey(f));
        if (t !== undefined) stats.cached++;
        else {
          try {
            const buf = await download(f.url, 20_000);
            if (!buf) { stats.downloadFailed++; failed++; continue; }
            t = await textOf(f, buf);
            opts.textCache?.set(textCacheKey(f), t);
          } catch {
            stats.downloadFailed++;
            failed++;
            continue;
          }
        }
        read.push(f.name);
        t = dropRepeatedEntries(t, seen);
        if (!t.trim()) continue;
        texts.push(t);
        named.push(`=== 파일: ${f.name} ===\n${t}`);
        const sheet = extractSheet(texts.join("\n"), templateSheet(bid));
        if (sheet && (!best?.sheet || rankConfidence(sheet) > rankConfidence(best.sheet))) best = { sheet, file: f.name };
      }
      if (!read.length) continue;
      stats.done++;
      const all = texts.join("\n");
      const notice = all ? readNoticeCriteria(all) : undefined;
      const quant = all && bid.contractMethod === "협상에 의한 계약" ? extractQuantBlock(all) : undefined;
      // 배점표는 합계가 100에서 크게 벗어나면 버린다 (쓸지 최종 판단은 화면에서 공고 기준 값과 함께 한다)
      const sum = best?.sheet ? best.sheet.items.reduce((a, i) => a + i.max, 0) : 0;
      const keep = best?.sheet && sum >= 90 && sum <= 110 ? best : undefined;
      if (all) opts.collect?.(bid, named.join("\n"), keep?.sheet);
      // 첨부를 하나라도 받지 못했으면 '다 읽음' 표시를 하지 않는다 (화면에서 고를 때 중계 서버가 다시 읽는다)
      sheets[bid.id] = { ...(keep ?? {}), notice, quant, read: failed ? undefined : read };
      if (keep) stats.found++;
      if (notice) stats.notice++;
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  return { sheets, stats };
}

const rankConfidence = (s: EvalSheet): number => ({ 높음: 3, 보통: 2, 낮음: 1 })[s.confidence] * 100 + s.items.length;
