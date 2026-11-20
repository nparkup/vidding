/**
 * 최근 낙찰 결과 목록 (/awards). 빌드(scripts/awards/forBuild.ts recentAwardsFromR2)가 낙찰 저장소(R2)의
 * 최근 원자료(낙찰·공고·기초금액·예정가격·개찰 순위)를 합쳐 /recent-awards.json 으로 낸다.
 * 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다.
 */
import type { AwardBiz } from "./awards/format";

/** 목록에 담는 기간(일) */
export const RECENT_AWARD_DAYS = 31;
/** 개찰 순위 몇 위까지 싣는지 (파일 크기 때문에 3위까지) */
export const RECENT_TOP = 3;

/** 개찰 순위 한 줄: [순위, 업체명, 투찰금액(원), 투찰률(%)] */
export type RecentTop = [rank: number, name: string, amount: number, rate: number];

/** 낙찰 한 건. 파일 크기를 줄이려고 배열로 싣는다 */
export type RecentAwardRow = [
  /** 공고번호 */ no: string,
  /** 차수 */ ord: string,
  biz: AwardBiz,
  title: string,
  /** 수요기관 */ agency: string,
  /** 최종낙찰일 YYYY-MM-DD */ date: string,
  /** 참가업체 수 */ bidders: number,
  /** 낙찰업체 */ winner: string,
  /** 낙찰업체 사업자번호 */ bizno: string,
  /** 낙찰금액(원) */ amount: number,
  /** 낙찰률(%, 예정가격 대비), 없으면 0 */ rate: number,
  /** 기초금액(원), 없으면 0 */ base: number,
  /** 예정가격(원), 없으면 0 */ plnprc: number,
  /** 계약방법 (일반경쟁 / 적격심사 등), 없으면 "" */ method: string,
  /** 낙찰하한율(%), 없으면 0 */ lwlt: number,
  /** 개찰 순위 1~3위, 없으면 [] */ top: RecentTop[],
];

export interface RecentAwardsFile {
  /** 목록 기간 YYYY-MM-DD */
  from: string;
  to: string;
  builtAt: string;
  rows: RecentAwardRow[];
}

/** 사정율(예정가격 ÷ 기초금액 × 100). 둘 중 하나라도 없으면 undefined */
export function assessRate(r: RecentAwardRow): number | undefined {
  const [, , , , , , , , , , , base, plnprc] = r;
  if (!(base > 0 && plnprc > 0)) return undefined;
  const v = (plnprc / base) * 100;
  return v > 80 && v < 120 ? Math.round(v * 10000) / 10000 : undefined;
}

/** 계약방법 문자열을 목록 필터 묶음으로 */
export function methodGroup(method: string): "적격심사" | "협상" | "최저가" | "수의" | "기타" {
  if (/협상/.test(method)) return "협상";
  if (/적격/.test(method)) return "적격심사";
  if (/수의/.test(method)) return "수의";
  if (/최저/.test(method)) return "최저가";
  return "기타";
}
