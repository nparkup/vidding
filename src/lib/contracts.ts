/** 계약 한 건 (수집: src/lib/nara/contract.ts, 화면: /contracts). 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다 */
import type { BizType, ServiceCategory } from "./types";

export interface ContractCorp {
  name: string;
  /** 사업자등록번호 (숫자만) */
  bizNo?: string;
  /** 지분율(%) */
  share?: number;
  /** 주계약업체가 아닐 때만 (공동수급·도급업체 등) */
  role?: string;
}

export interface Contract {
  /** 통합계약번호 */
  no: string;
  biz: BizType;
  div?: string;
  title: string;
  category: ServiceCategory;
  /** 계약기관 / 수요기관 */
  agency: string;
  demand: string;
  /** 계약일 YYYY-MM-DD */
  date: string;
  /** 이번 계약금액(원). 장기계속은 이번 차수 금액 */
  amount: number;
  /** 총 계약금액(원), 장기계속일 때만 */
  total?: number;
  /** 계약 기간 원문 (예: "2027/12/31", "계약 후 240일 이내") */
  period?: string;
  /** 계약이 끝나는 날 YYYY-MM-DD (공사 준공일 또는 기간 원문에서 읽은 날) */
  end?: string;
  /** 계약 체결 방법 (일반경쟁·제한경쟁·지명경쟁) */
  method: string;
  /** 신규·장기·계속비 */
  kind?: string;
  corps: ContractCorp[];
  /** 입찰공고번호 (있으면) */
  bidNo?: string;
  /** 나라장터 계약번호·업무구분 코드 (상세 링크용) */
  ref?: string;
  se?: string;
  /** 상세 화면용 항목. 목록 파일(/contracts-data.json)에는 빼고 /contract-detail/{조각}.json 에 따로 싣는다 */
  x?: ContractDetail;
}

/** 계약 상세 화면(/contracts/view?no=)에만 쓰는 항목. 계약정보 API 응답(2026-11-21 확인)에서 담당자 이름·전화·팩스는 싣지 않는다 */
export interface ContractDetail {
  /** 확정계약번호 / 계약참조번호 */
  dcsnNo?: string;
  refNo?: string;
  /** 계약 변경 차수 (나라장터 링크의 ctrtChgOrd, "00"이면 최초 계약) */
  chgOrd?: string;
  /** 공동계약 여부 */
  joint?: boolean;
  /** 근거 법률 (예: "국가계약법 (제21조제1항8호)") */
  law?: string;
  /** 계약 근거 내역 (예: "중소벤처기업부장관이 지정.고시한 제품") */
  basis?: string;
  /** 계약보증금률·지체상금률(%) */
  guarantee?: number;
  delay?: number;
  /** 대금 지급 구분 (직불 등) */
  pay?: string;
  /** 조달요청번호 */
  reqNo?: string;
  /** 계약기관 소관 구분·담당 부서·채권자 */
  jur?: string;
  dept?: string;
  creditor?: string;
  /** 수요기관 전부 [이름, 구분] */
  demands?: [string, string][];
  /** 계약업체 전부 (대표자·공동수급 방식·국적 포함) */
  corps?: (ContractCorp & { ceo?: string; mode?: string; nation?: string })[];
  /** 공공조달분류 (대 > 중 > 세, 번호) */
  cls?: string;
  clsNo?: string;
  /** 착수·착공일, 이번 차수 완료일, 전체 완료일 YYYY-MM-DD */
  start?: string;
  thisEnd?: string;
  allEnd?: string;
  /** 물가 변동 조정 방식 (공사) */
  priceAdj?: string;
  /** 정보화사업 여부 */
  infoBiz?: boolean;
  /** 계약일(cntrctDate, 단가계약 시작일이 들어오기도 한다) */
  cntrctDate?: string;
  /** 나라장터 등록 일시 "YYYY-MM-DD HH:mm:ss" */
  rgstDt?: string;
}

/** 상세 파일 조각 수. 계약 1만여 건을 조각으로 나눠 상세 화면이 한 조각만 받는다 */
export const CONTRACT_SHARDS = 16;
export function contractShard(no: string): number {
  let h = 0;
  for (let i = 0; i < no.length; i++) h = (h * 31 + no.charCodeAt(i)) >>> 0;
  return h % CONTRACT_SHARDS;
}

/** 사이트 안 계약 상세 화면 */
export function contractHref(no: string): string {
  return `/contracts/view?${new URLSearchParams({ no })}`;
}

/** 나라장터 계약 상세 링크 */
export function contractUrl(c: Pick<Contract, "ref" | "se">): string {
  if (!c.ref || !c.se) return "https://www.g2b.go.kr";
  return `https://www.g2b.go.kr/link/FIUA027_01/single/?ctrtNo=${encodeURIComponent(c.ref)}&ctrtChgOrd=00&prcmBsneSeCd=${encodeURIComponent(c.se)}&srchName=ctrtCrst&openUrl=Y`;
}

/** 계약 기간 원문에서 끝나는 날짜를 읽는다 (예: "2027/12/31" → "2027-12-31"). 못 읽으면 undefined */
export function contractEnd(period?: string): string | undefined {
  const m = period?.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\s*$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : undefined;
}
