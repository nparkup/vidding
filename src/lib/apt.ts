/**
 * 공동주택(아파트) 입찰공고 한 건. 수집: src/lib/kapt/client.ts (국토교통부_공동주택 입찰공고·입찰결과공지 정보제공 서비스),
 * 화면: /apt-bids. 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다.
 * 응찰업체 담당자 이름·전화는 받지도 저장하지도 않는다.
 */
import type { AptPriceModel } from "./aptPrice";

/** 화면에서 고르는 분야 (K-apt 입찰분류 기준) */
export const APT_CATEGORIES = ["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "기타 용역", "주택관리(위탁)", "공사", "물품·기타"] as const;
export type AptCategory = (typeof APT_CATEGORIES)[number];

export interface AptPrior {
  /** 낙찰(경쟁입찰) 또는 수의계약 */
  via?: "낙찰" | "수의계약";
  /** 직전 낙찰 공고명 / 수의계약 계약명 */
  title: string;
  /** 낙찰금액·계약금액(원) */
  amount: number;
  /** 수의계약 업체명 (대표자·주소·전화는 저장하지 않는다) */
  company?: string;
  /** 계약기간 YYYY-MM-DD */
  start?: string;
  end?: string;
  /** 그 공고의 입찰 마감일 또는 수의계약 계약일 (YYYY-MM-DD) */
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
  /** 민간 전자입찰 공고면 그 시스템의 공고 주소 */
  link?: string;
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
  /** 낙찰 결과로 본 예측 (아파트 예측 화면). 빌드 때 src/lib/kapt/history.ts 가 붙인다 */
  history?: AptHistory;
}

/**
 * K-apt 분류에서 '주택관리업자' 입찰에 광고물·재활용품·헌옷 수거 같은 잡수입 계약도 섞여 있다.
 * 이런 계약과 관리·용역 계약은 금액과 업체가 전혀 달라 서로 비교하지 않는다.
 */
const SIDE = /(광고|전단|재활용|헌옷|의류|폐지|수거|알뜰|게시판|현수막|중고|고철)/;
export const isSideDeal = (title: string) => SIDE.test(title);

/** 지난 낙찰·수의계약 한 건 (업체는 이름만, 담당자 이름·전화는 받지 않는다) */
export interface AptPastDeal {
  no: string;
  via: "낙찰" | "수의계약";
  /** 입찰 마감일 또는 계약일 YYYY-MM-DD */
  date: string;
  title: string;
  /** 단지명 (비슷한 낙찰에만) */
  apt?: string;
  amount: number;
  /** 낙찰 업체·수의계약 업체 */
  winner?: string;
  /** 응찰 업체 수 (낙찰만, 응찰업체 조회로 센다) */
  bidders?: number;
  /** 응찰 업체 이름 (같은 단지 낙찰만). K-apt는 투찰금액·순위를 공개하지 않아 이름만 있다 */
  entrants?: string[];
  start?: string;
  end?: string;
}

export interface AptHistory {
  /** 같은 단지·같은 업종 지난 계약 (최근순) */
  same: AptPastDeal[];
  /** 같은 지역·같은 업종에서 금액이 비슷한 최근 낙찰 (같은 단지 제외, 최근순) */
  similar: AptPastDeal[];
  /** 경쟁 강도: 같은 단지·비슷한 낙찰의 응찰 업체 수 */
  competition?: { level: "낮음" | "보통" | "높음"; median: number; avg: number; n: number; text: string };
  /** 참가 예상 기업: 같은 단지·비슷한 낙찰에 응찰·낙찰한 업체 */
  likely?: { name: string; sameWins: number; sameBids: number; wins: number; bids: number }[];
}

export interface AptBidsFile {
  builtAt: string;
  items: AptBid[];
  /** 직전 낙찰을 찾아본 낙찰 건수 (입찰결과공지, 최근 3개 연도) */
  awards?: number;
  /** 함께 찾아본 수의계약 건수 (수의계약 공지) */
  privates?: number;
  /** 입찰가격 예측 비율·검증 (src/lib/aptPrice.ts) */
  pricing?: AptPriceModel;
}

/** K-apt 지역 순서 (화면 선택지) */
export const APT_REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남광주", "경북", "경남", "제주"];

/** K-apt 첨부파일 내려받기 */
export const aptFileUrl = (seq: string) => `https://www.k-apt.go.kr/bid/bidFileDownload.do?file_type=bid&file_num=${encodeURIComponent(seq)}`;
/** K-apt 입찰공고 상세 */
export const aptDetailUrl = (no: string) => `https://www.k-apt.go.kr/bid/bidDetail.do?bidNum=${encodeURIComponent(no)}`;
