import type { Bid } from "./types";

/**
 * 나라장터 공고의 계약방법(cntrctCnclsMthdNm)·낙찰방법(bidwinrDcsnMthdNm / sucsfbidMthdNm)으로
 * 누가 참가할 수 있는지, 낙찰자를 어떻게 정하는지를 정리한다.
 *
 * 2026-11 기준 최근 5영업일 공고 7,664건을 세어 보면 (입찰공고정보서비스, 업무 3종)
 * 소액수의견적 32%, 적격심사 25%, 협상 18%, 수의시담 10%, 규격가격동시입찰 8%, 제한적최저가 4%, 최저가 2% 순이다.
 *
 * 수의시담(입찰방식 '전자시담')은 공고기관이 계약상대자를 이미 정해 두고 그 업체와 가격을 협의하는 건이다.
 * 나라장터에도 "정보공개 차원에서 공고되는 것으로 계약대상자가 아닌 업체는 참가할 수 없습니다"라고 안내한다.
 * 수의시담(2인 이상)도 '2인 이상 지정업체의 견적에 의한 수의계약'이라 지정받은 업체만 견적을 낸다.
 * 이런 공고는 맞춤 공고·입찰점수 예측에서 뺀다.
 */
export type MethodFamily =
  | "수의시담"
  | "소액수의견적"
  | "적격심사"
  | "협상에 의한 계약"
  | "종합심사"
  | "규격가격동시입찰"
  | "2단계경쟁"
  | "제한적최저가"
  | "최저가"
  | "설계공모"
  | "일괄·대안입찰"
  | "기타";

export interface MethodProfile {
  family: MethodFamily;
  /** 일반 업체가 공고를 보고 참가할 수 있는지 */
  open: boolean;
  /** 참가할 수 없는 까닭 (open=false 일 때) */
  closedReason?: string;
  /** 누가 참가하는지 */
  who: string;
  /** 낙찰자를 정하는 방법 */
  decide: string;
  /** 입찰점수 예측에서 쓰는 방식: 배점표로 점수 계산 / 가격만 / 점수 예측 대상 아님 */
  scoring: "sheet" | "price" | "none";
}

const FAMILY: { family: MethodFamily; re: RegExp; who: string; decide: string; scoring: MethodProfile["scoring"]; open?: false; closed?: string }[] = [
  {
    family: "수의시담", re: /수의시담|시담/, open: false, scoring: "none",
    closed: "계약대상자가 정해진 수의시담 공고 (정보공개용, 지정 업체 외 참가 불가)",
    who: "공고기관이 정한 계약상대자(2인 이상 견적이면 지정받은 업체들)만",
    decide: "지정 업체와 가격을 협의(시담)해 예정가격 안에서 계약",
  },
  {
    family: "소액수의견적", re: /소액수의|수의견적|견적입찰/, scoring: "price",
    who: "업종·지역 자격을 갖춘 업체 누구나 전자견적 제출 (2인 이상 견적, 일부는 1인 견적 허용)",
    decide: "예정가격 이하이면서 낙찰하한율 이상인 견적 중 가장 낮은 금액",
  },
  {
    family: "설계공모", re: /설계공모/, scoring: "none",
    who: "공모 자격을 갖춘 설계자",
    decide: "설계안을 심사해 당선자와 설계계약 (가격 경쟁 아님)",
  },
  {
    family: "일괄·대안입찰", re: /일괄입찰|대안입찰|턴키/, scoring: "sheet",
    who: "설계·시공 자격을 함께 갖춘 업체",
    decide: "설계점수와 가격을 함께 평가",
  },
  {
    family: "종합심사", re: /종합심사|종합평가|종합낙찰/, scoring: "sheet",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "가격·수행능력·사회적 책임 등을 더한 종합점수가 가장 높은 업체",
  },
  {
    family: "적격심사", re: /적격심사/, scoring: "sheet",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "예정가격 이하 최저가 순으로 적격심사(실적·경영상태·가격 등)를 해 통과 점수(통상 85점, 공사는 92~95점)를 넘은 첫 업체",
  },
  {
    family: "협상에 의한 계약", re: /협상/, scoring: "sheet",
    who: "공고의 참가자격을 갖춘 업체 (제안서 제출)",
    decide: "제안서 기술평가와 가격평가를 더해 기술점수 85% 이상인 협상적격자 중 순위대로 협상",
  },
  {
    family: "규격가격동시입찰", re: /규격가격|규격.*동시/, scoring: "price",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "규격서를 심사해 적합한 업체(제안적격자) 중 예정가격 이하 최저가",
  },
  {
    family: "2단계경쟁", re: /2단계/, scoring: "price",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "먼저 규격·기술 입찰을 받아 통과한 업체만 가격입찰, 예정가격 이하 최저가",
  },
  {
    family: "제한적최저가", re: /제한적\s*최저가|낙찰하한율/, scoring: "price",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "예정가격 이하이면서 낙찰하한율 이상인 투찰 중 가장 낮은 금액 (평가 없음)",
  },
  {
    family: "최저가", re: /최저가/, scoring: "price",
    who: "공고의 참가자격을 갖춘 업체",
    decide: "예정가격 이하 가장 낮은 금액",
  },
];

const FALLBACK_FAMILY: Partial<Record<Bid["contractMethod"], MethodFamily>> = {
  "적격심사": "적격심사",
  "협상에 의한 계약": "협상에 의한 계약",
  "규격가격동시입찰": "규격가격동시입찰",
  "2단계경쟁": "2단계경쟁",
  "제한적최저가": "제한적최저가",
  "최저가": "최저가",
  "수의계약(소액)": "소액수의견적",
};

/** 계약방법(일반·제한·지명경쟁, 수의계약)에 따른 참가 범위 */
function contractWho(contract?: string): string | undefined {
  if (!contract) return undefined;
  if (contract.includes("지명")) return "발주기관이 지명해 통지한 업체만";
  if (contract.includes("제한")) return "업종·지역·실적 등 공고의 제한 조건을 갖춘 업체";
  if (contract.includes("일반")) return "자격을 갖춘 업체 누구나";
  return undefined;
}

export function methodProfile(bid: Pick<Bid, "contractMethod" | "awardRaw" | "contractType">): MethodProfile {
  const raw = bid.awardRaw ?? "";
  const hit = FAMILY.find((f) => f.re.test(raw));
  const contract = bid.contractType;
  const base: MethodProfile = hit
    ? { family: hit.family, open: hit.open !== false, closedReason: hit.closed, who: hit.who, decide: hit.decide, scoring: hit.scoring }
    : bid.contractMethod === "수의시담"
      ? { family: "수의시담", open: false, closedReason: FAMILY[0].closed, who: FAMILY[0].who, decide: FAMILY[0].decide, scoring: "none" }
      : {
          family: FALLBACK_FAMILY[bid.contractMethod] ?? "기타",
          open: true,
          who: "공고의 참가자격을 갖춘 업체",
          decide: "공고서의 낙찰자 결정 방법에 따름",
          scoring: bid.contractMethod === "적격심사" || bid.contractMethod === "협상에 의한 계약" ? "sheet" : "price",
        };
  // 지명경쟁은 낙찰방법이 무엇이든 지명받은 업체만 참가한다
  if (contract?.includes("지명") && base.open) {
    return { ...base, open: false, closedReason: "지명경쟁 공고 (발주기관이 지명한 업체만 참가)", who: contractWho(contract)! };
  }
  const who = base.family !== "수의시담" && base.family !== "소액수의견적" ? contractWho(contract) ?? base.who : base.who;
  return { ...base, who };
}

/** 참가 불가 공고의 짧은 표시 (목록 칩·제외 사유) */
export function closedLabel(bid: Pick<Bid, "contractMethod" | "awardRaw" | "contractType">): string | undefined {
  const p = methodProfile(bid);
  if (p.open) return undefined;
  return p.family === "수의시담" ? "수의시담 · 지정 업체만 참가" : "지명경쟁 · 지명 업체만 참가";
}

/** 일반 업체가 참가할 수 없는 공고면 그 까닭, 아니면 undefined */
export function closedReason(bid: Pick<Bid, "contractMethod" | "awardRaw" | "contractType">): string | undefined {
  const p = methodProfile(bid);
  return p.open ? undefined : p.closedReason;
}
