/**
 * 공공데이터포털 서비스 식별자(End Point 마지막 경로) → 포털에 등록된 공식 한글 명칭.
 * 2026-11-24 data.go.kr 각 데이터 상세 화면의 제목과 End Point를 대조해 옮겼다. 괄호 안은 데이터 번호.
 * 목록에 없는 서비스는 관리자 화면에 식별자만 보인다 (추측으로 이름을 붙이지 않음).
 */
export const DATA_GO_KR_NAMES: Record<string, string> = {
  BidPublicInfoService02: "조달청_나라장터 입찰공고정보서비스", // 15129394
  PubDataOpnStdService: "조달청_나라장터 공공데이터개방표준서비스", // 15058815
  ScsbidInfoService: "조달청_나라장터 낙찰정보서비스", // 15129397
  CntrctInfoService: "조달청_나라장터 계약정보서비스", // 15129427
  UsrInfoService02: "조달청_나라장터 사용자정보 서비스", // 15129466
  HrcspSsstndrdInfoService: "조달청_나라장터 사전규격정보서비스", // 15129437
  OrderPlanSttusService: "조달청_나라장터 발주계획현황서비스", // 15129462
  IndstrytyBaseLawrgltInfoService: "조달청_나라장터 업종 및 근거법규서비스", // 15129467
  PriceInfoService: "조달청_나라장터 가격정보현황서비스", // 15129415
  CntrctProcssIntgOpenService: "조달청_나라장터 계약과정통합공개서비스", // 15129459
  ShoppingMallPrdctInfoService: "조달청_나라장터쇼핑몰 품목정보 서비스", // 15129471
  PrcrmntReqInfoService: "조달청_나라장터 조달요청서비스", // 15129468
  PubPrcrmntStatInfoService: "조달청_공공조달통계정보서비스", // 15129412
  PrvtBidNtceService: "조달청_누리장터 민간입찰공고서비스", // 15129456
  PrvtScsbidInfoService: "조달청_누리장터 민간낙찰정보_서비스", // 15129458
  PrvtCntrctInfoService: "조달청_누리장터 민간계약정보 서비스", // 15129469
  ApHusBidPblAncInfoOfferServiceV3: "국토교통부_공동주택 입찰공고 정보제공 서비스", // 15058166
  ApHusBidResultNoticeInfoOfferServiceV3: "국토교통부_공동주택 입찰결과공지 정보제공 서비스", // 15059177
  ApHusPrvCntrNoticeInfoOfferServiceV3: "국토교통부_공동주택 수의계약 공지 정보제공 서비스", // 15057758
  GetCorpBasicInfoService_V2: "금융위원회_기업기본정보", // 15043184
  GetFinaStatInfoService_V2: "금융위원회_기업 재무정보", // 15043459
  smppCertInfo: "주식회사한국중소벤처기업유통원_공공구매종합정보망 인증서 정보 제공 서비스", // 15062581
  // KIPRIS Plus (plus.kipris.or.kr, 키는 KIPRIS Plus에서 발급). 이름은 KIPRIS Plus 데이터 상세 화면 제목
  CorpBsApplicantService: "KIPRIS Plus 출원인 법인",
  patUtiModInfoSearchSevice: "KIPRIS Plus 특허·실용 공개·등록공보",
  hospInfoServicev2: "건강보험심사평가원_병원정보서비스", // 15001698
};

export const dataGoKrName = (svc: string): string | undefined => DATA_GO_KR_NAMES[svc];
