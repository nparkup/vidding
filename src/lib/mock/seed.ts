import type { ClientProfile, Inquiry, WeeklyReport } from "../types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const SEED_CLIENTS: ClientProfile[] = [
  {
    id: "c-001", company: "(주)한빛전기통신", contactName: "김민수 대표", email: "bid@hanbit-elec.example", phone: "032-555-0101",
    licenses: ["전기공사업", "정보통신공사업"], regions: ["서울", "경기", "인천", "대전", "대구", "충남"], minAmount: 30_000_000, maxAmount: 1_500_000_000,
    categories: [], plan: "pro", status: "활성", joinedAt: daysAgo(94), watchlist: [], pastPerformance: 2_400_000_000, creditGrade: "BBB",
  },
  {
    id: "c-002", company: "누리소프트(주)", contactName: "이정희 실장", email: "sales@nurisoft.example", phone: "02-555-0144",
    licenses: ["소프트웨어사업자", "정보통신공사업"], regions: ["서울", "경기", "인천", "충남", "부산"], minAmount: 10_000_000, maxAmount: 800_000_000,
    categories: ["IT·소프트웨어", "전기·통신공사"], plan: "partner", status: "활성", joinedAt: daysAgo(210), watchlist: [], pastPerformance: 1_600_000_000, creditGrade: "A",
  },
  {
    id: "c-003", company: "새봄메디칼(주)", contactName: "박서윤 대표", email: "order@saebom-med.example", phone: "062-555-0177",
    licenses: ["의료기기판매업", "의약품도매상"], regions: ["광주", "전남", "경기", "강원"], minAmount: 5_000_000, maxAmount: 500_000_000,
    categories: [], plan: "basic", status: "활성", joinedAt: daysAgo(41), watchlist: [], pastPerformance: 900_000_000, creditGrade: "BB",
  },
  {
    id: "c-004", company: "대전종합시설관리(주)", contactName: "최우진 이사", email: "bid@dj-facility.example", phone: "042-555-0122",
    licenses: ["건물위생관리업", "기계설비유지관리업", "시설경비업"], regions: ["대전", "세종", "충남", "충북"], minAmount: 100_000_000, maxAmount: 2_500_000_000,
    categories: ["통합관리", "시설관리", "청소"], plan: "pro", status: "활성", joinedAt: daysAgo(160), watchlist: [], pastPerformance: 3_800_000_000, creditGrade: "A",
  },
  {
    id: "c-005", company: "다온건축(주)", contactName: "정하늘 소장", email: "daon@daon-build.example", phone: "031-555-0190",
    licenses: ["실내건축공사업", "건축공사업", "조경식재·시설물공사업"], regions: ["서울", "경기", "제주"], minAmount: 50_000_000, maxAmount: 2_000_000_000,
    categories: [], plan: "pro", status: "체험", joinedAt: daysAgo(6), watchlist: [], pastPerformance: 3_100_000_000, creditGrade: "BBB",
  },
];

export const SEED_INQUIRIES: Inquiry[] = [
  {
    id: "q-001", company: "에코푸드(주)", contactName: "윤가람", email: "eco@ecofood.example", phone: "010-5555-0190",
    licenses: ["식품판매업(집단급식소식품판매업)"], regions: ["충북", "충남", "세종"], minAmount: 5_000_000, maxAmount: 300_000_000,
    message: "학교급식 식재료 구매 공고 위주로 받고 싶습니다. 적격심사 서류 준비가 늘 어렵습니다.", createdAt: daysAgo(0), status: "신규",
  },
  {
    id: "q-002", company: "강원시설테크", contactName: "윤재석", email: "gw@gwtech.example", phone: "010-5555-0133",
    licenses: ["기계설비유지관리업", "전기공사업"], regions: ["강원"], minAmount: 20_000_000, maxAmount: 800_000_000,
    message: "기계설비 유지관리 공고만 따로 받을 수 있나요?", createdAt: daysAgo(1), status: "신규",
  },
  {
    id: "q-003", company: "한라엔지니어링", contactName: "고은비", email: "halla@halla-eng.example", phone: "010-5555-0166",
    licenses: ["건설엔지니어링업"], regions: ["제주", "전남"], minAmount: 10_000_000, maxAmount: 600_000_000,
    message: "", createdAt: daysAgo(3), status: "연락완료",
  },
];

export const SEED_REPORTS: WeeklyReport[] = [
  { id: "r-001", clientId: "c-002", weekLabel: "11월 1주차", createdAt: daysAgo(7), status: "발송완료", highlightBidIds: [], note: "지자체 정보화 협상계약 공고 2건 집중 검토 권장" },
  { id: "r-002", clientId: "c-001", weekLabel: "11월 1주차", createdAt: daysAgo(7), status: "발송완료", highlightBidIds: [], note: "수도권 공공시설 전기·통신 공사 공고 증가 추세" },
];
