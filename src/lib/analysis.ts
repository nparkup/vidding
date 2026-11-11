import type { Bid, ClientProfile, ContractMethod, License, Region } from "./types";
import { FACILITY_CATEGORIES } from "./types";
import { hasAnyLicense } from "./licenses";

/** 매칭에 필요한 최소 조건 (공개 사이트 미리보기와 고객 프로필 공용) */
export interface MatchCriteria {
  licenses: License[];
  regions: Region[];
  minAmount: number;
  maxAmount: number;
  pastPerformance?: number;
  creditGrade?: ClientProfile["creditGrade"];
}

export type Grade = "S" | "A" | "B" | "C" | "제외";

export interface Factor {
  label: string;
  score: number; // 0~max
  max: number;
  note: string;
  ok: boolean;
}

export interface MatchResult {
  bid: Bid;
  eligible: boolean;
  score: number; // 0~100
  grade: Grade;
  factors: Factor[];
  blockers: string[];
  daysLeft: number;
}

/** 업종이 많으면 앞의 3개만 보여준다 */
function short(list: string[], sep = ", "): string {
  return list.length > 3 ? `${list.slice(0, 3).join(sep)} 외 ${list.length - 3}개` : list.join(sep);
}

const isFacility = (bid: Bid) => FACILITY_CATEGORIES.includes(bid.category);
const bizOf = (bid: Bid) => bid.bizType ?? "용역";
/** 업무 구분별 실적 명칭 */
const perfWord = (bid: Bid) => (bizOf(bid) === "공사" ? "시공" : bizOf(bid) === "용역" ? "용역 수행" : "납품");

export function daysLeft(iso: string, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000);
}

/**
 * 1차 선별(면허·지역·금액) + 입찰 가능성 점수.
 * - 면허/지역은 하드 조건: 하나라도 안 맞으면 참가 불가.
 * - 금액은 고객이 수행 가능한 규모 범위.
 * - 경쟁강도·실적·마감 여유를 가중해 0~100점으로 산출.
 */
export function evaluate(bid: Bid, c: MatchCriteria, now = new Date()): MatchResult {
  const blockers: string[] = [];
  const factors: Factor[] = [];
  const left = daysLeft(bid.closeAt, now);

  const licenseOk = bid.licenses.length === 0 ? !bid.licenseRaw : hasAnyLicense(c.licenses, bid.licenses);
  // 업종 제한이 없는 공고는 누구나 참가할 수 있지만, 보유 면허와 직접 맞는 공고를 더 위에 둔다
  const openToAll = bid.licenses.length === 0 && !bid.licenseRaw;
  factors.push({
    label: "면허 요건",
    score: licenseOk ? (openToAll ? 22 : 30) : 0,
    max: 30,
    ok: licenseOk,
    note: licenseOk
      ? openToAll ? "업종 제한 없음 (누구나 참가 가능)" : `보유 면허로 참가 가능 (${short(bid.licenses)})`
      : `필요 면허 미보유: ${short(bid.licenses, " 또는 ") || bid.licenseRaw}`,
  });
  if (!licenseOk) blockers.push("면허 요건 미충족");

  const regionOk = bid.region === "전국" || (bid.regions ?? [bid.region]).some((r) => c.regions.includes(r));
  factors.push({
    label: "참가 지역",
    score: regionOk ? 20 : 0,
    max: 20,
    ok: regionOk,
    note: regionOk ? `${bid.region === "전국" ? "지역 제한 없음" : `${bid.region} 소재 업체 참가 가능`}` : `${bid.region} 지역 제한 공고`,
  });
  if (!regionOk) blockers.push("지역 제한");

  const amountOk = bid.baseAmount >= c.minAmount && bid.baseAmount <= c.maxAmount;
  const amountNear = !amountOk && bid.baseAmount <= c.maxAmount * 1.5 && bid.jointContract;
  factors.push({
    label: "사업 규모",
    score: amountOk ? 15 : amountNear ? 8 : 0,
    max: 15,
    ok: amountOk || amountNear,
    note: amountOk
      ? "수행 가능 규모 범위 내"
      : amountNear
        ? "규모 초과, 공동도급으로 참여 가능"
        : bid.baseAmount < c.minAmount
          ? "희망 규모보다 작은 공고"
          : "수행 가능 규모 초과",
  });
  if (!amountOk && !amountNear) blockers.push("규모 범위 밖");

  // 경쟁강도: 과거 평균 참여업체 수
  const bidders = bid.stats?.avgBidders ?? 25;
  const compScore = Math.round(15 * Math.min(1, Math.max(0.2, 1 - (bidders - 5) / 55)));
  factors.push({
    label: "경쟁 강도",
    score: compScore,
    max: 15,
    ok: compScore >= 8,
    note: `유사 공고 평균 ${bidders}개사 참여`,
  });

  // 실적/신용 (적격심사·협상에서 중요)
  const perf = c.pastPerformance ?? 0;
  const perfRatio = bid.baseAmount > 0 ? perf / bid.baseAmount : 0;
  const perfScore = perf ? Math.round(2 + 8 * Math.min(1, perfRatio / 2)) : 2;
  factors.push({
    label: "실적·신용",
    score: perfScore,
    max: 10,
    ok: perfScore >= 7,
    note: perf
      ? `유사실적 ${perfRatio >= 2 ? "200% 이상" : `${Math.round(perfRatio * 100)}% 수준`} (기초금액 대비)${c.creditGrade ? `, 신용 ${c.creditGrade}` : ""}`
      : "실적 정보 미입력 (보수적으로 평가)",
  });

  // 준비 기간
  const timeScore = left <= 0 ? 0 : Math.min(10, Math.round(left * 1.2));
  factors.push({
    label: "준비 기간",
    score: timeScore,
    max: 10,
    ok: left >= 4,
    note: left <= 0 ? "마감됨" : `마감까지 ${left}일`,
  });
  if (left <= 0) blockers.push("마감");

  const eligible = blockers.length === 0;
  const raw = factors.reduce((s, f) => s + f.score, 0);
  const score = eligible ? raw : Math.min(raw, 39);
  const grade: Grade = !eligible ? "제외" : score >= 85 ? "S" : score >= 72 ? "A" : score >= 58 ? "B" : "C";

  return { bid, eligible, score, grade, factors, blockers, daysLeft: left };
}

export function rank(bids: Bid[], c: MatchCriteria, now = new Date()): MatchResult[] {
  return bids
    .map((b) => evaluate(b, c, now))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

/** 투찰 가이드: 기초금액 × 예정가격 범위(±2%) × 낙찰하한율 */
export function bidPriceGuide(bid: Bid) {
  const rate = (bid.lowerLimitRate ?? bid.stats?.avgWinRate ?? 88) / 100;
  const low = Math.round(bid.baseAmount * 0.98 * rate);
  const high = Math.round(bid.baseAmount * 1.02 * rate);
  const center = Math.round(bid.baseAmount * rate * 1.0015);
  return { rate: rate * 100, low, high, center };
}

/** 계약방법별 제출서류 체크리스트 */
export function documentChecklist(bid: Bid): { group: string; items: { name: string; note?: string; required: boolean }[] }[] {
  const common = [
    { name: "나라장터 경쟁입찰참가자격 등록", note: "입찰 마감 전일까지 등록·변경 완료", required: true },
    { name: "공동인증서(범용/조달청용)", note: "전자입찰용, 유효기간 확인", required: true },
    { name: "사업자등록증", required: true },
    ...(bid.licenses.length <= 1
      ? bid.licenses.map((l) => ({ name: `${l} 등록증(신고증)`, note: "공고상 업종코드와 일치 여부 확인", required: true }))
      : [{ name: "투찰가능업종 등록증(신고증) 중 1개", note: `다음 중 하나 보유: ${bid.licenses.join(", ")}`, required: true }]),
  ];
  if (bid.smallBizOnly) common.push({ name: "중소기업(소상공인) 확인서", note: "중소기업현황정보시스템 발급, 유효기간 확인", required: true });

  const byMethod: Record<ContractMethod, { name: string; note?: string; required: boolean }[]> = {
    "적격심사": [
      { name: "적격심사 신청서", required: true },
      { name: `${perfWord(bid)}실적 증명서`, note: `최근 3년(또는 5년) 유사 ${bizOf(bid) === "공사" ? "공사" : bizOf(bid) === "용역" ? "용역" : "물품"}, 발주기관 발급`, required: true },
      { name: "신용평가등급 확인서", note: "공고일 이전 평가, 유효기간 내", required: true },
      { name: "기술인력 보유현황 및 재직증명", required: false },
      ...(isFacility(bid) ? [{ name: "노무비 지급 확약서·근로조건 이행계획서", note: "청소·경비 용역 필수 (용역근로자 보호지침)", required: true }] : []),
      ...(bizOf(bid) === "공사" ? [{ name: "건설업 등록증·건설공제조합 출자증권", note: "시공능력평가액 확인", required: true }] : []),
      { name: "고용개선·신인도 가점 증빙", note: "여성/장애인기업, 고용우수기업 등", required: false },
    ],
    "협상에 의한 계약": [
      { name: "제안서 (정성평가용)", note: "업무수행계획·인력운영·품질관리·안전관리", required: true },
      { name: "제안서 요약본 및 발표자료", required: true },
      { name: "정량평가 증빙 (실적·인력·신용)", required: true },
      { name: "가격제안서", note: "별도 봉인 또는 전자 제출", required: true },
      { name: "청렴서약서·보안각서", required: true },
    ],
    "최저가": [
      { name: "산출내역서", required: true },
      { name: "입찰금액 적정성 자료", note: "저가 투찰 시 요구", required: false },
    ],
    "수의계약(소액)": [
      { name: "견적서", required: true },
      { name: "수의계약 각서", required: true },
      { name: "청렴계약 이행서약서", required: true },
    ],
  };

  const after = [
    { name: "계약보증금 (보증보험증권)", note: "낙찰 후 10일 이내", required: true },
    { name: bizOf(bid) === "물품" || bizOf(bid) === "외자" ? "납품계획서·규격서" : bizOf(bid) === "공사" ? "산출내역서·공정표·현장대리인 지정" : "산출내역서·인력배치계획", required: true },
    { name: "4대보험 가입증명", required: bizOf(bid) !== "물품" },
  ];

  return [
    { group: "입찰 참가 전", items: common },
    { group: `${bid.contractMethod} 제출서류`, items: byMethod[bid.contractMethod] },
    { group: "낙찰 후 계약 시", items: after },
  ];
}

/** 공고 핵심 체크포인트 (분석 요약용 문장) */
export function keyPoints(bid: Bid): string[] {
  const pts: string[] = [];
  if (bid.region !== "전국") pts.push(`${bid.region} 소재 업체만 참가할 수 있는 지역제한 공고입니다.`);
  if (bid.smallBizOnly) pts.push("중소기업 제한경쟁: 중소기업 확인서가 필요합니다.");
  if (bid.jointContract) pts.push("공동도급(공동수급) 허용: 규모가 크면 컨소시엄 구성을 검토하세요.");
  if (bid.briefingAt) pts.push("현장설명회 참석이 필요할 수 있습니다. 일정을 확인하세요.");
  if (bid.contractMethod === "협상에 의한 계약") pts.push("제안서 평가 비중이 높아 준비 기간을 충분히 확보해야 합니다.");
  if (bid.contractMethod === "적격심사") pts.push(`적격심사 통과(통상 85점 이상) 후 낙찰하한율 ${bid.lowerLimitRate ?? 87.745}% 이상 최저가 순으로 결정됩니다.`);
  if (bid.category === "청소" || bid.category === "경비") pts.push("용역근로자 근로조건 보호지침 적용 대상: 노무비 산정 기준을 확인하세요.");
  return pts;
}
