import type { ClientProfile, Inquiry, WeeklyReport } from "../types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const SEED_CLIENTS: ClientProfile[] = [
  {
    id: "c-001", company: "(주)한빛클린서비스", contactName: "김민수 대표", email: "contact@hanbit-clean.example", phone: "031-555-0101",
    licenses: ["건물위생관리업", "소독업"], regions: ["경기", "서울", "인천"], minAmount: 50_000_000, maxAmount: 700_000_000,
    categories: ["청소", "방역·소독"], plan: "pro", status: "활성", joinedAt: daysAgo(94), watchlist: [], pastPerformance: 1_200_000_000, creditGrade: "BBB",
  },
  {
    id: "c-002", company: "대전종합시설관리(주)", contactName: "이정희 실장", email: "bid@dj-facility.example", phone: "042-555-0144",
    licenses: ["건물위생관리업", "기계설비유지관리업", "시설경비업"], regions: ["대전", "세종", "충남", "충북"], minAmount: 100_000_000, maxAmount: 2_500_000_000,
    categories: ["통합관리", "시설관리", "청소"], plan: "partner", status: "활성", joinedAt: daysAgo(210), watchlist: [], pastPerformance: 3_800_000_000, creditGrade: "A",
  },
  {
    id: "c-003", company: "바른방역", contactName: "박서윤 대표", email: "barun@barun-pest.example", phone: "062-555-0177",
    licenses: ["소독업"], regions: ["광주", "전남"], minAmount: 5_000_000, maxAmount: 150_000_000,
    categories: ["방역·소독"], plan: "basic", status: "활성", joinedAt: daysAgo(41), watchlist: [], pastPerformance: 180_000_000, creditGrade: "BB",
  },
  {
    id: "c-004", company: "부산세이프가드", contactName: "최우진 이사", email: "safe@busan-guard.example", phone: "051-555-0122",
    licenses: ["시설경비업", "건물위생관리업"], regions: ["부산", "울산", "경남"], minAmount: 30_000_000, maxAmount: 900_000_000,
    categories: ["경비", "청소"], plan: "pro", status: "체험", joinedAt: daysAgo(6), watchlist: [], pastPerformance: 640_000_000, creditGrade: "BBB",
  },
];

export const SEED_INQUIRIES: Inquiry[] = [
  {
    id: "q-001", company: "그린빌딩케어", contactName: "정하늘", email: "green@greencare.example", phone: "010-5555-0190",
    licenses: ["건물위생관리업"], regions: ["서울", "경기"], minAmount: 30_000_000, maxAmount: 500_000_000,
    message: "학교·공공청사 청소용역 위주로 받고 싶습니다. 적격심사 서류 준비가 늘 어렵습니다.", createdAt: daysAgo(0), status: "신규",
  },
  {
    id: "q-002", company: "강원시설테크", contactName: "윤재석", email: "gw@gwtech.example", phone: "010-5555-0133",
    licenses: ["기계설비유지관리업", "전기공사업"], regions: ["강원"], minAmount: 20_000_000, maxAmount: 800_000_000,
    message: "기계설비 유지관리 공고만 따로 받을 수 있나요?", createdAt: daysAgo(1), status: "신규",
  },
  {
    id: "q-003", company: "제주클린", contactName: "고은비", email: "jeju@jejuclean.example", phone: "010-5555-0166",
    licenses: ["건물위생관리업", "소독업"], regions: ["제주"], minAmount: 10_000_000, maxAmount: 300_000_000,
    message: "", createdAt: daysAgo(3), status: "연락완료",
  },
];

export const SEED_REPORTS: WeeklyReport[] = [
  { id: "r-001", clientId: "c-002", weekLabel: "11월 1주차", createdAt: daysAgo(7), status: "발송완료", highlightBidIds: [], note: "통합관리 대형 공고 2건 집중 검토 권장" },
  { id: "r-002", clientId: "c-001", weekLabel: "11월 1주차", createdAt: daysAgo(7), status: "발송완료", highlightBidIds: [], note: "경기 남부 체육시설 청소 공고 증가 추세" },
];
