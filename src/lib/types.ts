// 입찰파트너 도메인 타입

export type Region =
  | "서울" | "경기" | "인천" | "강원" | "충북" | "충남" | "대전" | "세종"
  | "전북" | "전남" | "광주" | "경북" | "경남" | "대구" | "울산" | "부산" | "제주" | "전국";

export const REGIONS: Region[] = [
  "서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종",
  "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주",
];

/** 청소·시설관리 업종에서 자주 요구되는 면허/업종 */
export const LICENSES = [
  "건물위생관리업",
  "소독업",
  "시설경비업",
  "기계설비유지관리업",
  "소방시설관리업",
  "전기공사업",
  "저수조청소업",
  "근로자파견사업",
  "조경식재공사업",
] as const;
export type License = (typeof LICENSES)[number];

export type ServiceCategory = "청소" | "시설관리" | "경비" | "방역·소독" | "통합관리";
export const CATEGORIES: ServiceCategory[] = ["청소", "시설관리", "경비", "방역·소독", "통합관리"];

export type ContractMethod = "적격심사" | "협상에 의한 계약" | "최저가" | "수의계약(소액)";

export interface Bid {
  id: string;               // bidNtceNo-bidNtceOrd
  bidNtceNo: string;
  bidNtceOrd: string;
  title: string;
  category: ServiceCategory;
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
  periodMonths: number;     // 용역 기간
  postedAt: string;         // ISO
  closeAt: string;          // 입찰 마감 ISO
  openAt: string;           // 개찰 ISO
  briefingAt?: string;      // 현장설명회 ISO
  detailUrl: string;
  source: "mock" | "g2b";
  /** 과거 유사 공고 기반 통계 (낙찰정보서비스 연동 시 계산) */
  stats?: { avgBidders: number; avgWinRate: number };
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
