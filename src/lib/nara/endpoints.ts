/**
 * 공공데이터포털(data.go.kr) 조달청 나라장터 OpenAPI 목록.
 * 각 서비스는 공공데이터포털에서 "활용신청"을 해야 같은 인증키로 호출할 수 있다.
 * 2025년 개편 이후 경로(/ad, /as, /ao)를 사용한다.
 * approved: 현재 계정의 활용신청 승인 여부 (개발계정). 사전규격은 2026-11-11, 나머지는 2026-11-08 승인.
 * 그 밖에 승인된 관련 서비스: 발주계획현황서비스(재발주 예측), 업종 및 근거법규서비스(면허 코드 매핑), 사용자정보 서비스.
 */
export const NARA_BASE = "https://apis.data.go.kr/1230000";

export const NARA_APIS = [
  {
    key: "bidPublic",
    name: "조달청_나라장터 입찰공고정보서비스",
    datasetId: "15129394",
    path: "/ad/BidPublicInfoService",
    required: true,
    approved: true,
    usage: "용역 공고 목록·참가가능지역·면허제한·기초금액 수집 (매일 선별의 원천 데이터)",
    operations: {
      serviceList: "getBidPblancListInfoServc",
      region: "getBidPblancListInfoPrtcptPsblRgn",
      license: "getBidPblancListInfoLicenseLimit",
      baseAmount: "getBidPblancListInfoServcBsisAmount",
    },
  },
  {
    key: "scsbid",
    name: "조달청_나라장터 낙찰정보서비스",
    datasetId: "15129397",
    path: "/as/ScsbidInfoService",
    required: false,
    approved: true,
    usage: "과거 유사 공고의 낙찰률·참여업체 수 → 입찰 가능성 점수·투찰 가이드",
    operations: {
      serviceResult: "getScsbidListSttusServc",
      serviceOpening: "getOpengResultListInfoServc",
    },
  },
  {
    key: "preSpec",
    name: "조달청_나라장터 사전규격정보서비스",
    datasetId: "15129437",
    path: "/ao/HrcspSsstndrdInfoService",
    required: false,
    approved: true,
    usage: "본공고 전 사전규격 알림 → 고객이 미리 서류를 준비",
    operations: {
      serviceList: "getPublicPrcureThngInfoServc",
    },
  },
  {
    key: "contract",
    name: "조달청_나라장터 계약정보서비스",
    datasetId: "15129427",
    path: "/ao/CntrctInfoService",
    required: false,
    approved: true,
    usage: "발주기관별 기존 계약 이력 → 재발주 시기 예측·현 수행업체 파악",
    operations: {
      serviceList: "getCntrctInfoListServc",
    },
  },
] as const;

/** 청소·시설관리 업종 판별 키워드 (공고명 기준 1차 분류) */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "청소": ["청소", "미화", "환경정비", "위생관리"],
  "시설관리": ["시설관리", "시설물", "유지관리", "기계설비", "전기설비", "소방", "저수조", "승강기"],
  "경비": ["경비", "보안", "주차관리"],
  "방역·소독": ["방역", "소독", "방제"],
  "통합관리": ["통합관리", "종합관리", "청소 및 경비", "청소 및 시설"],
};
