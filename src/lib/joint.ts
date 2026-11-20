/**
 * 적격심사 공동수급(공동이행 방식) 점수 계산.
 * - 시공·용역·납품 실적: 구성원 실적을 모두 더해 평가한다
 * - 신용평가·경영상태: 구성원별 점수에 지분율을 곱해 더한다
 * - 그 밖의 항목(가격, 신뢰도 가감점 등): 대표사(우리 회사) 기준
 * 공고마다 세부기준이 다를 수 있어 화면에 "공동이행 방식 기준"이라고 밝힌다.
 */
import { passWindow, predict, type CompanyInput, type CreditGrade, type EvalSheet, type Prediction } from "./evalscore";
import type { Bid } from "./types";

export interface JointMember {
  id: string;
  name: string;
  /** 지분율 (%) */
  share: number;
  /** 유사 실적 (원) */
  perf: number;
  credit: CreditGrade | "없음";
  equity?: number;
  current?: number;
}

/** 지분율 가중으로 합치는 항목 */
const WEIGHTED = new Set(["credit", "finance"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface JointPrediction extends Prediction {
  joint: { ourShare: number; totalPerf: number; members: number };
}

export function jointPredict(sheet: EvalSheet, bid: Pick<Bid, "baseAmount" | "lowerLimitRate">, co: CompanyInput, members: JointMember[]): JointPrediction {
  const totalPerf = co.pastPerformance + members.reduce((a, m) => a + Math.max(0, m.perf), 0);
  const ourShare = Math.max(0, 100 - members.reduce((a, m) => a + Math.max(0, m.share), 0));
  const perfSource = [co.perfSource, members.length ? `구성원 ${members.length}곳 실적 합산` : ""].filter(Boolean).join(" + ") || undefined;
  const base = predict(sheet, bid, { ...co, pastPerformance: totalPerf, perfSource });
  if (!members.length) return { ...base, joint: { ourShare: 100, totalPerf, members: 0 } };
  const mem = members.map((m) => predict(sheet, bid, { ...co, corpName: m.name, pastPerformance: totalPerf, creditGrade: m.credit, equityRatio: m.equity, currentRatio: m.current }));
  let delta = 0;
  const items = base.items.map((it, idx) => {
    if (!WEIGHTED.has(it.kind) || it.unknown) return it;
    const parts = [{ name: "우리 회사", share: ourShare, score: it.score }, ...members.map((m, j) => ({ name: m.name || `구성원 ${j + 1}`, share: m.share, score: mem[j].items[idx]?.score ?? 0 }))];
    const score = round2(parts.reduce((a, p) => a + (p.share * p.score) / 100, 0));
    delta += score - it.score;
    return {
      ...it,
      score,
      ratio: it.max > 0 ? score / it.max : it.ratio,
      lost: Math.max(0, round2(it.max - score)),
      reason: `지분율 가중 합산: ${parts.map((p) => `${p.name} ${p.share}% × ${p.score}점`).join(", ")}`,
    };
  });
  const total = round2(base.total + delta);
  let { passed, gap } = base;
  if (sheet.pass?.kind === "total" && !base.pending) {
    passed = total >= sheet.pass.score - 1e-6;
    gap = round2(total - sheet.pass.score);
  }
  const priceItem = items.find((i) => i.kind === "price");
  const rateWindow = base.pending ? undefined : passWindow(sheet, bid, total - (priceItem?.score ?? 0));
  return { ...base, items, total, passed, gap, rateWindow, joint: { ourShare, totalPerf, members: members.length } };
}
