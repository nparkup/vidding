import Anthropic from "@anthropic-ai/sdk";
import type { AwardAnalysis } from "./analysis";

/**
 * 같은 사업 확인: 규칙(공고명 유사도·구분어·사업 종류·금액)으로 확실히 가르지 못한 '애매한 후보'(analysis.maybe, 최대 10건)만
 * Claude(Haiku)에 공고명·날짜·금액을 보여 지금 공고와 같은 사업(매년·매기 다시 발주하는 같은 계약)인지 묻는다.
 * - 빌드는 부르지 않는다. 평가점수 예측에서 공고를 고르면 중계 서버(worker/corp-lookup ?relate=)가 사이트의
 *   /award-analysis/{공고}.json 에서 후보를 읽어 한 번 부르고, 결과를 R2 ai-relate/v{버전}/{공고}-{후보 해시}.json 에 둔다.
 * - 입력은 공고명·기관·날짜·금액뿐이라 공고 하나에 입력 1~2천, 출력 수백 토큰 (약 0.5원).
 * - 핵심어로 찾은 다른 기관 낙찰(analysis.related.rows, 최대 30건)도 같은 종류의 일인지 함께 묻는다 (약 0.9원).
 *   되짚어 보기 150건: 참가 예상 8곳에 실제 낙찰자가 든 공고 39→44건, 실제 낙찰자·개찰 상위 업체 95→107곳.
 */

/** 프롬프트를 바꾸면 올린다 (캐시가 새로 만들어진다) */
export const RELATE_VERSION = 4;
export const DEFAULT_RELATE_MODEL = "claude-haiku-5-5";

export interface RelateResult {
  v: number;
  hash: string;
  model: string;
  at: string;
  status: "ok" | "none" | "error";
  /** 같은 사업으로 확인된 공고번호 */
  same: string[];
  /** 핵심어로 찾은 다른 기관 낙찰 가운데 같은 종류의 일로 확인된 공고번호 (확인하지 않았으면 없음) */
  kind?: string[];
  reason?: string;
  usage?: { input: number; output: number };
  /** 지금 공고가 따로 맡는 업무를 묶어 뽑는 공고면 업무 이름들 (예: 선택적복지 위탁운영, 복지카드 발급). 하나면 없음 */
  parts?: string[];
  /** 후보 공고번호 → 맞는 업무 번호 (parts 의 순서). 묶음 공고일 때만 */
  partOf?: Record<string, number>;
}

export interface RelateTarget {
  title: string;
  agency: string;
  baseAmount?: number;
  postedAt?: string;
}

/** 후보 목록의 해시 (캐시 키). 후보가 바뀌면 다시 묻는다 */
export function relateHash(a: Pick<AwardAnalysis, "maybe" | "related">): string {
  const s = `${(a.maybe ?? []).map((m) => m.no).join(",")}|${(a.related?.rows ?? []).map((r) => r[0]).join(",")}`;
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

const PART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "same", "part", "why"],
        properties: {
          no: { type: "string", description: "후보 공고번호 그대로" },
          same: { type: "boolean", description: "지금 공고(묶은 업무 전체)와 같은 사업이면 true" },
          part: { type: "integer", description: "같은 사업은 아니지만 지금 공고의 업무 하나만 다루는 같은 사업이면 그 업무 번호(0부터), 아니면 -1" },
          why: { type: "string", description: "짧은 이유" },
        },
      },
    },
  },
} as const;

/**
 * parts: 지금 공고가 따로 맡는 업무를 묶어 뽑는 공고일 때 그 업무 이름들 (relateKindWithAI 가 정한 것).
 * 그때는 같은 기관이 그 업무 하나만 따로 뽑았던 공고도 업무별로 골라 partOf 에 넣는다.
 */
export async function relateWithAI(client: Anthropic, target: RelateTarget, a: Pick<AwardAnalysis, "maybe">, model?: string, parts?: string[]): Promise<RelateResult> {
  const m = model || DEFAULT_RELATE_MODEL;
  const base = { v: RELATE_VERSION, hash: relateHash(a), model: m, at: new Date().toISOString() };
  const cands = a.maybe ?? [];
  if (!cands.length) return { ...base, status: "none", same: [] };
  const lines = cands.map((c) => `- ${c.no} | ${c.date} | ${c.title} | ${won(c.base || c.amount)} | 참가 ${c.bidders || "?"}곳${parts ? ` | 낙찰 ${c.winner || "?"}` : ""}`).join("\n");
  const multi = parts && parts.length >= 2;
  const user = [
    `지금 공고: ${target.title}`,
    multi ? `지금 공고가 묶어 뽑는 업무: ${parts.map((p, i) => `${i} ${p}`).join(", ")}\n후보가 이 가운데 한 업무만 다루는 같은 기관의 같은 사업이면 same=false 로 하고 part 에 그 업무 번호를 적으세요. 후보가 여러 업무를 묶었으면 낙찰업체가 실제로 하는 업무로 고르세요. 아니면 part=-1.` : "",
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
    output_config: { format: { type: "json_schema", schema: (multi ? PART_SCHEMA : SCHEMA) as unknown as Record<string, unknown> } },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return { ...base, status: "error", same: [], reason: msg.stop_reason, usage };
  const raw = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let out: { items: { no: string; same: boolean; part?: number; why: string }[] };
  try { out = JSON.parse(raw); } catch { return { ...base, status: "error", same: [], reason: "JSON 해석 실패", usage }; }
  // 후보에 있던 번호만 받는다
  const known = new Set(cands.map((c) => c.no));
  const same = out.items.filter((i) => i.same && known.has(i.no)).map((i) => i.no);
  const partOf: Record<string, number> = {};
  if (multi) for (const i of out.items) if (!i.same && known.has(i.no) && Number.isInteger(i.part) && i.part! >= 0 && i.part! < parts.length) partOf[i.no] = i.part!;
  return { ...base, status: "ok", same, ...(multi ? { parts, partOf } : {}), reason: out.items.map((i) => `${i.no} ${i.same ? "같음" : "다름"}: ${i.why}`).join(" / ").slice(0, 600), usage };
}

const KIND_SYSTEM = `당신은 한국 공공조달(나라장터) 낙찰 자료를 정리하는 분석가입니다.
'지금 공고'와 여러 기관의 과거 낙찰 공고 후보들이 주어집니다. 각 후보가 지금 공고와 같은 종류의 일인지 판단하세요.
같은 종류의 일이란: 기관은 달라도 같은 업체들이 참가해 겨룰 만한 계약입니다. 대상의 종류와 업무 종류가 같아야 합니다.
- 같은 종류: 다른 기관의 같은 업무(예: 다른 공사의 "선택적복지제도 시스템 운영사 선정"), 지역·연도·규모만 다른 같은 업무.
- 다른 종류: 낱말만 겹치고 업무가 다른 공고(예: "복지관 청소"와 "복지포인트 운영"), 업무 종류가 다른 공고(유지관리와 구축·감리·설계), 대상 종류가 다른 공고(초음파진단기와 내시경).

먼저 지금 공고가 맡는 업체가 서로 다른 업무를 묶어 뽑는지 보세요. 업종이 다른 업체가 각각 맡는 일이 둘 이상이면 parts 에 업무마다 짧은 이름을 공고명 순서대로 적으세요.
- 예: "선택적복지제도(복지포인트) 위탁운영사 및 복지카드 발급사업자 선정" → ["선택적복지 위탁운영", "복지카드 발급"]
- 예: "청사 청소 및 경비 용역" → ["청소", "경비"], "급식 식재료 및 소모품 구매" → ["식재료", "소모품"], "설계 및 감리 용역" → ["설계", "감리"]
- 같은 업체가 함께 하는 일(예: "시설물 유지보수 및 점검", "교복 동복·하복")은 하나의 업무입니다. 하나면 parts 에 하나만 적으세요.
각 후보마다 part 에 지금 공고의 어느 업무와 같은 종류인지 번호(0부터)를 적으세요. 같은 종류가 아니면 same=false, part=-1 입니다.
- 후보가 여러 업무를 묶은 공고면 그 후보의 낙찰업체가 실제로 하는 업무로 고르세요(예: 카드사·은행이 낙찰받았으면 복지카드 발급, 복지몰·포인트 운영사가 낙찰받았으면 위탁운영).
- 지금 공고가 하나의 업무인데 후보의 낙찰업체가 그 업무를 하는 업체가 아니면 다른 종류입니다.
- 애매하면 다른 종류로 판단하세요.
각 후보마다 판단과 열 단어 안쪽의 이유를 답하세요.`;

const KIND_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["parts", "items"],
  properties: {
    parts: { type: "array", items: { type: "string" }, description: "지금 공고의 업무 이름 (따로 맡는 업무가 둘 이상일 때만 여러 개)" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["no", "same", "part", "why"],
        properties: {
          no: { type: "string", description: "후보 공고번호 그대로" },
          same: { type: "boolean", description: "지금 공고의 업무 가운데 하나와 같은 종류면 true" },
          part: { type: "integer", description: "같은 종류인 업무 번호 (parts 순서, 0부터). 다른 종류면 -1" },
          why: { type: "string", description: "짧은 이유" },
        },
      },
    },
  },
} as const;

export interface KindCandidate { no: string; title: string; agency: string; date: string; amount: number; winner?: string }

/** 핵심어로 찾은 다른 기관 낙찰 가운데 같은 종류의 일만 고른다 (참가 예상 기업을 거르는 데 쓴다) */
export async function relateKindWithAI(client: Anthropic, target: RelateTarget, cands: KindCandidate[], model?: string): Promise<{ same: string[]; parts?: string[]; partOf?: Record<string, number>; usage: { input: number; output: number }; status: RelateResult["status"] }> {
  const m = model || DEFAULT_RELATE_MODEL;
  if (!cands.length) return { same: [], usage: { input: 0, output: 0 }, status: "none" };
  const user = [
    `지금 공고: ${target.title}`,
    `수요기관: ${target.agency}`,
    target.baseAmount ? `금액: ${won(target.baseAmount)}` : "",
    "",
    "과거 낙찰 후보 (공고번호 | 기관 | 낙찰일 | 공고명 | 금액 | 낙찰업체):",
    cands.map((c) => `- ${c.no} | ${c.agency} | ${c.date} | ${c.title} | ${won(c.amount)} | ${c.winner || "?"}`).join("\n"),
  ].filter((x) => x !== "").join("\n");
  const msg = await client.messages.create({
    model: m,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: KIND_SCHEMA as unknown as Record<string, unknown> } },
    system: KIND_SYSTEM,
    messages: [{ role: "user", content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const usage = { input: msg.usage.input_tokens, output: msg.usage.output_tokens };
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return { same: [], usage, status: "error" };
  const raw = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const out = JSON.parse(raw) as { parts?: string[]; items: { no: string; same: boolean; part?: number }[] };
    const known = new Set(cands.map((c) => c.no));
    const same = out.items.filter((i) => i.same && known.has(i.no)).map((i) => i.no);
    const parts = (out.parts ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 4);
    if (parts.length < 2) return { same, usage, status: "ok" };
    const partOf: Record<string, number> = {};
    for (const i of out.items) if (i.same && known.has(i.no) && Number.isInteger(i.part) && i.part! >= 0 && i.part! < parts.length) partOf[i.no] = i.part!;
    return { same, parts, partOf, usage, status: "ok" };
  } catch {
    return { same: [], usage, status: "error" };
  }
}

/** 애매한 같은 사업 후보와 다른 기관 핵심어 낙찰을 함께 확인한다 (중계 서버 ?relate=) */
export async function relateAll(client: Anthropic, a: Pick<AwardAnalysis, "maybe" | "related" | "subject">, model?: string): Promise<RelateResult> {
  const target = a.subject!;
  // 다른 기관 핵심어 낙찰을 먼저 확인한다: 이때 지금 공고가 묶음 공고인지(업무가 둘 이상인지)도 정한다
  const rows = a.related?.rows ?? [];
  const k = rows.length ? await relateKindWithAI(client, target, rows.map((x) => ({ no: x[0], title: x[1], agency: x[2], date: x[3], amount: x[9] || x[5], winner: x[10] })), model) : undefined;
  const parts = k?.status === "ok" ? k.parts : undefined;
  const r: RelateResult = a.maybe?.length
    ? await relateWithAI(client, target, a, model, parts)
    : { v: RELATE_VERSION, hash: relateHash(a), model: model || DEFAULT_RELATE_MODEL, at: new Date().toISOString(), status: "none", same: [] };
  r.hash = relateHash(a);
  if (k) {
    if (k.status === "ok") {
      r.kind = k.same;
      if (k.parts && k.partOf) { r.parts = k.parts; r.partOf = { ...k.partOf, ...(r.partOf ?? {}) }; }
      if (r.status === "none") r.status = "ok";
    } else if (r.status === "none") r.status = k.status;
    r.usage = { input: (r.usage?.input ?? 0) + k.usage.input, output: (r.usage?.output ?? 0) + k.usage.output };
  }
  return r;
}
