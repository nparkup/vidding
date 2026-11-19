import Anthropic from "@anthropic-ai/sdk";
import type { AwardAnalysis } from "./analysis";

/**
 * 같은 사업 확인: 규칙(공고명 유사도·구분어·사업 종류·금액)으로 확실히 가르지 못한 '애매한 후보'(analysis.maybe, 최대 10건)만
 * Claude(Haiku)에 공고명·날짜·금액을 보여 지금 공고와 같은 사업(매년·매기 다시 발주하는 같은 계약)인지 묻는다.
 * - 빌드는 부르지 않는다. 평가점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?relate=)가 사이트의
 *   /award-analysis/{공고}.json 에서 후보를 읽어 한 번 부르고, 결과를 R2 ai-relate/v{버전}/{공고}-{후보 해시}.json 에 둔다.
 * - 입력은 공고명·기관·날짜·금액뿐이라 공고 하나에 입력 1~2천, 출력 수백 토큰 (약 0.3원).
 */

/** 프롬프트를 바꾸면 올린다 (캐시가 새로 만들어진다) */
export const RELATE_VERSION = 1;
export const DEFAULT_RELATE_MODEL = "claude-haiku-5-5";

export interface RelateResult {
  v: number;
  hash: string;
  model: string;
  at: string;
  status: "ok" | "none" | "error";
  /** 같은 사업으로 확인된 공고번호 */
  same: string[];
  reason?: string;
  usage?: { input: number; output: number };
}

export interface RelateTarget {
  title: string;
  agency: string;
  baseAmount?: number;
  postedAt?: string;
}

/** 후보 목록의 해시 (캐시 키). 후보가 바뀌면 다시 묻는다 */
export function relateHash(a: Pick<AwardAnalysis, "maybe">): string {
  const s = (a.maybe ?? []).map((m) => m.no).join(",");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const won = (n: number) => (n >= 1e8 ? `${(n / 1e8).toFixed(1)}억 원` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 원` : `${Math.round(n)}원`);

const SYSTEM = `당신은 한국 공공조달(나라장터) 낙찰 자료를 정리하는 분석가입니다.
한 수요기관의 '지금 공고'와 그 기관의 과거 낙찰 공고 후보들이 주어집니다. 각 후보가 지금 공고와 같은 사업인지 판단하세요.

같은 사업이란: 같은 기관이 같은 대상·같은 업무를 해마다(또는 계약 기간마다, 매월·매기) 다시 발주하는 계약입니다.
- 같은 사업: 연도·회차·월만 다른 공고, 표현만 조금 바뀐 공고(예: "성과평가 연구"와 "성과 조사·평가 연구"), 같은 시설·시스템·대상의 다음 계약.
- 다른 사업: 대상이 다른 공고(다른 노선·교량·지구·권역·학년·학교·시스템), 업무 종류가 다른 공고(유지관리와 구축·전환·감리·설계), 일부만 겹치는 공고, 규모가 크게 다른 공고.
- 애매하면 다른 사업으로 판단하세요. 잘못 넣는 것이 빠뜨리는 것보다 해롭습니다.
각 후보마다 판단과 열 단어 안쪽의 이유를 답하세요.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "same", "why"],
        properties: {
          no: { type: "string", description: "후보 공고번호 그대로" },
          same: { type: "boolean", description: "지금 공고와 같은 사업이면 true" },
          why: { type: "string", description: "짧은 이유" },
        },
      },
    },
  },
} as const;

export async function relateWithAI(client: Anthropic, target: RelateTarget, a: Pick<AwardAnalysis, "maybe">, model?: string): Promise<RelateResult> {
  const m = model || DEFAULT_RELATE_MODEL;
  const base = { v: RELATE_VERSION, hash: relateHash(a), model: m, at: new Date().toISOString() };
  const cands = a.maybe ?? [];
  if (!cands.length) return { ...base, status: "none", same: [] };
  const lines = cands.map((c) => `- ${c.no} | ${c.date} | ${c.title} | ${won(c.base || c.amount)} | 참가 ${c.bidders || "?"}곳`).join("\n");
  const user = [
    `지금 공고: ${target.title}`,
    `수요기관: ${target.agency}`,
    target.baseAmount ? `금액: ${won(target.baseAmount)}` : "",
    target.postedAt ? `공고일: ${target.postedAt.slice(0, 10)}` : "",
    "",
    "과거 낙찰 후보 (공고번호 | 낙찰일 | 공고명 | 금액 | 참가업체):",
    lines,
  ].filter((x) => x !== "").join("\n");
  const msg = await client.messages.create({
    model: m,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return { ...base, status: "error", same: [], reason: msg.stop_reason, usage };
  const raw = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let out: { items: { no: string; same: boolean; why: string }[] };
  try { out = JSON.parse(raw); } catch { return { ...base, status: "error", same: [], reason: "JSON 해석 실패", usage }; }
  // 후보에 있던 번호만 받는다
  const known = new Set(cands.map((c) => c.no));
  const same = out.items.filter((i) => i.same && known.has(i.no)).map((i) => i.no);
  return { ...base, status: "ok", same, reason: out.items.map((i) => `${i.no} ${i.same ? "같음" : "다름"}: ${i.why}`).join(" / ").slice(0, 600), usage };
}
