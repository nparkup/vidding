import type { Bid, ContractMethod, License, Region, ServiceCategory } from "../types";

/**
 * 나라장터 API 키가 없을 때 사용하는 청소·시설관리 용역 목업 공고.
 * 날짜는 "오늘" 기준 상대값으로 만들어 항상 최신 데이터처럼 보이게 한다.
 */
type Seed = {
  title: string;
  category: ServiceCategory;
  agency: string;
  demand?: string;
  region: Region;
  licenses: License[];
  amount: number; // 만원
  method: ContractMethod;
  months: number;
  postedDaysAgo: number;
  closeInDays: number;
  joint?: boolean;
  small?: boolean;
  briefing?: boolean;
  bidders: number;
};

const SEEDS: Seed[] = [
  { title: "2027년 본청사 및 별관 청소용역", category: "청소", agency: "경기도 수원시", region: "경기", licenses: ["건물위생관리업"], amount: 48600, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 6, small: true, briefing: true, bidders: 37 },
  { title: "2027년 시민회관 시설물 통합관리 용역", category: "통합관리", agency: "인천광역시 남동구", region: "인천", licenses: ["건물위생관리업", "시설경비업"], amount: 126000, method: "협상에 의한 계약", months: 24, postedDaysAgo: 1, closeInDays: 12, joint: true, bidders: 9 },
  { title: "국민체육센터 미화 및 소독 위탁용역", category: "청소", agency: "서울특별시 강서구", region: "서울", licenses: ["건물위생관리업", "소독업"], amount: 31200, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 4, small: true, bidders: 52 },
  { title: "2027년 공공도서관 4개관 청소용역", category: "청소", agency: "대전광역시 서구", region: "대전", licenses: ["건물위생관리업"], amount: 39800, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 3, small: true, bidders: 44 },
  { title: "하수처리장 기계설비 유지관리 용역", category: "시설관리", agency: "충청남도 아산시", region: "충남", licenses: ["기계설비유지관리업"], amount: 87500, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 9, bidders: 18 },
  { title: "행정복지센터 15개소 방역소독 용역", category: "방역·소독", agency: "경기도 화성시", region: "경기", licenses: ["소독업"], amount: 8400, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 5, small: true, bidders: 61 },
  { title: "2027년 청사 경비 및 주차관리 용역", category: "경비", agency: "부산광역시 해운대구", region: "부산", licenses: ["시설경비업"], amount: 54300, method: "적격심사", months: 12, postedDaysAgo: 3, closeInDays: 2, small: true, bidders: 29 },
  { title: "공공청사 소방시설 종합정밀점검 용역", category: "시설관리", agency: "경상남도 창원시", region: "경남", licenses: ["소방시설관리업"], amount: 6200, method: "수의계약(소액)", months: 1, postedDaysAgo: 1, closeInDays: 3, bidders: 14 },
  { title: "국립대학교 학생회관 청소 및 시설관리 용역", category: "통합관리", agency: "조달청 대전지방조달청", demand: "국립한밭대학교", region: "전국", licenses: ["건물위생관리업"], amount: 215000, method: "협상에 의한 계약", months: 36, postedDaysAgo: 2, closeInDays: 15, joint: true, briefing: true, bidders: 7 },
  { title: "2027년 보건소 및 분소 청소용역", category: "청소", agency: "강원특별자치도 원주시", region: "강원", licenses: ["건물위생관리업"], amount: 22800, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 7, small: true, bidders: 33 },
  { title: "정수장 저수조 청소 및 수질검사 용역", category: "시설관리", agency: "경기도 용인시", region: "경기", licenses: ["저수조청소업"], amount: 4700, method: "수의계약(소액)", months: 1, postedDaysAgo: 0, closeInDays: 2, bidders: 11 },
  { title: "종합운동장 시설물 관리 및 미화 용역", category: "통합관리", agency: "전라북도 전주시", region: "전북", licenses: ["건물위생관리업", "기계설비유지관리업"], amount: 98000, method: "적격심사", months: 12, postedDaysAgo: 4, closeInDays: 8, joint: true, bidders: 21 },
  { title: "2027년 구청사 전기설비 유지관리 용역", category: "시설관리", agency: "서울특별시 노원구", region: "서울", licenses: ["전기공사업"], amount: 18900, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 6, small: true, bidders: 26 },
  { title: "지하철역사 환경미화 용역(2공구)", category: "청소", agency: "대구교통공사", region: "대구", licenses: ["건물위생관리업"], amount: 172000, method: "적격심사", months: 24, postedDaysAgo: 2, closeInDays: 10, joint: true, bidders: 16 },
  { title: "어린이집 및 경로당 방역소독 연간 단가계약", category: "방역·소독", agency: "광주광역시 북구", region: "광주", licenses: ["소독업"], amount: 6900, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 4, small: true, bidders: 48 },
  { title: "시립병원 청소 및 환자이송 보조 용역", category: "청소", agency: "경기도 성남시", region: "경기", licenses: ["건물위생관리업", "근로자파견사업"], amount: 134000, method: "협상에 의한 계약", months: 24, postedDaysAgo: 3, closeInDays: 11, joint: true, briefing: true, bidders: 8 },
  { title: "2027년 문화예술회관 청소 및 경비 용역", category: "통합관리", agency: "충청북도 청주시", region: "충북", licenses: ["건물위생관리업", "시설경비업"], amount: 66700, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 9, small: true, bidders: 24 },
  { title: "공영주차장 8개소 청소 및 관리 용역", category: "청소", agency: "인천광역시 부평구", region: "인천", licenses: ["건물위생관리업"], amount: 14300, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 5, small: true, bidders: 39 },
  { title: "농업기술센터 조경 및 시설관리 용역", category: "시설관리", agency: "경상북도 안동시", region: "경북", licenses: ["조경식재공사업", "기계설비유지관리업"], amount: 27500, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 7, small: true, bidders: 15 },
  { title: "2027년 세종청사 별관 미화용역", category: "청소", agency: "행정안전부 정부청사관리본부", region: "세종", licenses: ["건물위생관리업"], amount: 92400, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 13, small: true, briefing: true, bidders: 31 },
  { title: "항만 여객터미널 환경미화 용역", category: "청소", agency: "울산항만공사", region: "울산", licenses: ["건물위생관리업"], amount: 41500, method: "적격심사", months: 12, postedDaysAgo: 5, closeInDays: 1, small: true, bidders: 27 },
  { title: "도립공원 탐방안내소 청소 및 시설관리", category: "통합관리", agency: "제주특별자치도", region: "제주", licenses: ["건물위생관리업"], amount: 19600, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 8, small: true, bidders: 12 },
  { title: "교육지원청 관내 학교 저수조 청소", category: "시설관리", agency: "전라남도교육청", region: "전남", licenses: ["저수조청소업"], amount: 9800, method: "적격심사", months: 3, postedDaysAgo: 0, closeInDays: 6, small: true, bidders: 19 },
  { title: "2027년 구립 체육시설 6개소 청소용역", category: "청소", agency: "서울특별시 송파구", region: "서울", licenses: ["건물위생관리업"], amount: 57800, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 5, small: true, bidders: 46 },
  { title: "산업단지 공공폐수처리시설 운영관리 용역", category: "시설관리", agency: "한국산업단지공단", region: "전국", licenses: ["기계설비유지관리업", "전기공사업"], amount: 310000, method: "협상에 의한 계약", months: 36, postedDaysAgo: 4, closeInDays: 18, joint: true, bidders: 6 },
  { title: "시청 및 의회 청사 경비용역", category: "경비", agency: "경기도 고양시", region: "경기", licenses: ["시설경비업"], amount: 76300, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 7, small: true, bidders: 22 },
];

const BIDDER_WIN_RATE: Record<ContractMethod, number> = {
  "적격심사": 87.745,
  "협상에 의한 계약": 91.2,
  "최저가": 79.995,
  "수의계약(소액)": 88.0,
};

function atKst(base: Date, addDays: number, hour: number, minute = 0): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + addDays);
  // KST(UTC+9) 기준 시각으로 맞춘다
  d.setUTCHours(hour - 9, minute, 0, 0);
  return d.toISOString();
}

export function buildMockBids(now = new Date()): Bid[] {
  const yyyy = now.getUTCFullYear();
  return SEEDS.map((s, i) => {
    const no = `R${String(yyyy).slice(2)}BK${String(1040000 + i * 137).padStart(8, "0")}`;
    const ord = "000";
    const closeAt = atKst(now, s.closeInDays, 10);
    return {
      id: `${no}-${ord}`,
      bidNtceNo: no,
      bidNtceOrd: ord,
      title: s.title,
      category: s.category,
      agency: s.agency,
      demandAgency: s.demand ?? s.agency,
      region: s.region,
      licenses: s.licenses,
      baseAmount: s.amount * 10000,
      contractMethod: s.method,
      lowerLimitRate: s.method === "적격심사" ? 87.745 : s.method === "수의계약(소액)" ? 88 : undefined,
      jointContract: !!s.joint,
      smallBizOnly: !!s.small,
      periodMonths: s.months,
      postedAt: atKst(now, -s.postedDaysAgo, 9, 30),
      closeAt,
      openAt: atKst(now, s.closeInDays, 11),
      briefingAt: s.briefing ? atKst(now, Math.max(1, Math.floor(s.closeInDays / 2)), 14) : undefined,
      detailUrl: "https://www.g2b.go.kr",
      source: "mock",
      stats: { avgBidders: s.bidders, avgWinRate: BIDDER_WIN_RATE[s.method] },
    } satisfies Bid;
  });
}
