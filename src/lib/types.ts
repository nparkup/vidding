// 입찰메이트LAB 도메인 타입

export type Region =
  | "서울" | "경기" | "인천" | "강원" | "충북" | "충남" | "대전" | "세종"
  | "전북" | "전남" | "광주" | "경북" | "경남" | "대구" | "울산" | "부산" | "제주" | "전국";

export const REGIONS: Region[] = [
  "서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종",
  "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주",
];

/**
 * 자주 요구되는 투찰가능업종(면허) — 고객 조건 입력용 선택지.
 * 공고의 면허는 나라장터 원문 업종명을 그대로 쓰므로 이 목록에 없는 업종도 있을 수 있다.
 * '엔지니어링사업'처럼 괄호 세부분야가 붙는 업종은 상위 이름만 고르면 모든 세부분야에 매칭된다.
 */
export const LICENSE_GROUPS: { group: string; items: string[] }[] = [
  { group: "청소·시설관리", items: ["건물위생관리업", "소독업", "시설경비업", "기계설비유지관리업", "소방시설관리업", "저수조청소업", "근로자파견사업"] },
  { group: "건설 공사", items: ["건축공사업", "토목공사업", "토목건축공사업", "실내건축공사업", "철근·콘크리트공사업", "지반조성·포장공사업", "도장·습식·방수·석공사업", "금속창호·지붕건축물조립공사업", "상·하수도설비공사업", "구조물해체·비계공사업", "조경식재·시설물공사업", "석면해체·제거업"] },
  { group: "전기·통신·설비", items: ["전기공사업", "정보통신공사업", "기계설비·가스공사업", "전문소방시설공사업", "일반소방시설공사업"] },
  { group: "IT·엔지니어링·연구", items: ["소프트웨어사업자", "엔지니어링사업", "건설엔지니어링업", "감리업", "건축사사무소", "안전진단전문기관", "측량업", "학술·연구용역"] },
  { group: "폐기물·환경", items: ["건설폐기물 수집·운반업", "건설폐기물 중간처리업", "폐기물수집·운반업", "폐기물중간처분업", "폐기물종합재활용업", "제1종 환경영향평가업"] },
  { group: "물품·기타", items: ["의료기기판매업", "의료기기제조업", "의약품판매업", "식품판매업", "식품제조·가공업", "인쇄사", "출판사", "종합여행업", "국내외여행업", "기타자유업", "시설대여업", "산림사업법인"] },
];
export const LICENSES: string[] = LICENSE_GROUPS.flatMap((g) => g.items);
export type License = string;

/** 업무 구분 (나라장터 bsnsDivNm) */
export type BizType = "용역" | "공사" | "물품" | "외자";
export const BIZ_TYPES: BizType[] = ["용역", "공사", "물품", "외자"];

/** 업종 분류: 업무 구분별로 묶는다. 청소·시설관리 5종은 기존 분석(노무비 등)과 연결된다 */
export const CATEGORY_GROUPS = {
  용역: ["청소", "시설관리", "경비", "방역·소독", "통합관리", "IT·소프트웨어", "설계·감리·엔지니어링", "연구·조사·컨설팅", "폐기물·환경", "행사·홍보·교육", "운송·여행·임차", "기타 용역"],
  공사: ["건축·토목공사", "전기·통신공사", "소방·기계설비공사", "조경·산림"],
  물품: ["의료·의약품", "식자재·급식", "컴퓨터·전산장비", "관급자재", "기타 물품"],
} as const;
export type ServiceCategory = (typeof CATEGORY_GROUPS)[keyof typeof CATEGORY_GROUPS][number];
export const CATEGORIES: ServiceCategory[] = Object.values(CATEGORY_GROUPS).flat();
/** 청소·시설관리 계열 업종 (용역근로자 보호지침 등 전용 분석 대상) */
export const FACILITY_CATEGORIES: ServiceCategory[] = ["청소", "시설관리", "경비", "방역·소독", "통합관리"];

export type ContractMethod = "적격심사" | "협상에 의한 계약" | "최저가" | "수의계약(소액)";

export interface Bid {
  id: string;               // bidNtceNo-bidNtceOrd
  bidNtceNo: string;
  bidNtceOrd: string;
  title: string;
  category: ServiceCategory;
  bizType?: BizType;        // 업무 구분 (없으면 용역)
  agency: string;           // 공고기관
  demandAgency: string;     // 수요기관
  region: Region;           // 참가가능지역 대표값 (전국 = 제한 없음)
  regions?: Region[];       // 참가가능지역이 여러 시·도일 때 전체 목록
  licenses: License[];      // 면허제한 (OR 조건)
  licenseRaw?: string;      // 나라장터 원문 투찰가능업종 (목록에 없는 업종 포함)
  baseAmount: number;       // 기초금액(원) / 추정가격
  contractMethod: ContractMethod;
  lowerLimitRate?: number;  // 낙찰하한율(%)
  jointContract: boolean;   // 공동도급 허용
  smallBizOnly: boolean;    // 중소기업 제한
  periodMonths: number;     // 용역·계약 기간
  postedAt: string;         // ISO
  closeAt: string;          // 입찰 마감 ISO
  openAt: string;           // 개찰 ISO
  briefingAt?: string;      // 현장설명회 ISO
  detailUrl: string;
  source: "mock" | "g2b";
  /** 과거 유사 공고 기반 통계 (낙찰정보서비스 연동 시 계산) */
  stats?: { avgBidders: number; avgWinRate: number };
}

/** 공고 첨부파일 (공고서·규격서). 파일은 나라장터에서 내려받는다 */
export interface BidAttachment {
  name: string;
  url: string;
  kind: "공고서" | "규격서·기타";
}

export interface ClientProfile {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  licenses: License[];
  regions: Region[];
  minAmount: number;
  maxAmount: number;
  categories: ServiceCategory[];
  plan: PlanId;
  status: "활성" | "체험" | "일시중지";
  joinedAt: string;
  watchlist: string[]; // 관심 공고 id
  /** 직전 3년 유사용역 실적 (원) — 적격심사 실적점수 추정용 */
  pastPerformance: number;
  creditGrade: "A" | "BBB" | "BB" | "B" | "CCC";
}

export type PlanId = "basic" | "pro" | "partner";

export interface Inquiry {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  licenses: License[];
  regions: Region[];
  minAmount: number;
  maxAmount: number;
  message: string;
  createdAt: string;
  status: "신규" | "연락완료" | "체험전환" | "보류";
}

export interface WeeklyReport {
  id: string;
  clientId: string;
  weekLabel: string;
  createdAt: string;
  status: "초안" | "발송완료";
  highlightBidIds: string[];
  note: string;
}

export interface MailLog {
  id: string;
  kind: "daily" | "weekly" | "test";
  clientId: string;
  to: string;
  subject: string;
  status: "발송" | "실패" | "미발송(SMTP 미설정)";
  error?: string;
  itemCount: number;
  createdAt: string;
}

export interface AppSettings {
  sendHour: number;
  sendOnWeekdaysOnly: boolean;
}
