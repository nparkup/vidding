/**
 * 업종별 경영상태 평균비율 (/tools/finance). 적격심사 경영상태 평가에서 업체 비율을 견주는 업종 평균값.
 * 협회가 매년 7월에 공시한다. 새 공시가 나오면 이 파일의 값과 기준·적용 기간만 바꾸면 된다.
 *
 * 출처
 * - 종합건설업: 대한건설협회 법령·통계 > 평균비율 "2025년도 종합건설업체의 경영상태 평균비율" (cak.or.kr, 2026-11-20 확인)
 * - 전문건설업: 대한전문건설협회 2026-07-01 공시 "2025년도 전문건설업 경영상태 평균비율" (대한전문건설신문 2026-07-01 기사로 확인)
 * - 기계설비·가스, 전기, 정보통신, 소방: 협회 원문을 아직 대조하지 못한 값 (verified: false). 화면에 "원문 대조 전"으로 표시한다
 */

export interface FinanceAvg {
  group: "종합건설" | "전문건설" | "설비·전기·통신·소방";
  name: string;
  /** 이 업종에 속하는 옛 업종명·다른 이름 (검색용) */
  aliases?: string[];
  /** 부채비율(%) */
  debt: number;
  /** 유동비율(%) */
  current: number;
  /** 그 밖의 비율 (종합건설만 공시) */
  extra?: { label: string; value: number; unit: "%" | "배" | "회" }[];
  /** 자료 기준 연도 말 */
  basisYear: number;
  /** 적용 시작 (입찰공고일 기준) YYYY-MM-DD */
  from: string;
  source: string;
  verified: boolean;
}

const KOSCA = "대한전문건설협회 2026-07-01 공시";
const CAK = "대한건설협회 2025년도 종합건설업체 경영상태 평균비율";
const spec = (name: string, debt: number, current: number, aliases: string[] = []): FinanceAvg => ({
  group: "전문건설", name, aliases, debt, current, basisYear: 2025, from: "2026-07-01", source: KOSCA, verified: true,
});

export const FINANCE_AVG: FinanceAvg[] = [
  {
    group: "종합건설", name: "종합건설업", aliases: ["토건", "토목", "건축", "토목건축", "조경", "산업환경설비"],
    debt: 104.94, current: 139.21, basisYear: 2025, from: "2026-07-01", source: CAK, verified: true,
    extra: [
      { label: "차입금의존도", value: 20.6, unit: "%" },
      { label: "영업이익대비 이자보상배율", value: 3.35, unit: "배" },
      { label: "매출액영업이익율", value: 4.85, unit: "%" },
      { label: "매출액순이익율", value: 4.49, unit: "%" },
      { label: "총자산순이익율", value: 2.88, unit: "%" },
      { label: "총자산대비 영업현금흐름비율", value: 2.55, unit: "%" },
      { label: "자산회전율", value: 0.67, unit: "회" },
      { label: "건설기술개발투자비율", value: 0.08, unit: "%" },
    ],
  },
  spec("전문건설업 전체", 97.87, 144.73, ["시설물유지관리"]),
  spec("지반조성·포장공사업", 62.85, 210.35, ["토공", "포장", "보링그라우팅", "보링·그라우팅·파일"]),
  spec("실내건축공사업", 59.4, 169.14, ["실내건축"]),
  spec("금속·창호·지붕·건축물조립공사업", 68.53, 157.22, ["금속구조물창호", "금속창호", "지붕판금", "건축물조립"]),
  spec("도장·습식·방수·석공사업", 61.7, 176.74, ["도장", "습식방수", "석공", "미장방수조적"]),
  spec("조경식재·시설물공사업", 70.23, 137.82, ["조경식재", "조경시설물"]),
  spec("철근·콘크리트공사업", 66.65, 205.73, ["철콘", "철근콘크리트"]),
  spec("구조물해체·비계공사업", 57.45, 153.55, ["비계", "구조물해체", "비계구조물해체"]),
  spec("상·하수도설비공사업", 52.98, 232.41, ["상하수도"]),
  spec("철도·궤도공사업", 161.21, 154.38, ["철도궤도"]),
  spec("철강구조물공사업", 129.23, 127.28, ["강구조물", "철강재설치"]),
  spec("수중·준설공사업", 130.91, 161.52, ["수중", "준설"]),
  spec("승강기·삭도공사업", 62.08, 123.26, ["승강기", "삭도"]),
  { group: "설비·전기·통신·소방", name: "기계설비·가스공사업", aliases: ["기계설비", "가스시설", "기계가스"], debt: 99.95, current: 133.44, basisYear: 2025, from: "2026-07-01", source: "대한기계설비건설협회 공시 (원문 대조 전)", verified: false },
  { group: "설비·전기·통신·소방", name: "전기공사업", aliases: ["전기"], debt: 120.77, current: 142.57, basisYear: 2025, from: "2026-07-31", source: "한국전기공사협회 공시 (원문 대조 전)", verified: false },
  { group: "설비·전기·통신·소방", name: "정보통신공사업", aliases: ["통신"], debt: 123.74, current: 137.1, basisYear: 2025, from: "2026-07-31", source: "한국정보통신공사협회 공시 (원문 대조 전)", verified: false },
  { group: "설비·전기·통신·소방", name: "소방시설공사업", aliases: ["소방"], debt: 103.66, current: 141.08, basisYear: 2025, from: "2026-07-31", source: "한국소방시설협회 공시 (원문 대조 전)", verified: false },
];

export interface FinanceCheck {
  /** 업종 평균 대비 (%) */
  debtVsAvg?: number;
  currentVsAvg?: number;
  /** 만점 조건을 채우는지 */
  debtFull?: boolean;
  currentFull?: boolean;
  /** 만점이 되는 경계값 (%) */
  debtLimit: number;
  currentLimit: number;
}

/**
 * 조달청 시설공사 적격심사 경영상태(재무비율) 만점 조건.
 * 추정가격 10억원 이상: 부채비율이 업종 평균의 50% 미만, 유동비율이 업종 평균의 150% 이상.
 * 10억원 미만: 부채비율이 업종 평균의 100% 미만, 유동비율이 업종 평균의 100% 이상.
 * 행정안전부(지자체)·공기업 기준은 구간과 배점이 다르므로 공고 기준을 확인하도록 화면에 적는다.
 */
export function checkFinance(avg: FinanceAvg, big: boolean, debt?: number, current?: number): FinanceCheck {
  const debtLimit = Math.round(avg.debt * (big ? 0.5 : 1) * 100) / 100;
  const currentLimit = Math.round(avg.current * (big ? 1.5 : 1) * 100) / 100;
  const pct = (a: number, b: number) => Math.round((a / b) * 1000) / 10;
  return {
    debtLimit,
    currentLimit,
    debtVsAvg: debt !== undefined ? pct(debt, avg.debt) : undefined,
    currentVsAvg: current !== undefined ? pct(current, avg.current) : undefined,
    debtFull: debt !== undefined ? debt < debtLimit : undefined,
    currentFull: current !== undefined ? current >= currentLimit : undefined,
  };
}
