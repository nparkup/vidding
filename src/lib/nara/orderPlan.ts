/**
 * 발주계획 (조달청_나라장터 발주계획현황서비스 OrderPlanSttusService).
 * 기관이 한 해 또는 분기 발주 예정 사업을 미리 올린 목록이라, 공고나 사전규격보다 먼저 영업을 시작할 수 있다.
 * 빌드(scripts/fetch-bids.ts)가 이번 달부터 PLAN_MONTHS개월 동안 발주 예정인 계획을 받아 /order-plans-data.json 으로 낸다. 화면은 /plans.
 * inqryDiv=2 + orderBgnYm/orderEndYm 이 발주 예정 연월 조회다 (2026-11-20 실제 응답으로 확인).
 * 이미 공고가 연결된 계획(bidNtceNoList 있음)과 수의계약 계획은 뺀다: 앞은 공고 검색에 있고, 뒤는 대부분 참가할 수 없다.
 */
import { call, classify } from "./client";
import type { BizType } from "../types";
import type { OrderPlan } from "../orderPlans";

export const PLAN_MONTHS = 4;
const PATH = "/ao/OrderPlanSttusService";
const OPS: [string, BizType][] = [["getOrderPlanSttusListServcPPSSrch", "용역"], ["getOrderPlanSttusListCnstwkPPSSrch", "공사"], ["getOrderPlanSttusListThngPPSSrch", "물품"]];

const t = (v?: string) => (v ?? "").trim();
const kst = (v?: string) => (t(v) ? `${t(v).replace(" ", "T")}+09:00` : undefined);

/** 이번 달부터 n개월의 "YYYYMM" (KST) */
export function nextMonths(n: number, now = new Date()): string[] {
  const k = new Date(now.getTime() + 9 * 3600e3);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function toOrderPlan(it: Record<string, string>, biz: BizType): OrderPlan | undefined {
  const no = t(it.orderPlanUntyNo);
  const title = t(it.bizNm);
  const method = t(it.cntrctMthdNm);
  if (!no || !title || t(it.bidNtceNoList) || /수의/.test(method)) return undefined;
  const year = t(it.orderYear), mon = t(it.orderMnth).padStart(2, "0");
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(mon)) return undefined;
  const item = t(it.dtilPrdctClsfcNoNm) || t(it.prdctClsfcNoNm);
  return {
    no, biz, div: t(it.bsnsDivNm) || undefined, title,
    category: classify(title, item, biz),
    agency: t(it.orderInsttNm), top: t(it.totlmngInsttNm) && t(it.totlmngInsttNm) !== t(it.orderInsttNm) ? t(it.totlmngInsttNm) : undefined,
    month: `${year}-${mon}`,
    amount: Number(it.sumOrderAmt) || 0,
    method: method || "미정",
    central: t(it.prcrmntMethd) === "중앙조달" || undefined,
    site: t(it.cnstwkRgnNm) || undefined,
    work: t(it.cnsttyDivNm) || undefined,
    item: item || undefined,
    kind: t(it.bsnsTyNm) || undefined,
    dept: t(it.deptNm) || undefined,
    tel: t(it.telNo) || undefined,
    postedAt: kst(t(it.chgDt) || t(it.nticeDt)) ?? new Date().toISOString(),
  };
}

/** 이번 달부터 months개월 동안 발주 예정이고 아직 공고가 연결되지 않은 경쟁 발주계획 (발주월·금액 순) */
export async function fetchOrderPlans(months = PLAN_MONTHS, now = new Date()): Promise<OrderPlan[]> {
  const out = new Map<string, OrderPlan>();
  for (const ym of nextMonths(months, now)) {
    for (const [op, biz] of OPS) {
      const params = { inqryDiv: "2", orderBgnYm: ym, orderEndYm: ym, numOfRows: "999" };
      const first = await call(PATH, op, { ...params, pageNo: "1" }).catch(() => ({ items: [], total: 0 }));
      const items = [...first.items];
      const pages = Math.ceil(first.total / 999);
      // 한 달 치가 많아도(용역 9천 건 안팎) 3쪽씩 나눠 받는다
      for (let p = 2; p <= pages; p += 3) {
        const got = await Promise.all([p, p + 1, p + 2].filter((x) => x <= pages).map((x) => call(PATH, op, { ...params, pageNo: String(x) }).catch(() => ({ items: [] }))));
        for (const g of got) items.push(...g.items);
      }
      for (const it of items) {
        const plan = toOrderPlan(it as Record<string, string>, biz);
        if (plan) out.set(plan.no, plan);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month) || b.amount - a.amount);
}
