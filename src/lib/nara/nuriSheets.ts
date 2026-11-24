import "server-only";
import type { Bid, BidAttachment } from "../types";
import { extractSheet, templateSheet, type EvalSheet } from "../evalscore";
import type { NuriBid, NuriSheet } from "../nuri";
import { download, dropRepeatedEntries, rankFiles, textOf } from "./attachText";
import { textCacheKey, type TextCache } from "./docExtract";
import { mapLimit } from "./client";

/**
 * 누리장터 민간 공고 첨부에서 평가 배점표를 읽는다 (빌드 때, 나라장터 첨부와 같은 본문 캐시).
 * 2026-11-24 진행 중 371건 실측: 첨부 본문은 355건 모두 읽힘, 합계 90~110점 배점표는 114건(적격심사제 223건 중 94, 제안서평가 108건 중 18).
 * 최고가·최저가와 정비사업 시공자 선정(총회 의결)은 배점표가 거의 없다. 읽은 표는 상세 화면에 항목·배점으로만 보여 준다.
 */
export const NURI_SHEET_AWARD = /^(적격심사|제안서)/;

export async function extractNuriSheets(bids: NuriBid[], cache: TextCache, budgetMs = 5 * 60_000): Promise<{ found: number; targets: number; read: number; failed: number; timedOut: boolean }> {
  const until = Date.now() + budgetMs;
  const targets = bids.filter((b) => NURI_SHEET_AWARD.test(b.award ?? "") && b.files.length && new Date(b.closeAt).getTime() > Date.now());
  const st = { found: 0, targets: targets.length, read: 0, failed: 0, timedOut: false };
  await mapLimit(targets, 6, async (b) => {
    const files: BidAttachment[] = rankFiles(b.files.map((f) => ({ name: f.name, url: f.url, kind: "규격서·기타" })));
    if (Date.now() > until && files.some((f) => cache.get(textCacheKey(f)) === undefined)) { st.timedOut = true; return; }
    const seen = new Set(files.map((f) => f.name.trim()));
    const texts: string[] = [];
    let best: { sheet: EvalSheet; file: string } | undefined;
    for (const f of files) {
      let t = cache.get(textCacheKey(f));
      if (t === undefined) {
        try {
          const buf = await download(f.url, 20_000);
          if (!buf) { st.failed++; continue; }
          t = await textOf(f, buf);
          cache.set(textCacheKey(f), t);
        } catch { st.failed++; continue; }
      }
      t = dropRepeatedEntries(t, seen);
      if (!t.trim()) continue;
      texts.push(t);
      const sheet = extractSheet(texts.join("\n"), templateSheet(pseudoBid(b)));
      if (sheet && (!best || rank(sheet) > rank(best.sheet))) best = { sheet, file: f.name };
    }
    if (texts.length) st.read++;
    const sheet = best && toNuriSheet(best.sheet, best.file);
    if (sheet) { b.sheet = sheet; st.found++; }
  });
  return st;
}

const rank = (s: EvalSheet) => ({ 높음: 3, 보통: 2, 낮음: 1 })[s.confidence] * 100 + s.items.length;

/** 배점표 판독용 가짜 공고 (평가 구조만 고른다: 제안서평가 → 협상, 그 밖 → 적격심사) */
const pseudoBid = (b: NuriBid) => ({
  contractMethod: /제안서/.test(b.award ?? "") ? "협상에 의한 계약" : "적격심사",
  bizType: b.biz === "기타" ? "용역" : b.biz,
  baseAmount: b.refAmount ?? b.budget ?? 0,
  category: b.category ?? "기타 용역",
  lowerLimitRate: 87.745,
}) as unknown as Pick<Bid, "contractMethod" | "bizType" | "baseAmount" | "category" | "lowerLimitRate">;

function toNuriSheet(s: EvalSheet, file: string): NuriSheet | undefined {
  const items = s.items.filter((i) => i.max > 0).map((i) => ({ group: i.group, label: i.label, max: i.max }));
  const total = Math.round(items.reduce((a, i) => a + i.max, 0) * 100) / 100;
  if (!items.length || total < 90 || total > 110) return undefined;
  return { file, total, items, pass: s.pass?.kind === "total" ? s.pass.score : undefined };
}
