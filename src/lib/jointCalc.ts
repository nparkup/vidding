/**
 * 공동도급(공동이행 방식) 지분 계산기 (/tools/joint). 브라우저 전용 계산, 서버 모듈을 쓰지 않는다.
 *
 * 보는 것
 * - 시공능력평가액 제한: 구성원마다 (추정금액 × 지분율) 이 자기 시공능력평가액 이내여야 한다 → 최대 참여비율 = 시평액 ÷ 추정금액
 * - 실적 제한: 공동이행 방식은 구성원 실적을 합산한다 (공고가 대표사 단독 실적을 요구하면 공고를 따른다)
 * - 구성원 최소 지분율, 지역의무 공동도급 비율(지역업체 지분 합)
 * - 지분율 합계 100%
 * 적격심사 점수(실적 합산·경영상태 지분 가중)는 입찰점수 예측의 공동수급 입력(src/lib/joint.ts)이 따로 계산한다.
 */

import { won as eok } from "@/lib/format";

export interface JointCalcBid {
  /** 추정가격(원) */
  est: number;
  /** 시공능력평가액과 견주는 금액(원). 보통 추정가격 + 부가가치세 + 관급자재. 0이면 추정가격 × 1.1 */
  estAmt: number;
  /** 기초금액(원). 0이면 추정금액 */
  base: number;
  /** 예상 투찰률(%) — 지분별 계약 금액 계산용 */
  bidRate: number;
  /** 시공능력평가액 제한 공고인지 */
  capLimit: boolean;
  /** 최소 필요 실적(원). 0이면 실적 제한 없음 */
  perfNeed: number;
  /** 구성원 최소 지분율(%) */
  minShare: number;
  /** 지역의무 공동도급: 지역업체 지분 합 하한(%). 0이면 없음 */
  regionDuty: number;
}

export interface JointCalcMember {
  name: string;
  /** 시공능력평가액(원) */
  cap: number;
  /** 해당 공종 실적(원) */
  perf: number;
  /** 지분율(%) */
  share: number;
  /** 공고가 정한 지역업체인지 */
  local: boolean;
}

export type Verdict = "ok" | "fail" | "na";

export interface MemberResult {
  /** 시평액으로 가능한 최대 참여비율(%) */
  maxShare: number;
  /** 이 구성원 지분에 해당하는 예상 계약 금액(원) */
  amount: number;
  capOk: Verdict;
  minOk: Verdict;
  issues: string[];
}

export interface JointCalcResult {
  estAmt: number;
  /** 예상 계약 금액(원) = 기초금액 × 예상 투찰률 */
  contract: number;
  /** 대표사(첫 구성원) 단독 참가 가능 여부와 사유 */
  solo: { ok: boolean; reasons: string[] };
  members: MemberResult[];
  shareSum: number;
  totalPerf: number;
  localShare: number;
  checks: { label: string; verdict: Verdict; detail: string }[];
  ok: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estAmountOf(b: JointCalcBid): number {
  return b.estAmt > 0 ? b.estAmt : Math.round(b.est * 1.1);
}

export function calcJoint(b: JointCalcBid, members: JointCalcMember[]): JointCalcResult {
  const estAmt = estAmountOf(b);
  const base = b.base > 0 ? b.base : estAmt;
  const contract = Math.round((base * (b.bidRate > 0 ? b.bidRate : 100)) / 100);
  const lead = members[0];

  const soloReasons: string[] = [];
  if (b.capLimit && lead && lead.cap < estAmt) soloReasons.push(`시공능력평가액 ${eok(lead.cap)}이 추정금액 ${eok(estAmt)}보다 작습니다`);
  if (b.perfNeed > 0 && lead && lead.perf < b.perfNeed) soloReasons.push(`실적 ${eok(lead.perf)}이 필요 실적 ${eok(b.perfNeed)}보다 작습니다`);
  if (b.regionDuty > 0) soloReasons.push(`지역의무 공동도급 공고라 지역업체와 함께 참가해야 합니다`);
  const solo = { ok: !!lead && soloReasons.length === 0, reasons: soloReasons };

  const res: MemberResult[] = members.map((m, i) => {
    const maxShare = b.capLimit && estAmt > 0 ? Math.min(100, r2((m.cap / estAmt) * 100)) : 100;
    const issues: string[] = [];
    const capOk: Verdict = !b.capLimit ? "na" : m.share <= maxShare + 1e-9 ? "ok" : "fail";
    if (capOk === "fail") issues.push(`시평액으로는 지분 ${maxShare}%까지만 참여할 수 있습니다`);
    const minOk: Verdict = members.length < 2 ? "na" : m.share >= b.minShare - 1e-9 ? "ok" : "fail";
    if (minOk === "fail") issues.push(`지분이 최소 ${b.minShare}%보다 작습니다`);
    if (i > 0 && m.share > (members[0]?.share ?? 0)) issues.push("대표사보다 지분이 큽니다 (공고에 따라 대표사가 최대 지분이어야 할 수 있습니다)");
    return { maxShare, amount: Math.round((contract * m.share) / 100), capOk, minOk, issues };
  });

  const shareSum = r2(members.reduce((s, m) => s + m.share, 0));
  const totalPerf = members.reduce((s, m) => s + m.perf, 0);
  const localShare = r2(members.filter((m) => m.local).reduce((s, m) => s + m.share, 0));
  const checks: JointCalcResult["checks"] = [
    { label: "지분율 합계", verdict: Math.abs(shareSum - 100) < 0.01 ? "ok" : "fail", detail: `${shareSum}% (100%여야 합니다)` },
    {
      label: "시공능력평가액",
      verdict: !b.capLimit ? "na" : res.every((r) => r.capOk !== "fail") ? "ok" : "fail",
      detail: b.capLimit ? `구성원마다 추정금액 ${eok(estAmt)} × 지분율 이내` : "제한 없음",
    },
    {
      label: "실적 합산",
      verdict: b.perfNeed > 0 ? (totalPerf >= b.perfNeed ? "ok" : "fail") : "na",
      detail: b.perfNeed > 0 ? `구성원 실적 합 ${eok(totalPerf)} / 필요 ${eok(b.perfNeed)}` : "제한 없음",
    },
    {
      label: "최소 지분율",
      verdict: members.length < 2 ? "na" : res.every((r) => r.minOk !== "fail") ? "ok" : "fail",
      detail: `구성원마다 ${b.minShare}% 이상`,
    },
    {
      label: "지역업체 지분",
      verdict: b.regionDuty > 0 ? (localShare >= b.regionDuty - 1e-9 ? "ok" : "fail") : "na",
      detail: b.regionDuty > 0 ? `지역업체 지분 합 ${localShare}% / 필요 ${b.regionDuty}% 이상` : "의무 없음",
    },
  ];
  return { estAmt, contract, solo, members: res, shareSum, totalPerf, localShare, checks, ok: checks.every((c) => c.verdict !== "fail") };
}

/**
 * 대표사 지분을 먼저 최대로 잡고, 남은 지분을 다른 구성원 시평 한도 안에서 앞에서부터 채운다.
 * 최소 지분·지역 의무를 맞추지 못하면 그대로 두고 판정에서 걸리게 한다.
 */
export function suggestShares(b: JointCalcBid, members: JointCalcMember[]): number[] {
  const estAmt = estAmountOf(b);
  const n = members.length;
  if (n === 0) return [];
  const max = members.map((m) => (b.capLimit && estAmt > 0 ? Math.min(100, Math.floor((m.cap / estAmt) * 100)) : 100));
  const minEach = n > 1 ? b.minShare : 0;
  const shares = members.map(() => minEach);
  let left = 100 - minEach * n;
  // 지역 의무: 지역업체에 먼저 의무 지분까지 채운다
  if (b.regionDuty > 0) {
    let need = b.regionDuty - members.reduce((s, m, i) => s + (m.local ? shares[i] : 0), 0);
    for (let i = 0; i < n && need > 0 && left > 0; i++) {
      if (!members[i].local) continue;
      const add = Math.min(need, left, max[i] - shares[i]);
      if (add > 0) { shares[i] += add; left -= add; need -= add; }
    }
  }
  for (let i = 0; i < n && left > 0; i++) {
    const add = Math.min(left, max[i] - shares[i]);
    if (add > 0) { shares[i] += add; left -= add; }
  }
  if (left > 0) shares[0] += left; // 시평 한도로 다 못 나누면 대표사에 남겨 판정에서 보이게 한다
  return shares.map(r2);
}
