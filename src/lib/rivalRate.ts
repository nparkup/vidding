/**
 * 전년도 낙찰률 통계로 '예상 최저 경쟁 투찰률' 기본값을 정한다 (평가점수 예측, 협상계약 가격 점수).
 * 통계는 빌드 때 scripts/fetch-bids.ts 가 만든다(src/lib/nara/awardStats.ts). 이 파일은 화면과 빌드가 같이 쓴다.
 */
import type { Bid } from "./types";

export interface RateStat {
  /** 표본 수 (낙찰 건수) */
  n: number;
  /** 평균 낙찰률 (%) */
  mean: number;
  /** 중앙값 (%) */
  median: number;
}

export interface AwardStats {
  /** 기준 연도 (전년도) */
  year: number;
  /** 받은 자료 범위 (업무 중 가장 적게 받은 값): 낙찰 주 수, 공고 날 수 */
  coverage: { weeks: number; totalWeeks: number; noticeDays: number; totalNoticeDays: number };
  /** 업무|계약방법|금액대 → 통계. 금액대가 '*' 이면 금액대 구분 없이 합친 값 */
  strata: Record<string, RateStat>;
  builtAt: string;
}

export type StatBiz = "용역" | "공사" | "물품";
export type StatMethod = "적격심사" | "협상에 의한 계약";

/** 추정가격 금액대. 고시금액(용역 약 2.3억 원) 전후로 평가 구조와 경쟁 양상이 달라져 나눈다 */
export const BANDS: { key: string; label: string; max: number }[] = [
  { key: "a", label: "1억 원 미만", max: 100_000_000 },
  { key: "b", label: "1억~2.3억 원", max: 230_000_000 },
  { key: "c", label: "2.3억~10억 원", max: 1_000_000_000 },
  { key: "d", label: "10억~50억 원", max: 5_000_000_000 },
  { key: "e", label: "50억 원 이상", max: Infinity },
];

export const bandOf = (amount: number) => (BANDS.find((b) => amount < b.max) ?? BANDS[BANDS.length - 1]).key;
export const statKey = (biz: StatBiz, method: StatMethod, band: string) => `${biz}|${method}|${band}`;

/** 이보다 표본이 적으면 그 범위의 평균을 쓰지 않는다 */
export const MIN_SAMPLES = 20;

export interface RivalEstimate {
  rate: number;
  n: number;
  /** 화면 표시용: 어떤 공고들의 평균인지 */
  scope: string;
  year: number;
}

/** 같은 업무·계약방법·금액대 → 표본이 모자라면 금액대 구분 없이 → 그래도 모자라면 undefined (기본값 사용) */
export function estimateRival(stats: AwardStats | null | undefined, bid: Pick<Bid, "bizType" | "contractMethod" | "baseAmount">): RivalEstimate | undefined {
  if (!stats) return undefined;
  if (bid.contractMethod !== "적격심사" && bid.contractMethod !== "협상에 의한 계약") return undefined;
  const biz = (bid.bizType === "공사" || bid.bizType === "물품" ? bid.bizType : "용역") as StatBiz;
  const method = bid.contractMethod as StatMethod;
  const band = BANDS.find((b) => b.key === bandOf(bid.baseAmount))!;
  const exact = stats.strata[statKey(biz, method, band.key)];
  if (exact && exact.n >= MIN_SAMPLES) return { rate: exact.mean, n: exact.n, scope: `${biz} · ${method} · 추정가격 ${band.label}`, year: stats.year };
  const wide = stats.strata[statKey(biz, method, "*")];
  if (wide && wide.n >= MIN_SAMPLES) return { rate: wide.mean, n: wide.n, scope: `${biz} · ${method} (금액대 표본이 적어 전체 금액)`, year: stats.year };
  return undefined;
}
