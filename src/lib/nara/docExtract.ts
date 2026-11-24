import "server-only";
import type { Bid, BidAttachment } from "../types";
import { extractQuantBlock, extractSheet, templateSheet, type EvalItem, type EvalSheet } from "../evalscore";
import { tierSheet } from "../tierSheet";
import { readNoticeCriteria, type NoticeCriteria } from "../noticeCriteria";
import type { AiInput } from "./aiSheet";
import { docStem, download, dropRepeatedEntries, dropRepeatedPreSpec, preSpecText, rankFiles, textOf } from "./attachText";

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
    /** 공고의 추정가격 (금액 구간마다 배점이 다른 표의 열 고르기, tierSheet.ts) */
    estimatedOf?: (bid: Bid) => number | undefined;
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
      const seen = new Set(files.filter((f) => f.kind !== "사전규격").map((f) => f.name.trim()));
      // 사전규격 규격서는 본공고 첨부와 같은 문서(앞 번호·(사전공개) 꼬리만 다른 이름)면 읽지 않는다
      const stems = new Set(files.filter((f) => f.kind !== "사전규격").map((f) => docStem(f.name)));
      for (const f of files) {
        stats.files++;
        const pre = f.kind === "사전규격";
        let t = opts.textCache?.get(textCacheKey(f));
        if (t !== undefined) stats.cached++;
        else {
          try {
            if (pre) {
              // 없는 순번·받지 못한 사전규격은 공고를 다 읽었는지와 무관하다 (본공고 첨부가 기준)
              t = (await preSpecText(f.url, 20_000)) ?? "";
            } else {
              const buf = await download(f.url, 20_000);
              if (!buf) { stats.downloadFailed++; failed++; continue; }
              t = await textOf(f, buf);
            }
            opts.textCache?.set(textCacheKey(f), t);
          } catch {
            stats.downloadFailed++;
            if (!pre) failed++;
            continue;
          }
        }
        let label = f.name;
        if (pre) {
          const d = dropRepeatedPreSpec(t, stems);
          if (!d.name) continue;
          read.push(f.name);
          t = d.text;
          label = `${f.name} (${d.name})`;
        } else {
          read.push(f.name);
          t = dropRepeatedEntries(t, seen);
        }
        if (!t.trim()) continue;
        texts.push(t);
        named.push(`=== 파일: ${label} ===\n${t}`);
        const sheet = extractSheet(texts.join("\n"), templateSheet(bid));
        if (sheet && (!best?.sheet || betterSheet(sheet, best.sheet))) best = { sheet, file: f.name };
      }
      if (!read.length) continue;
      stats.done++;
      const all = texts.join("\n");
      const notice = all ? readNoticeCriteria(all) : undefined;
      const quant = all && bid.contractMethod === "협상에 의한 계약" ? extractQuantBlock(all) : undefined;
      // 추정가격 구간마다 배점이 다른 표(지자체 세부기준 전문)는 공고의 구간 열을 쓴다
      const tier = all ? tierSheet(all, opts.estimatedOf?.(bid), best?.sheet ?? templateSheet(bid)) : undefined;
      if (tier) best = { sheet: tier, file: "금액 구간 배점표" };
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

/** 이름에 표 칸 조각이 섞인 정도 ("평 • 경영상태"처럼 세로 글자·글머리표가 낀 이름) */
const junk = (s: EvalSheet) => s.items.filter((i) => /•|^[가-힣]\s|\s[가-힣]$/.test(i.label)).length;

/**
 * 새로 읽은 표가 더 나은지: 신뢰도·항목 수가 높은 표. 같은 문서가 PDF·HWP로 함께 와서 배점이 똑같으면
 * 항목 이름이 깨끗한 쪽(표의 한 행이 한 줄로 나오는 HWP가 대개 깨끗하다)을 쓴다.
 */
function betterSheet(a: EvalSheet, b: EvalSheet): boolean {
  const ra = rankConfidence(a), rb = rankConfidence(b);
  if (ra !== rb) return ra > rb;
  const maxes = (s: EvalSheet) => s.items.map((i) => i.max).join(",");
  return maxes(a) === maxes(b) && junk(a) < junk(b);
}
