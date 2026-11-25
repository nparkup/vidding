/**
 * 누리장터 민간 입찰 (조달청 누리장터 민간입찰공고·민간낙찰정보·민간계약정보 서비스).
 * 누리장터는 나라장터에 수요기관으로 등록할 수 없는 민간(재건축조합, 민간 기업, 사회복지법인, 종교단체 등)이 조달청 전자조달 시스템으로 입찰하는 곳이다.
 * 수집: src/lib/nara/nuri.ts, 화면: /nuri-bids. 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다.
 * 담당자 이름·전화·이메일, 업체 대표자 이름·주소·전화는 받아도 저장하지 않는다.
 */
import type { LicenseReq } from "./eligibility";
import type { EvalSheet } from "./evalscore";
import type { NoticeCriteria } from "./noticeCriteria";

export const NURI_BIZ = ["용역", "공사", "물품", "기타"] as const;
export type NuriBiz = (typeof NURI_BIZ)[number];

export interface NuriFile { name: string; url: string }

export interface NuriBid {
  /** 입찰공고번호 */
  no: string;
  /** 차수 */
  ord: string;
  biz: NuriBiz;
  /** 공고 분류 원문 (예: 민간일반용역) */
  kind?: string;
  title: string;
  /** 공고기관 */
  agency: string;
  /** 공고기관 자체 번호 (예: 제2026-15호) */
  refNo?: string;
  /** 등록공고·변경공고·재공고 */
  state: string;
  /** 업종 분류 (공고명·면허 기준, 나라장터 공고 검색과 같은 분류) */
  category: string;
  /** 게시 ISO (KST) */
  postedAt: string;
  /** 입찰 시작 ISO */
  beginAt?: string;
  /** 입찰 마감 ISO. 직찰처럼 마감 일시가 없으면 개찰 일시 */
  closeAt: string;
  openAt?: string;
  openPlace?: string;
  /** 전자입찰·직찰 */
  method?: string;
  /** 일반경쟁·제한경쟁 등 */
  contract?: string;
  /** 낙찰방법 (적격심사제·최저가낙찰제·제안서평가에의한낙찰자결정 등) */
  award?: string;
  rebid?: string;
  /** 입찰자격 원문 (대개 '공고서 참조') */
  qualification?: string;
  /** 지역제한 구분 원문 (투찰제한·공고서 참조 등) */
  regionLimit?: string;
  regions: string[];
  /** 면허제한 (바깥 '또는', 안쪽 '모두') */
  licenseGroups: LicenseReq[][];
  /** 배정예산 (0이면 미공개) */
  budget?: number;
  /** 기준금액 (공개한 공고만) */
  refAmount?: number;
  vat?: string;
  briefingAt?: string;
  briefingPlace?: string;
  /** 사업명·장소·기한 (상세목록 첫 줄) */
  detail?: { name?: string; place?: string; until?: string };
  /** 아파트 단지 공고면 단지 정보 (주소·전화는 저장하지 않는다) */
  apt?: { name: string; households?: number; buildings?: number; area?: number; heating?: string };
  files: NuriFile[];
  /** 첨부에서 읽은 평가 배점표 (빌드가 읽어 합계가 90~110점인 표만. 없으면 못 읽었거나 배점표가 없는 공고) */
  sheet?: NuriSheet;
  /** 규칙으로 쓸 수 있는 배점표를 못 읽었지만 배점표가 있을 법해, 민간 예측에서 고르면 배점표 판독으로 읽는 공고 */
  aiSheet?: boolean;
}

/** 공고 첨부의 평가 배점표 (항목 이름·배점만 화면에 보인다) */
export interface NuriSheet {
  file: string;
  total: number;
  items: { group: string; label: string; max: number }[];
  /** 통과 기준 총점 (공고서에 있으면) */
  pass?: number;
}

/**
 * 민간 예측(/premium/nuri)에 쓰는 공고별 평가 자료 (/nuri-docs-data.json, 키: 공고번호-차수).
 * 빌드가 첨부에서 읽은 전체 평가표와 공고서 문장 기준. 배점표가 있는 공고만 있다.
 */
export interface NuriDocs {
  /** 규칙 파서가 읽은 표 (없으면 ai: 고를 때 배점표 판독으로 읽는다) */
  sheet?: EvalSheet;
  sheetFile?: string;
  notice?: NoticeCriteria;
  /** 배점표 판독 입력이 있다 (/ai-input/{공고번호-차수}.json) */
  ai?: boolean;
}

/** 개찰 결과 한 건 (상위 순위만, 업체는 이름만) */
export interface NuriResult {
  no: string;
  ord: string;
  title: string;
  agency: string;
  /** 개찰 ISO */
  openedAt: string;
  /** 참가 업체 수 */
  bidders: number;
  /** 개찰완료·유찰 */
  state: string;
  biz?: NuriBiz;
  award?: string;
  /** 개찰 순위 (최대 5위) */
  ranks: { rank: number; name: string; amount?: number; rate?: number; note?: string }[];
}

export interface NuriContract {
  /** 통합계약번호 */
  no: string;
  name: string;
  agency: string;
  /** 물품·공사·용역 */
  biz?: string;
  /** 계약일 YYYY-MM-DD */
  date?: string;
  amount?: number;
  period?: string;
  /** 계약 업체 이름 */
  corps: string[];
  joint?: boolean;
  link?: string;
}

/** 같은 업무·낙찰방법의 지난 개찰 1순위 투찰률 분포 */
export interface NuriRateStat {
  biz: NuriBiz;
  award: string;
  n: number;
  /** 1순위 투찰률 25%·가운데·75% */
  p25: number;
  p50: number;
  p75: number;
  /** 평균 참가 업체 수 */
  bidders: number;
}

export interface NuriBidsFile {
  builtAt: string;
  items: NuriBid[];
  results: NuriResult[];
  contracts: NuriContract[];
  rates: NuriRateStat[];
  /** 결과·계약 수집 기간 (YYYY-MM-DD) */
  from?: string;
}

/** 기관명 비교용 (공백·괄호·법인 표기 제거) */
export const agencyKey = (s: string) => s.replace(/\(주\)|㈜|주식회사|\(재\)|재단법인|\(사\)|사단법인|사회복지법인|\s+/g, "").toLowerCase();
