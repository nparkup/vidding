/**
 * 추정가격 구간마다 배점이 다른 배점표 읽기 (지자체 적격심사 세부기준 전문을 첨부한 공고).
 *
 *   10억이상 10억미만 5억 이상 5억미만 2억이상 2억미만
 *   계 100 100 100 100
 *   이행실적 37 27 12 -
 *   입찰가격 30 50 70 90
 *
 * 머리글의 금액 구간을 열로 나누고, 공고의 추정가격이 든 열의 배점을 쓴다.
 * 세부기준에 별표(용역 종류)가 여러 개면 공고 본문이 적용한다고 적은 별표의 표를 쓴다. 고를 수 없으면 읽지 않는다.
 */
import type { EvalItem, EvalSheet, ItemKind } from "./evalscore";

interface Tier { lo: number; hi: number }
interface TierTable { tiers: Tier[]; rows: { label: string; cells: (number | "bonus" | null)[] }[]; total?: number[]; annex?: string; line: number }

const TOKEN_RE = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*억\s*원?\s*(이상|미만|초과|이하)/g;
const EOK = 100_000_000;

/** 머리글 한 줄의 금액 구간. 구간이 3개 미만이거나 금액 말고 다른 글이 많으면 머리글이 아니다 */
export function parseTierHeader(line: string): Tier[] | undefined {
  const toks = [...line.matchAll(TOKEN_RE)];
  if (toks.length < 3) return undefined;
  const rest = line.replace(TOKEN_RE, "").replace(/추정\s*가격|구\s*분|배점\s*한도|평가\s*점수|평점|[~∼\-–()（）·,\s]/g, "");
  if (rest.length > 6) return undefined;
  const out: Tier[] = [];
  let lo: number | undefined, hi: number | undefined;
  const close = () => { if (lo !== undefined || hi !== undefined) out.push({ lo: lo ?? 0, hi: hi ?? Infinity }); lo = hi = undefined; };
  for (const t of toks) {
    const v = Number(t[1].replace(/,/g, "")) * EOK;
    const lower = t[2] === "이상" || t[2] === "초과";
    if (lower) {
      if (lo !== undefined || (hi !== undefined && v >= hi)) close();
      lo = v;
      if (hi !== undefined) close();
    } else {
      if (hi !== undefined || (lo !== undefined && v <= lo)) close();
      hi = v;
      if (lo !== undefined) close();
    }
  }
  close();
  // 구간은 겹치지 않고 위에서 아래로(또는 아래에서 위로) 이어져야 한다
  for (const t of out) if (!(t.lo < t.hi)) return undefined;
  return out.length >= 2 ? out : undefined;
}

const CELL_RE = /[+＋]?\d+(?:\.\d+)?\s*[~∼]\s*[△▲\-–]?\s*\d+(?:\.\d+)?|[△▲]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?|(?<=^|\s)[-–](?=\s|$)/g;

function parseRow(line: string, n: number): { label: string; cells: (number | "bonus" | null)[] } | undefined {
  const m = /^([^\d+＋△▲\-–]*?)\s*((?:[+＋]?\d|[△▲\-–]).*)$/.exec(line.trim());
  if (!m) return undefined;
  const label = m[1].replace(/\s+/g, " ").trim();
  if (!label || label.length > 30) return undefined;
  const cellText = m[2];
  const cells = cellText.match(CELL_RE) ?? [];
  if (cells.length !== n) return undefined;
  // 셀 말고 다른 글이 섞였으면 표의 행이 아니다
  if (cellText.replace(CELL_RE, "").replace(/[\s점]/g, "").length > 0) return undefined;
  return {
    label,
    cells: cells.map((c) => (/[~∼]/.test(c) || /^[△▲]/.test(c) ? "bonus" : /^[-–]$/.test(c.trim()) ? null : Number(c))),
  };
}

/** 본문의 금액 구간 배점표를 모두 찾는다 */
export function findTierTables(text: string): TierTable[] {
  const lines = text.split("\n");
  const out: TierTable[] = [];
  let annex: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const a = /^\s*\[?\s*별표\s*(\d+(?:\s*-\s*\d+)?)\s*\]/.exec(lines[i]);
    if (a) annex = a[1].replace(/\s/g, "");
    if (/^=== 파일:/.test(lines[i])) annex = undefined;
    const tiers = parseTierHeader(lines[i]);
    if (!tiers) continue;
    const rows: TierTable["rows"] = [];
    let total: number[] | undefined;
    for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
      const r = parseRow(lines[j], tiers.length);
      if (!r) { if (rows.length || total) break; else continue; }
      if (/^(?:합\s*)?계$|^총\s*(?:계|점)$|^합계$/.test(r.label)) { total = r.cells.map((c) => (typeof c === "number" ? c : NaN)); continue; }
      rows.push(r);
    }
    if (rows.length >= 2) out.push({ tiers, rows, total, annex, line: i });
  }
  return out;
}

const kindOf = (label: string): ItemKind =>
  /입찰\s*가격|가격\s*평가/.test(label) ? "price"
    : /신인도|가감/.test(label) ? "bonus"
      : /실적/.test(label) ? "performance"
        : /경영\s*상태|신용/.test(label) ? "credit"
          : /기술\s*인력|기술자/.test(label) ? "staff"
            : "other";

/** 한 열의 항목. 소계 행은 빼고, 합계가 계(또는 100)와 맞아야 한다 */
function column(t: TierTable, k: number): EvalItem[] | undefined {
  const items: EvalItem[] = [];
  let sum = 0;
  for (const r of t.rows) {
    if (/소\s*계/.test(r.label)) continue;
    const c = r.cells[k];
    const label = r.label.replace(/\s+/g, " ");
    if (c === null) continue;
    if (c === "bonus") { items.push({ id: `tier${items.length + 1}`, group: label, label, max: 0, kind: "bonus", basis: "가감점 (금액 구간 배점표)" }); continue; }
    const kind = kindOf(label);
    items.push({ id: `tier${items.length + 1}`, group: kind === "price" ? "입찰가격" : label, label, max: c, kind, basis: `금액 구간 배점표 ${c}점` });
    sum += c;
  }
  const want = t.total?.[k];
  const target = Number.isFinite(want) ? (want as number) : 100;
  if (Math.abs(sum - target) > 0.01 || Math.abs(sum - 100) > 0.01) return undefined;
  if (items.filter((i) => i.kind === "price").length !== 1) return undefined;
  return items;
}

/**
 * 공고 본문이 적용한다고 적은 별표 번호들. 세부기준 전문은 "별표 1-1에 따른다"처럼 모든 별표를 적으므로
 * 배점표가 든 파일은 빼고 센다 (별표 머리글 줄도 뺀다)
 */
function citedAnnexes(text: string): Set<string> {
  const out = new Set<string>();
  const parts = text.split(/\n(?==== 파일:)/);
  for (const part of parts) {
    if (parts.length > 1 && findTierTables(part).length) continue;
    for (const line of part.split("\n")) {
      if (/^\s*\[?\s*별표\s*\d/.test(line)) continue;
      for (const m of line.matchAll(/별표\s*(\d+(?:\s*-\s*\d+)?)/g)) out.add(m[1].replace(/\s/g, ""));
    }
  }
  return out;
}

const fmtEok = (v: number) => `${v / EOK}억원`;
const tierName = (t: Tier) => t.hi === Infinity ? `${fmtEok(t.lo)} 이상` : t.lo === 0 ? `${fmtEok(t.hi)} 미만` : `${fmtEok(t.hi)} 미만 ${fmtEok(t.lo)} 이상`;

/**
 * 추정가격이 든 열의 배점표. 같은 배점이 나오는 표가 여럿이면 그대로 쓰고, 다르면 공고가 적용한다고 적은 별표의 표를 쓴다.
 * base 는 통과 점수·가격 산식·신인도 기준 등 나머지 값을 가져올 표 (규칙 파서 또는 기준표).
 */
export function tierSheet(text: string, estimated: number | undefined, base: EvalSheet): EvalSheet | undefined {
  if (!(estimated && estimated > 0)) return undefined;
  const picks: { t: TierTable; items: EvalItem[]; tier: Tier }[] = [];
  for (const t of findTierTables(text)) {
    const k = t.tiers.findIndex((x) => estimated >= x.lo && estimated < x.hi);
    if (k < 0) continue;
    const items = column(t, k);
    if (items) picks.push({ t, items, tier: t.tiers[k] });
  }
  if (!picks.length) return undefined;
  const key = (p: (typeof picks)[number]) => p.items.map((i) => `${i.label}:${i.max}`).join("|");
  let pick = picks[0];
  if (new Set(picks.map(key)).size > 1) {
    const cited = citedAnnexes(text);
    const hit = picks.filter((p) => p.t.annex && cited.has(p.t.annex));
    if (new Set(hit.map(key)).size !== 1) return undefined;
    pick = hit[0];
  }
  // 기준표에 같은 종류·같은 배점 항목이 있으면 등급별 점수표 등을 이어받는다
  const items = pick.items.map((i) => {
    const same = base.items.find((b) => b.kind === i.kind && b.max === i.max);
    return same ? { ...same, id: i.id, label: i.label, group: i.group, basis: i.basis } : i;
  });
  return {
    ...base,
    title: `공고 원문 평가표 (${base.method})`,
    items,
    source: "extracted",
    reader: undefined,
    confidence: "높음",
    priceFilled: undefined,
    notes: [
      `세부기준의 금액 구간 배점표에서 추정가격 ${estimated.toLocaleString("ko-KR")}원이 드는 '${tierName(pick.tier)}' 열을 썼습니다${pick.t.annex ? ` (별표 ${pick.t.annex})` : ""}.`,
    ],
  } as EvalSheet;
}
