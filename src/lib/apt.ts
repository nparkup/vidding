/**
 * 공동주택(아파트) 입찰공고 한 건. 수집: src/lib/kapt/client.ts (국토교통부_공동주택 입찰공고·입찰결과공지 정보제공 서비스),
 * 화면: /apt-bids. 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다.
 * 응찰업체 담당자 이름·전화는 받지도 저장하지도 않는다.
 */
/** 화면에서 고르는 분야 (K-apt 입찰분류 기준) */
export const APT_CATEGORIES = ["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "기타 용역", "주택관리(위탁)", "공사", "물품·기타"] as const;
export type AptCategory = (typeof APT_CATEGORIES)[number];

export interface AptPrior {
  /** 직전 낙찰 공고명 */
  title: string;
  /** 낙찰금액(원) */
  amount: number;
  /** 계약기간 YYYY-MM-DD */
  start?: string;
  end?: string;
  /** 그 공고의 입찰 마감일 (YYYY-MM-DD) */
  closedAt?: string;
}

export interface AptBid {
  /** K-apt 입찰번호 */
  no: string;
  aptCode: string;
  /** 단지명 ("(입대의)"가 붙으면 입주자대표회의 명의) */
  apt: string;
  /** 시·도 (K-apt 표기, 예: 서울, 경기, 전남광주) */
  region: string;
  title: string;
  content?: string;
  category: AptCategory;
  /** 입찰분류 원문 (예: 사업자 · 용역 · 청소) */
  classLabel: string;
  /** 공고일 YYYY-MM-DD */
  postedAt: string;
  /** 입찰 마감 ISO (KST) */
  closeAt: string;
  /** 신규공고·수정공고·재공고 */
  state: string;
  /** 일반경쟁·제한경쟁·지명경쟁 */
  kind?: string;
  /** 적격심사·최저낙찰 등 */
  award?: string;
  /** 전자입찰·직접입찰 */
  way?: string;
  /** 입찰 시스템 (K-APT, 조달청, 민간 전자입찰 이름) */
  system?: string;
  urgent?: boolean;
  briefingAt?: string;
  briefingPlace?: string;
  docs?: string;
  docsBy?: string;
  guarantee?: boolean;
  payTerms?: string;
  /** 첨부파일 번호 (aptFileUrl) */
  files?: string[];
  /** 같은 단지·같은 분야의 직전 낙찰 (입찰결과공지) */
  prior?: AptPrior;
}

export interface AptBidsFile {
  builtAt: string;
  items: AptBid[];
  /** 직전 낙찰을 찾아본 낙찰 건수 (입찰결과공지, 최근 2년) */
  awards?: number;
}

/** K-apt 지역 순서 (화면 선택지) */
export const APT_REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남광주", "경북", "경남", "제주"];

/** K-apt 첨부파일 내려받기 */
export const aptFileUrl = (seq: string) => `https://www.k-apt.go.kr/bid/bidFileDownload.do?file_type=bid&file_num=${encodeURIComponent(seq)}`;
/** K-apt 입찰공고 상세 */
export const aptDetailUrl = (no: string) => `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${encodeURIComponent(no)}`;
