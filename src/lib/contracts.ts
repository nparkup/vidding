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
