/**
 * 배포 빌드: 규칙 파서가 쓸 수 있는 배점표를 못 읽은 공고의 평가 관련 본문을 AI 판독 입력으로 만들어 둔다.
 * AI는 여기서 부르지 않는다. 평가점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?aisheet=)가 이 입력으로 부른다.
 * 입력은 /ai-input/{공고}.json (src/app/ai-input) 으로 나간다.
 */
import { createHash } from "crypto";
import type { Bid } from "../src/lib/types";
import { adoptable, coarseSheet, type EvalBasis } from "../src/lib/criteria";
import type { EvalSheet } from "../src/lib/evalscore";
import { AI_SHEET_VERSION, excerpt, hasTableSignal, type AiInput } from "../src/lib/nara/aiSheet";

const hashOf = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/** docExtract 의 collect 콜백: 규칙 파서 결과가 화면에서 쓰이지 못할 공고만 입력을 만든다 */
export function makeAiInputs(quals: Record<string, { basis?: EvalBasis } | undefined>) {
  const inputs: Record<string, AiInput> = {};
  const collect = (bid: Bid, text: string, rule: EvalSheet | undefined) => {
    if (!text || !hasTableSignal(text)) return;
    const basis = quals[bid.id]?.basis;
    // 큰 묶음(정량·정성·가격)만 적힌 요약표면 상세 배점표를 찾도록 판독 입력을 만든다 (판독이 못 찾으면 화면은 요약표를 쓴다)
    if (rule && adoptable(rule, basis) && !coarseSheet(rule)) return;
    const body = excerpt(text);
    inputs[bid.id] = {
      v: AI_SHEET_VERSION,
      hash: hashOf(`${AI_SHEET_VERSION}\n${body}`),
      text: body,
      bid: { id: bid.id, title: bid.title, contractMethod: bid.contractMethod, agency: bid.agency, baseAmount: bid.baseAmount || undefined, estimated: basis?.presmpt || undefined },
      techRatio: basis?.techRatio,
      priceRatio: basis?.priceRatio,
    };
  };
  return { inputs, collect };
}
