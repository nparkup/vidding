import type { Bid, BizType, ContractMethod, License, Region, ServiceCategory } from "../types";

/**
 * 나라장터 API 키가 없을 때 사용하는 목업 공고 (청소·시설관리 용역 + 다른 업종 용역·공사·물품).
 * 날짜는 "오늘" 기준 상대값으로 만들어 항상 최신 데이터처럼 보이게 한다.
 */
type Seed = {
  title: string;
  category: ServiceCategory;
  biz?: BizType;
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
  { title: "농업기술센터 조경 및 시설관리 용역", category: "시설관리", agency: "경상북도 안동시", region: "경북", licenses: ["조경식재·시설물공사업", "기계설비유지관리업"], amount: 27500, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 7, small: true, bidders: 15 },
  { title: "2027년 세종청사 별관 미화용역", category: "청소", agency: "행정안전부 정부청사관리본부", region: "세종", licenses: ["건물위생관리업"], amount: 92400, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 13, small: true, briefing: true, bidders: 31 },
  { title: "항만 여객터미널 환경미화 용역", category: "청소", agency: "울산항만공사", region: "울산", licenses: ["건물위생관리업"], amount: 41500, method: "적격심사", months: 12, postedDaysAgo: 5, closeInDays: 1, small: true, bidders: 27 },
  { title: "도립공원 탐방안내소 청소 및 시설관리", category: "통합관리", agency: "제주특별자치도", region: "제주", licenses: ["건물위생관리업"], amount: 19600, method: "적격심사", months: 12, postedDaysAgo: 1, closeInDays: 8, small: true, bidders: 12 },
  { title: "교육지원청 관내 학교 저수조 청소", category: "시설관리", agency: "전라남도교육청", region: "전남", licenses: ["저수조청소업"], amount: 9800, method: "적격심사", months: 3, postedDaysAgo: 0, closeInDays: 6, small: true, bidders: 19 },
  { title: "2027년 구립 체육시설 6개소 청소용역", category: "청소", agency: "서울특별시 송파구", region: "서울", licenses: ["건물위생관리업"], amount: 57800, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 5, small: true, bidders: 46 },
  { title: "산업단지 공공폐수처리시설 운영관리 용역", category: "시설관리", agency: "한국산업단지공단", region: "전국", licenses: ["기계설비유지관리업", "전기공사업"], amount: 310000, method: "협상에 의한 계약", months: 36, postedDaysAgo: 4, closeInDays: 18, joint: true, bidders: 6 },
  { title: "2027년 통합 홈페이지 유지관리 용역", category: "IT·소프트웨어", agency: "경기도 안산시", region: "경기", licenses: ["소프트웨어사업자"], amount: 21400, method: "협상에 의한 계약", months: 12, postedDaysAgo: 1, closeInDays: 9, small: true, bidders: 11 },
  { title: "행정정보시스템 노후 서버 교체 및 유지보수", category: "IT·소프트웨어", agency: "충청남도 천안시", region: "충남", licenses: ["정보통신공사업", "소프트웨어사업자"], amount: 38200, method: "적격심사", months: 12, postedDaysAgo: 0, closeInDays: 6, bidders: 17 },
  { title: "도시계획도로 개설공사 실시설계 용역", category: "설계·감리·엔지니어링", agency: "전라북도 익산시", region: "전북", licenses: ["건설엔지니어링업"], amount: 46800, method: "적격심사", months: 10, postedDaysAgo: 2, closeInDays: 8, bidders: 23 },
  { title: "2027년 지역관광 활성화 전략 수립 연구용역", category: "연구·조사·컨설팅", agency: "강원특별자치도 강릉시", region: "전국", licenses: ["학술·연구용역"], amount: 9500, method: "협상에 의한 계약", months: 6, postedDaysAgo: 1, closeInDays: 10, bidders: 9 },
  { title: "석면철거공사 지정폐기물 운반 및 처리용역", category: "폐기물·환경", agency: "대전광역시교육청", region: "대전", licenses: ["폐기물수집·운반업(지정폐기물)", "폐기물중간처분업(지정폐기물)"], amount: 3200, method: "수의계약(소액)", months: 2, postedDaysAgo: 0, closeInDays: 4, bidders: 8 },
  { title: "2027 시민의 날 기념행사 대행 용역", category: "행사·홍보·교육", agency: "경상남도 김해시", region: "경남", licenses: ["기타자유업(행사대행업)"], amount: 14000, method: "협상에 의한 계약", months: 3, postedDaysAgo: 3, closeInDays: 7, bidders: 13 },
  { title: "2027학년도 2학년 수학여행 위탁 용역", category: "운송·여행·임차", agency: "서울특별시교육청", demand: "서울한빛고등학교", region: "서울", licenses: ["종합여행업", "국내외여행업"], amount: 6700, method: "적격심사", months: 1, postedDaysAgo: 1, closeInDays: 5, bidders: 21 },
  { title: "한빛초 교실 환경개선 실내건축공사", category: "건축·토목공사", biz: "공사", agency: "경기도교육청", region: "경기", licenses: ["실내건축공사업"], amount: 42300, method: "적격심사", months: 2, postedDaysAgo: 0, closeInDays: 6, small: true, bidders: 112 },
  { title: "체육관 냉난방기 교체 전기공사", category: "전기·통신공사", biz: "공사", agency: "인천광역시 서구", region: "인천", licenses: ["전기공사업"], amount: 8900, method: "적격심사", months: 2, postedDaysAgo: 1, closeInDays: 4, small: true, bidders: 140 },
  { title: "청사 스프링클러 설치 소방공사", category: "소방·기계설비공사", biz: "공사", agency: "부산광역시 사하구", region: "부산", licenses: ["전문소방시설공사업", "일반소방시설공사업(기계)"], amount: 17600, method: "적격심사", months: 3, postedDaysAgo: 2, closeInDays: 7, small: true, bidders: 76 },
  { title: "2026년 산불예방 숲가꾸기사업", category: "조경·산림", biz: "공사", agency: "경상북도 봉화군", region: "경북", licenses: ["산림사업법인(숲가꾸기 및 병해충방제)"], amount: 12800, method: "적격심사", months: 3, postedDaysAgo: 1, closeInDays: 5, small: true, bidders: 34 },
  { title: "2027년 1~6월 학교급식 식재료(공산품) 구매", category: "식자재·급식", biz: "물품", agency: "충청북도 청주시", demand: "한빛중학교", region: "충북", licenses: ["식품판매업(집단급식소식품판매업)"], amount: 7400, method: "적격심사", months: 6, postedDaysAgo: 0, closeInDays: 3, small: true, bidders: 28 },
  { title: "보건소 진료재료 연간 단가계약", category: "의료·의약품", biz: "물품", agency: "광주광역시 광산구", region: "광주", licenses: ["의료기기판매업"], amount: 5300, method: "적격심사", months: 12, postedDaysAgo: 2, closeInDays: 6, small: true, bidders: 19 },
  { title: "행정용 노트북 120대 구매", category: "컴퓨터·전산장비", biz: "물품", agency: "세종특별자치시", region: "전국", licenses: [], amount: 19800, method: "적격심사", months: 1, postedDaysAgo: 1, closeInDays: 8, bidders: 15 },
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
      bizType: s.biz ?? "용역",
      agency: s.agency,
      demandAgency: s.demand ?? s.agency,
      region: s.region,
      licenses: s.licenses,
      licenseRaw: s.licenses.join(", ") || undefined,
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
