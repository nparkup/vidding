import Anthropic from "@anthropic-ai/sdk";
import type { Bid } from "../types";
import { adoptable } from "../criteria";
import { CREDIT_GRADES, tidyItemLabel, type EvalItem, type EvalSheet, type ItemKind, type ScoreBand } from "../evalscore";

/**
 * 규칙 파서가 배점표를 못 읽은 공고의 첨부 본문을 Claude에 보내 그 공고의 배점표를 읽는다.
 * - 빌드는 AI를 부르지 않는다: 후보 공고의 평가 관련 본문만 잘라(excerpt) /ai-input/{공고}.json 으로 내보낸다.
 * - 평가점수 예측에서 그 공고를 고르면 중계 서버(worker/corp-lookup ?aisheet=)가 그 본문으로 한 번 부르고 결과를 R2에 캐시한다.
 *   키(ANTHROPIC_API_KEY)는 Worker 비밀값에만 있다. 본문은 사이트가 만든 것만 쓰므로 아무 글이나 보내 키를 쓸 수는 없다.
 * - 답은 그대로 쓰지 않는다: 항목 이름이 원문에 있는지, 배점 합계가 100점(기술+가격)과 맞는지, 나라장터 기술·가격 배점과
 *   맞는지(criteria.ts adoptable) 확인해 통과한 것만 평가표로 돌려준다.
 */

/** 프롬프트·검증 규칙을 바꾸면 올린다 (캐시가 새로 만들어진다) */
export const AI_SHEET_VERSION = 10;
export const DEFAULT_AI_MODEL = "claude-haiku-5-5";

/** 빌드가 공고마다 만들어 두는 AI 판독 입력 (/ai-input/{공고}.json) */
export interface AiInput {
  v: number;
  /** text 의 해시 (캐시 키) */
  hash: string;
  text: string;
  bid: Pick<Bid, "id" | "title" | "contractMethod" | "agency"> & { baseAmount?: number };
  techRatio?: number;
  priceRatio?: number;
}

export interface AiSheetResult {
  v: number;
  hash: string;
  model: string;
  at: string;
  status: "ok" | "none" | "rejected" | "error";
  sheet?: EvalSheet;
  reason?: string;
  usage?: { input: number; output: number };
}

/* ---------- 보낼 본문 고르기 ---------- */

const KEY_RE = /(배\s*점|평가\s*항목|심사\s*항목|평가\s*기준|세부\s*평가|평가\s*요소|협상\s*적격|적격\s*심사|종합\s*평점|평\s*점|통과|가격\s*평가|기술\s*능력\s*평가|정량|정성|신용\s*평가|수행\s*실적|신인도|가\s*감점|낙찰\s*하한율|만\s*점|평가표|심사표)/;
const TABLE_RE = /배\s*점|평가\s*표|심사\s*표/;
const FULL_LIMIT = 30_000;
const EXCERPT_LIMIT = 40_000;

/** 배점표가 있을 법한 공고인지 (배점 머리글과 평가항목 낱말이 함께 있어야 한다) */
export function hasTableSignal(text: string): boolean {
  return /배\s*점/.test(text) && /(평가\s*항목|심사\s*항목|평가\s*요소|평가\s*분야|심사\s*분야|세부\s*평가)/.test(text);
}

/** 짧은 문서는 그대로, 긴 문서는 평가 관련 줄 앞뒤만 (배점표 머리글 뒤는 표가 길게 이어지므로 넉넉히) */
export function excerpt(text: string): string {
  const clean = text.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= FULL_LIMIT) return clean;
  const lines = clean.split("\n");
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (/^=== 파일/.test(l)) keep.add(i);
    if (!KEY_RE.test(l)) return;
    const after = TABLE_RE.test(l) ? 60 : 10;
    for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + after); k++) keep.add(k);
  });
  const out: string[] = [];
  let prev = -2;
  let size = 0;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i !== prev + 1) out.push("…");
    out.push(lines[i]);
    size += lines[i].length + 1;
    prev = i;
    if (size > EXCERPT_LIMIT) { out.push("… (이하 생략)"); break; }
  }
  return out.join("\n");
}

/* ---------- Claude 호출 ---------- */

const KINDS = ["performance", "credit", "price", "years", "staff", "bonus", "qualitative", "capability", "plan", "finance", "techGrade", "other"] as const;
const UNITS = ["%", "grade", "명", "년", "건"] as const;
const nullable = (t: string) => ({ type: [t, "null"] });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "decides_award", "reason", "table_quote", "stated_total", "tech_total", "price_total", "pass", "panel_rule", "items"],
  properties: {
    found: { type: "boolean", description: "이 공고에 적용되는 배점표(평가항목별 배점)가 본문에 있으면 true" },
    decides_award: { type: "boolean", description: "이 배점표로 낙찰자(또는 협상적격자·적격자·선정 대상)를 정하면 true. 계약 뒤 착공 전 안전수준 평가, 계약이행 실적평가처럼 낙찰 이후에 쓰는 표면 false" },
    reason: { type: "string", description: "판단 근거 한두 문장. 못 찾았으면 그 이유" },
    table_quote: { type: "string", description: "배점표 제목이나 머리글 줄을 원문 그대로" },
    stated_total: { ...nullable("number"), description: "배점표의 합계·총점 줄에 적힌 숫자 그대로 (항목을 더한 값이 아님). 합계 줄이 없으면 null" },
    tech_total: { ...nullable("number"), description: "기술(능력) 평가 배점 합계. 표 합계 줄이나 공고 문장에 적힌 값. 없으면 null" },
    price_total: { ...nullable("number"), description: "입찰가격 평가 배점. 없으면 null" },
    pass: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "value", "quote"],
      properties: {
        kind: { type: "string", enum: ["total", "techRatio", "none"], description: "total: 종합평점·합산점수 N점 이상, techRatio: 기술점수가 배점의 N% 이상" },
        value: { ...nullable("number"), description: "total 이면 점수, techRatio 이면 0~1 비율 (85% → 0.85)" },
        quote: { type: "string" },
      },
    },
    panel_rule: { ...nullable("string"), description: "평가위원 점수 처리 방식 원문 (예: 최고·최저점 제외 산술평균)" },
    items: {
      type: "array",
      description: "배점이 매겨진 평가항목. 세부항목이 있으면 상위 항목 하나로 묶고 세부항목은 criteria 에 적는다. 합계·소계 줄은 넣지 않는다",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["group", "label", "max", "kind", "quote", "outside_total", "bands", "criteria"],
        properties: {
          group: { type: "string", description: "상위 구분 (예: 정량평가, 정성평가, 입찰가격, 경영상태, 수행능력)" },
          label: { type: "string", description: "평가항목 이름을 원문 낱말 그대로" },
          max: { type: "number", description: "배점 (감점만 있는 항목은 0)" },
          kind: { type: "string", enum: KINDS as unknown as string[] },
          quote: { type: "string", description: "이 항목의 배점이 적힌 원문 줄 그대로" },
          outside_total: { type: "boolean", description: "표 합계(예: 100점) 밖에서 더하거나 빼는 가감점이면 true. 이때 max 는 가점 한도" },
          bands: {
            type: "array",
            description: "구간별 점수 (신용등급별, 실적 비율·건수별, 인원·업력별). 없으면 빈 배열",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["cond", "points", "unit", "min", "best_grade", "worst_grade"],
              properties: {
                cond: { type: "string", description: "원문 조건 그대로" },
                points: { type: "number" },
                unit: { type: "string", enum: UNITS as unknown as string[] },
                min: { ...nullable("number"), description: "이 구간의 하한 값 (실적은 기준금액 대비 %, 건수, 명, 년). 등급이면 null" },
                best_grade: { ...nullable("string"), description: "등급 구간의 가장 높은 등급 (예: AAA)" },
                worst_grade: { ...nullable("string"), description: "등급 구간의 가장 낮은 등급 (예: A-). 'CCC+ 이하'면 D" },
              },
            },
          },
          criteria: { type: "array", items: { type: "string" }, description: "세부 평가요소 원문 (최대 8개)" },
        },
      },
    },
  },
} as const;

const SYSTEM = `당신은 한국 공공조달(나라장터) 입찰공고의 첨부 문서를 읽고, 그 공고에 실제 적용되는 평가 배점표를 구조화하는 분석가입니다.
규칙:
- 본문에 적힌 내용만 씁니다. 추측하거나 표준 기준표를 기억으로 채우지 않습니다. 본문에 배점표가 없으면 found=false 로 답합니다.
- PDF·HWP에서 뽑은 글자라 표의 칸이 여러 줄로 흩어져 있을 수 있습니다. 숫자 위치와 괄호 속 소계(예: "(10)")로 항목과 배점을 맞춥니다.
- 같은 배점이 요약표와 상세 평가표에 두 번 나오면 한 번만 씁니다. 합계·소계·총점 줄은 항목이 아닙니다.
- 세부항목이 여럿인 정성 항목은 상위 항목 하나로 묶고(배점은 상위 항목 배점), 세부항목은 criteria 에 적습니다.
- 정량 항목(신용평가등급, 수행실적, 인력, 업력 등)의 구간별 점수는 bands 에 모두 적습니다.
- kind: performance 실적, credit 신용평가·경영상태 등급, finance 재무비율, price 입찰가격, staff 기술인력, years 업력, bonus 신인도·가감점, qualitative 제안서·정성 평가, capability PQ 점수 환산, plan 이행계획서 제출, techGrade 물품 기술등급, other 그 밖.
- 입찰가격 배점은 price 항목 하나로 넣습니다. 입찰 보증금·계약 조항의 숫자(예: 100분의 5, 제39조)는 배점이 아닙니다.
- "가격평가를 하지 않음", "비예산 사업으로 가격평가점수 미포함"처럼 가격평가가 없으면 price 항목을 넣지 않고 price_total 은 0 으로 둡니다.
- 표의 합계 줄과 항목 배점의 합이 다르면 고치거나 항목을 빼서 맞추지 말고 읽은 그대로 쓰고, 합계 줄의 숫자는 stated_total 에 적고, reason 에 그 차이를 적습니다.
- 표가 다음 쪽으로 이어지면서 같은 평가항목 칸(예: "부가서비스(20점)")과 배점이 다시 적히면 한 항목입니다. 배점은 한 번만 쓰고 양쪽 세부 기준을 criteria 에 모두 적습니다. 판단이 어려우면 표에 적힌 순서대로 두 줄을 그대로 씁니다.
- 이름이 같아도 사이에 다른 항목이 있는 별개 구역(예: 운영사별 항목)이면 따로 씁니다.
- 공고서·제안요청서·평가기준이 서로 다르면 공고에 첨부된 이 사업의 평가표를 따릅니다.
- 공고와 표는 틀리지 않는다고 보고, 표의 합계와 항목 배점의 합이 맞도록 읽습니다. 맞지 않으면 쪽 넘김으로 다시 적힌 칸, 소계 줄, 합계 밖 가감점을 항목으로 잘못 넣지 않았는지 다시 봅니다.
- "(+10)/(-10)", "가감점", "가점·감점"처럼 합계 밖에서 더하고 빼는 항목은 outside_total=true 로 적습니다. 합계 안에 배점이 있는 신인도 항목은 false 입니다.
- 낙찰자를 정하는 표를 고릅니다. 여러 단계 표(1차 서류평가, 최종 평가)가 있으면 최종 낙찰자를 정하는 표를 고르고, 앞 단계 통과 기준은 pass 에 적습니다. 계약 뒤 안전수준 평가처럼 낙찰과 무관한 표만 있으면 decides_award=false 입니다.
- 금액 구간별로 표가 나뉘어 있으면(예: 1억 원 이상, 1억 원 미만) 사업 금액에 맞는 구간의 표를 고르고, 금액을 모르면 reason 에 그렇게 적습니다.`;

export async function readSheetWithAI(
  client: Anthropic,
  bid: Pick<Bid, "id" | "title" | "contractMethod" | "agency"> & { baseAmount?: number },
  text: string,
  opts: { model?: string; techRatio?: number; priceRatio?: number; onRaw?: (out: unknown) => void } = {},
): Promise<Omit<AiSheetResult, "hash" | "v" | "at">> {
  const model = opts.model || DEFAULT_AI_MODEL;
  const hint = [
    `공고명: ${bid.title}`,
    `계약방법: ${bid.contractMethod ?? "모름"}`,
    bid.agency ? `공고기관: ${bid.agency}` : "",
    bid.baseAmount ? `사업 금액(배정예산 또는 추정가격): ${Math.round(bid.baseAmount).toLocaleString("ko-KR")}원` : "",
    opts.techRatio !== undefined ? `나라장터에 등록된 기술:가격 배점 = ${opts.techRatio}:${opts.priceRatio ?? "?"}` : "",
  ].filter(Boolean).join("\n");
  const msg = await client.messages.stream({
    model,
    max_tokens: 32000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `${hint}\n\n다음은 이 공고 첨부 문서에서 평가 관련 부분을 뽑은 본문입니다.\n<document>\n${text}\n</document>` }],
  }).finalMessage();
  const usage = { input: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0), output: msg.usage.output_tokens };
  if (msg.stop_reason === "refusal") return { model, status: "error", reason: "모델이 답하지 않음", usage };
  if (msg.stop_reason === "max_tokens") return { model, status: "error", reason: "답이 길어 잘림", usage };
  const raw = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let out: AiOut;
  try { out = JSON.parse(raw) as AiOut; } catch { return { model, status: "error", reason: "JSON 해석 실패", usage }; }
  opts.onRaw?.(out);
  if (!out.found) return { model, status: "none", reason: out.reason.slice(0, 200), usage };
  if (!out.decides_award) return { model, status: "none", reason: `낙찰자 결정용 평가표가 아님: ${out.reason}`.slice(0, 200), usage };
  const r = toSheet(out, text, bid, model);
  if (!r.sheet) return { model, status: "rejected", reason: r.reason, usage };
  // 나라장터에 등록된 기술·가격 배점과도 맞아야 화면에서 쓴다
  if (!adoptable(r.sheet, { techRatio: opts.techRatio, priceRatio: opts.priceRatio, method: bid.contractMethod === "적격심사" ? "적격심사" : undefined })) {
    return { model, status: "rejected", reason: bid.contractMethod === "적격심사" && !r.sheet.items.some((i) => i.kind === "price") ? "적격심사인데 입찰가격 배점이 없는 표 (계약 전 안전보건 평가표 등)" : "나라장터 기술·가격 배점과 다름", usage };
  }
  return { model, status: "ok", sheet: r.sheet, usage };
}

/** 중계 서버가 쓰는 진입점: 빌드가 만든 입력 하나를 읽는다 */
export async function readAiInput(client: Anthropic, input: AiInput, model?: string): Promise<AiSheetResult> {
  const r = await readSheetWithAI(client, input.bid, input.text, { model, techRatio: input.techRatio, priceRatio: input.priceRatio });
  return { ...r, v: AI_SHEET_VERSION, hash: input.hash, at: new Date().toISOString() };
}

/* ---------- 검증 ---------- */

interface AiBand { cond: string; points: number; unit: (typeof UNITS)[number]; min: number | null; best_grade: string | null; worst_grade: string | null }
interface AiItem { group: string; label: string; max: number; kind: (typeof KINDS)[number]; quote: string; outside_total?: boolean; bands: AiBand[]; criteria: string[] }
export interface AiOut {
  found: boolean;
  decides_award: boolean;
  reason: string;
  table_quote: string;
  stated_total: number | null;
  tech_total: number | null;
  price_total: number | null;
  pass: { kind: "total" | "techRatio" | "none"; value: number | null; quote: string };
  panel_rule: string | null;
  items: AiItem[];
}

const squash = (s: string) => s.replace(/[\s·ㆍ・,.()\[\]（）「」『』"'“”‘’\-–—:：/]/g, "");

/** 항목 이름의 한글 낱말(2자 이상)이 원문에 모두 있는지 */
function labelInText(label: string, flat: string): boolean {
  const words = label.match(/[가-힣A-Za-z]{2,}/g) ?? [];
  return words.length > 0 && words.every((w) => flat.includes(w));
}

function gradeIdx(g: string | null): number | undefined {
  if (!g) return undefined;
  const t = g.replace(/\s/g, "").toUpperCase();
  const norm = ["AAA", "CC", "C", "D"].includes(t) ? t : /[+\-0]$/.test(t) ? t : `${t}0`;
  const i = (CREDIT_GRADES as readonly string[]).indexOf(norm);
  return i >= 0 ? i : undefined;
}

function toBands(it: AiItem): ScoreBand[] | undefined {
  const out: ScoreBand[] = [];
  for (const b of it.bands) {
    if (!(b.points >= 0 && b.points <= it.max + 0.01)) return undefined;
    if (b.unit === "grade") {
      const best = gradeIdx(b.best_grade), worst = gradeIdx(b.worst_grade);
      if (best === undefined && worst === undefined) return undefined;
      out.push({ unit: "grade", min: 0, best: best ?? 0, worst: worst ?? CREDIT_GRADES.length - 1, points: b.points, cond: b.cond.slice(0, 80) });
    } else {
      out.push({ unit: b.unit, min: b.min ?? 0, points: b.points, cond: b.cond.slice(0, 80) });
    }
  }
  return out.length ? out : undefined;
}

let seq = 0;

export function toSheet(out: AiOut, text: string, bid: Pick<Bid, "contractMethod">, model: string): { sheet?: EvalSheet; reason?: string } {
  const flat = squash(text);
  // 표 합계 밖의 가감점은 배점 합에서 빼고 신뢰도 가감점(배점 0)으로 둔다
  const outside = out.items.filter((i) => i.outside_total);
  const raw = out.items.filter((i) => !i.outside_total && (i.max > 0 || i.kind === "bonus"));
  if (raw.length === 1 && raw[0].kind === "price") return { reason: `입찰가격 ${raw[0].max}점만으로 정하는 공고 (가격 순위로 결정)` };
  if (raw.length < 2) return { reason: "평가항목이 2개 미만" };
  // 같은 평가항목이 두 번 나오는 경우를 하나로 합친다
  // - 이름·원문 문구·배점이 모두 같으면 AI가 한 칸을 두 번 읽은 것
  // - 이름·배점이 같은 항목이 바로 이어서 나오면, 표가 다음 쪽으로 넘어가며 항목 칸("부가서비스(20점)")이 다시 찍힌 것.
  //   세부 기준만 이어 붙이고 배점은 한 번만 센다. 사이에 다른 항목이 끼어 있으면 별개 항목으로 둔다(운영사별 시스템안정성 등)
  const nameKey = (l: string) => squash(l.replace(/\(\s*\d+(?:\.\d+)?\s*점?\s*\)/g, "").replace(/^(?:[①-⑳□■◦○▪•※-]|\(?\d{1,2}[.)]|[가-하][.)])\s*/, ""));
  const seen = new Set<string>();
  const merged: AiItem[] = [];
  const mergedNames: string[] = [];
  let dropped = 0;
  for (const i of raw) {
    const k = `${squash(i.label)}|${squash(i.quote)}|${i.max}`;
    if (seen.has(k)) { dropped++; continue; }
    seen.add(k);
    const prev = merged[merged.length - 1];
    if (prev && nameKey(prev.label) && nameKey(prev.label) === nameKey(i.label) && prev.max === i.max && prev.kind === i.kind) {
      merged[merged.length - 1] = { ...prev, quote: `${prev.quote} / ${i.quote}`, criteria: [...prev.criteria, ...i.criteria], bands: prev.bands.length ? prev.bands : i.bands };
      mergedNames.push(prev.label.replace(/\s+/g, " ").trim());
      continue;
    }
    merged.push(i);
  }
  // 평가항목 칸에 배점이 적힌 경우("시스템안정성(10점)") 그 아래 세부 줄을 따로 읽어 배점을 여러 번 셌으면 하나로 묶는다.
  // 공고 표는 틀리지 않으므로, 이어진 줄들의 배점 합이 칸에 적힌 배점보다 크면 칸 배점 하나로 본다
  const headerOf = (i: AiItem) => {
    for (const t of [i.label, i.group]) {
      const m = /^(.*?)\(\s*(\d+(?:\.\d+)?)\s*점\s*\)/.exec(t.replace(/\s+/g, " ").trim());
      if (m && squash(m[1])) return { key: nameKey(m[1]), n: Number(m[2]), name: m[1].trim() };
    }
    return undefined;
  };
  const grouped: AiItem[] = [];
  for (let k = 0; k < merged.length; ) {
    const h = headerOf(merged[k]);
    let end = k + 1;
    if (h) {
      while (end < merged.length) {
        const nh = headerOf(merged[end]);
        const same = nh ? nh.key === h.key && nh.n === h.n : nameKey(merged[end].group) === h.key;
        if (!same || merged[end].kind === "price") break;
        end++;
      }
    }
    const run = merged.slice(k, end);
    const runSum = run.reduce((a, i) => a + i.max, 0);
    if (h && run.length > 1 && runSum > h.n + 0.5) {
      grouped.push({ ...run[0], label: h.name, max: h.n, quote: run.map((i) => i.quote).join(" / "), criteria: run.flatMap((i) => [i.label.replace(/^.*?\)\s*/, ""), ...i.criteria]).filter(Boolean), bands: run.find((i) => i.bands.length)?.bands ?? [] });
      mergedNames.push(`${h.name}(${h.n}점) 세부 ${run.length}줄`);
    } else grouped.push(...run);
    k = end;
  }
  // 그래도 표 합계(100점)와 맞지 않으면, 괄호 속 설명만 다르고 이름·배점이 같은 항목이 바로 이어진 경우도
  // 쪽 넘김으로 다시 적힌 한 칸으로 본다. 합이 100점으로 맞을 때만 받아들인다
  const total = (l: AiItem[]) => l.reduce((a, i) => a + i.max, 0);
  let final = grouped;
  if (Math.abs(total(grouped) - 100) > 0.5) {
    const baseName = (l: string) => l.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
    const loose: AiItem[] = [];
    const looseNames: string[] = [];
    for (const i of grouped) {
      const prev = loose[loose.length - 1];
      if (prev && squash(baseName(prev.label)) && squash(baseName(prev.label)) === squash(baseName(i.label)) && prev.max === i.max && prev.kind === i.kind) {
        loose[loose.length - 1] = { ...prev, label: baseName(prev.label), quote: `${prev.quote} / ${i.quote}`, criteria: [...prev.criteria, i.label, ...i.criteria], bands: prev.bands.length ? prev.bands : i.bands };
        looseNames.push(baseName(prev.label));
        continue;
      }
      loose.push(i);
    }
    if (Math.abs(total(loose) - 100) <= 0.5) { final = loose; mergedNames.push(...looseNames); }
  }
  raw.splice(0, raw.length, ...final);
  const missing = raw.filter((i) => !labelInText(i.label, flat));
  if (missing.length > Math.floor(raw.length * 0.2)) return { reason: `원문에 없는 항목 이름: ${missing.map((m) => m.label).slice(0, 3).join(", ")}` };
  const items: EvalItem[] = raw.map((i) => {
    const kind = i.kind as ItemKind;
    const bands = kind === "qualitative" || kind === "price" ? undefined : toBands(i);
    return {
      id: `ai${++seq}`,
      group: i.group.slice(0, 20) || "기타",
      // 머리의 번호·글머리표(①, □, 1., 가.)는 떼어 낸다. 남겨 두면 산식 줄로 오인되어 화면 사용 검사에서 빠진다
      label: tidyItemLabel(i.label.replace(/\s+/g, " ").trim().replace(/^(?:[①-⑳□■◦○▪•※-]|\(?\d{1,2}[.)]|[가-하][.)])\s*/, "").trim()).slice(0, 40) || i.label.slice(0, 40),
      max: Math.round(i.max * 100) / 100,
      kind,
      basis: i.quote.replace(/\s+/g, " ").trim().slice(0, 90) || undefined,
      ...(bands ? { bands } : {}),
      ...(i.criteria.length ? { criteria: i.criteria.slice(0, 8).map((c) => c.slice(0, 90)) } : {}),
    };
  });
  for (const o of outside) {
    if (!labelInText(o.label, flat)) continue;
    items.push({ id: `ai${++seq}`, group: o.group.slice(0, 20) || "가감점", label: o.label.replace(/\s+/g, " ").trim().slice(0, 40), max: 0, kind: "bonus", basis: `합계 밖 가감점: ${o.quote.replace(/\s+/g, " ").trim().slice(0, 80)}`, ...(o.criteria.length ? { criteria: o.criteria.slice(0, 8).map((c) => c.slice(0, 90)) } : {}) });
  }
  // 입찰가격 배점이 항목에 없고 따로 적혀 있으면 넣는다
  if (!items.some((i) => i.kind === "price") && out.price_total && out.price_total > 0) {
    items.push({ id: `ai${++seq}`, group: "입찰가격", label: "입찰가격", max: out.price_total, kind: "price", basis: `입찰가격 평가 ${out.price_total}점` });
  }
  const prices = items.filter((i) => i.kind === "price");
  // 가격평가가 없는 공고(기술 100점)는 가격 항목 없이 받는다. 가격 배점이 적혀 있는데 항목이 없거나 둘 이상이면 탈락
  if (prices.length > 1 || (prices.length === 0 && (out.price_total ?? 0) > 0)) return { reason: "입찰가격 항목을 하나로 정하지 못함" };
  const price = prices[0]?.max ?? 0;
  const sum = Math.round(items.reduce((a, i) => a + i.max, 0) * 100) / 100;
  // 원문 배점은 바꾸지 않는다. 같은 항목을 합친 뒤에도 표 합계와 맞지 않으면 쓰지 않고 기준표(추정)로 계산한다
  if (Math.abs(sum - 100) > 0.5) {
    const stated = out.stated_total !== null ? `표 합계 ${out.stated_total}점과 ` : "";
    return { reason: `항목 배점을 더하면 ${sum}점이라 ${stated || "100점과 "}맞지 않음` };
  }
  if (out.tech_total !== null && Math.abs(out.tech_total + price - 100) > 0.5) return { reason: `기술 ${out.tech_total}점 + 가격 ${price}점이 100점이 아님` };
  const pass: EvalSheet["pass"] =
    out.pass.kind === "total" && out.pass.value && out.pass.value > 0 && out.pass.value <= 100 ? { kind: "total", score: out.pass.value }
      : out.pass.kind === "techRatio" && out.pass.value && out.pass.value > 0 && out.pass.value < 1 ? { kind: "techRatio", ratio: out.pass.value }
        : undefined;
  const method: EvalSheet["method"] = bid.contractMethod === "적격심사" ? "적격심사" : "협상에 의한 계약";
  return {
    sheet: {
      method,
      title: "공고 첨부의 평가표",
      items,
      pass,
      source: "extracted",
      reader: { by: "ai", model },
      confidence: missing.length === 0 ? "높음" : "보통",
      notes: [`배점표 원문: ${out.table_quote.replace(/\s+/g, " ").slice(0, 80)}`, ...(outside.length ? [`합계 밖 가감점 ${outside.length}개는 배점 합에 넣지 않음`] : []), ...(mergedNames.length ? [`같은 평가항목 칸에 속한 줄을 하나로 합침: ${[...new Set(mergedNames)].join(", ")}`] : []), ...(dropped ? [`같은 항목을 두 번 읽은 ${dropped}건 제외`] : []), ...(price ? [] : ["가격평가 없음 (기술 100점)"]), out.reason.slice(0, 160)],
      ...(out.panel_rule ? { panelRule: out.panel_rule.slice(0, 120) } : {}),
    },
  };
}
