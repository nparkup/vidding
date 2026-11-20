/** 사전규격 공개 한 건 (수집: src/lib/nara/preSpec.ts, 화면: /prespecs). 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다 */
import type { BizType, ServiceCategory } from "./types";

export interface PreSpec {
  /** 사전규격 등록번호 */
  no: string;
  biz: BizType;
  /** 용역 세부 구분 (일반용역·기술용역 등) */
  div?: string;
  title: string;
  category: ServiceCategory;
  /** 발주기관 / 실수요기관 */
  agency: string;
  demand: string;
  /** 배정예산(원) */
  budget: number;
  /** 등록 일시 (ISO, KST) */
  postedAt: string;
  /** 의견 등록 마감 (ISO, KST) */
  opinionBy?: string;
  /** 납품 기한(일), 없으면 0 */
  days: number;
  /** 규격서 파일 순번 (링크는 preSpecFileUrl) */
  files: number[];
  /** 물품 세부품명 (예: "지브크레인") */
  items?: string[];
  /** 본공고가 나왔으면 그 공고번호들 */
  bidNos: string[];
  /** 소프트웨어 사업 */
  sw?: boolean;
}

/** 사전규격 규격서 내려받기 링크 (나라장터) */
export const preSpecFileUrl = (no: string, seq: number) => `https://www.g2b.go.kr/pn/pnz/pnza/UntyAtchFile/downloadFile.do?bfSpecRegNo=${encodeURIComponent(no)}&fileType=BFDTL&fileSeq=${seq}`;

