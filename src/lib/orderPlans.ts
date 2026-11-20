/** 발주계획 한 건 (수집: src/lib/nara/orderPlan.ts, 화면: /plans). 브라우저에서도 쓰므로 서버 전용 모듈을 쓰지 않는다 */
import type { BizType, ServiceCategory } from "./types";

export interface OrderPlan {
  /** 발주계획 통합번호 */
  no: string;
  biz: BizType;
  /** 용역 세부 구분 (일반용역·기술용역 등) */
  div?: string;
  title: string;
  category: ServiceCategory;
  /** 발주기관 / 상위 기관 (예: 충청남도 예산군 / 충청남도) */
  agency: string;
  top?: string;
  /** 발주 예정 연월 "YYYY-MM" */
  month: string;
  /** 발주 예정 금액 합계(원), 모르면 0 */
  amount: number;
  /** 계약 방법 (일반경쟁·제한경쟁·지명경쟁) */
  method: string;
  /** 중앙조달(조달청 대행) 여부 */
  central?: boolean;
  /** 공사 현장 지역 (공사만) */
  site?: string;
  /** 공사 종류 (일반·전문 등) */
  work?: string;
  /** 물품 분류명 */
  item?: string;
  /** 사업 유형 (신규·장기 등) */
  kind?: string;
  /** 담당 부서·전화 (기관 대표 연락처) */
  dept?: string;
  tel?: string;
  /** 게시 일시 (ISO, KST) */
  postedAt: string;
  /** 지금 진행 중인 공고 중 같은 기관·같은 사업으로 보이는 공고 id (빌드 때 이름으로 맞춘다) */
  bidIds?: string[];
}

/** 사업명을 비교용으로 다듬는다: 연도·차수·괄호·기호·공백을 뺀다 */
export function planKey(title: string): string {
  return title
    .replace(/\(?\s*(19|20)\d{2}\s*(년도?|학년도)?\s*\)?/g, "")
    .replace(/[0-9]+\s*(차|분기|월)/g, "")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** 진행 중인 공고 가운데 같은 기관·비슷한 사업명인 것을 계획에 붙인다 (이름이 6자 이상 겹칠 때만) */
export function linkPlansToBids(plans: OrderPlan[], bids: { id: string; title: string; agency: string; demandAgency: string }[]): number {
  const byAgency = new Map<string, { id: string; key: string }[]>();
  for (const b of bids) {
    const key = planKey(b.title);
    for (const a of new Set([b.agency, b.demandAgency])) {
      if (!a) continue;
      const arr = byAgency.get(a) ?? [];
      arr.push({ id: b.id, key });
      byAgency.set(a, arr);
    }
  }
  let n = 0;
  for (const p of plans) {
    const k = planKey(p.title);
    if (k.length < 6) continue;
    const hit = (byAgency.get(p.agency) ?? []).filter((b) => b.key.length >= 6 && (b.key === k || b.key.includes(k) || k.includes(b.key))).map((b) => b.id);
    if (hit.length) { p.bidIds = [...new Set(hit)].slice(0, 3); n++; }
  }
  return n;
}

/** 나라장터 발주계획 상세 링크 */
export const orderPlanUrl = (no: string) => `https://www.g2b.go.kr/link/PRPA015_01/single/?oderPlanNo=${encodeURIComponent(no)}`;
