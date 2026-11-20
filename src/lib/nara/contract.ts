/**
 * 계약현황 (조달청_나라장터 계약정보서비스 CntrctInfoService).
 * 낙찰 뒤 실제로 맺은 계약: 계약업체(공동수급 지분), 계약금액, 계약 기간. 경쟁사의 최근 수주와 기관별 계약 흐름을 본다.
 * 빌드(scripts/fetch-bids.ts)가 최근 CONTRACT_DAYS일 등록분 중 경쟁 계약(수의계약 제외)을 받아 /contracts-data.json 으로 낸다. 화면은 /contracts.
 * 조회 파라미터는 inqryDiv=1 + inqryBgnDt/inqryEndDt(YYYYMMDDHHmm). 필드 이름은 2026-11-20 실제 응답(용역·공사·물품)으로 확인했다.
 * 하루치가 수천 건(대부분 수의계약)이라, 지난 날짜는 .cache/contracts 에 두고 다음 빌드는 최근 이틀만 다시 받는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { call, classify, mapLimit, recentDays } from "./client";
import type { BizType } from "../types";
import { contractEnd, type Contract, type ContractCorp } from "../contracts";

export const CONTRACT_DAYS = 14;
const PATH = "/ao/CntrctInfoService";
const OPS: [string, BizType][] = [["getCntrctInfoListServc", "용역"], ["getCntrctInfoListCnstwk", "공사"], ["getCntrctInfoListThng", "물품"]];
const CACHE = ".cache/contracts";
/** 캐시에는 다듬은 계약을 넣으므로, 다듬는 방식(toContract)을 바꾸면 올린다 */
const CACHE_VER = 2;

const t = (v?: string) => (v ?? "").trim();
/** 링크 주소의 쿼리 값 하나 */
const qp = (url: string, k: string) => { const m = url.match(new RegExp(`[?&]${k}=([^&]+)`)); return m ? decodeURIComponent(m[1]) : undefined; };

/** "[1^주계약업체^단독^주식회사 리스트^오원석^대한민국^100^주식회사 리스트^^1078785562]" 여러 개 */
export function parseCorps(raw?: string): ContractCorp[] {
  return [...t(raw).matchAll(/\[([^\]]*)\]/g)].map((m) => {
    const f = m[1].split("^");
    const bizNo = (f[9] ?? "").replace(/\D/g, "");
    const share = Number(f[6]);
    return { name: t(f[3]), bizNo: bizNo.length === 10 ? bizNo : undefined, share: share > 0 ? share : undefined, role: t(f[1]) && t(f[1]) !== "주계약업체" ? t(f[1]) : undefined };
  }).filter((c) => c.name);
}

/** "[1^1384000^성평등가족부^국가기관^^^]" 의 첫 기관 이름 */
const firstDemand = (raw?: string) => t(raw).match(/\[[^^\]]*\^[^^\]]*\^([^^\]]+)/)?.[1]?.trim();

export function toContract(it: Record<string, string>, biz: BizType): Contract | undefined {
  const no = t(it.untyCntrctNo);
  const title = t(it.cntrctNm) || t(it.cnstwkNm);
  const method = t(it.cntrctCnclsMthdNm);
  if (!no || !title || /수의/.test(method)) return undefined;
  const thtm = Number(it.thtmCntrctAmt) || 0, tot = Number(it.totCntrctAmt) || 0;
  const amount = thtm || tot;
  if (!amount) return undefined;
  const cls = [t(it.pubPrcrmntClsfcNm), t(it.prdctClsfcNoNm), t(it.cnstwkNm)].filter(Boolean).join(" ");
  const agency = t(it.cntrctInsttNm);
  const url = t(it.cntrctDtlInfoUrl);
  const period = t(it.cntrctPrd) || undefined;
  const ymdOf = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
  return {
    no, biz, div: t(it.bsnsDivNm) || undefined, title,
    category: classify(title, cls, biz),
    agency, demand: firstDemand(it.dminsttList) || agency,
    // 체결일을 먼저 쓴다. 계약일(cntrctDate)은 단가계약 시작일처럼 앞날짜가 들어오기도 한다
    date: t(it.cntrctCnclsDate) || t(it.cntrctDate) || t(it.rgstDt).slice(0, 10),
    amount, total: tot && tot !== amount ? tot : undefined,
    period,
    end: ymdOf(t(it.ttalCcmpltDate)) ?? ymdOf(t(it.ttalScmpltDate)) ?? ymdOf(t(it.thtmCcmpltDate)) ?? ymdOf(t(it.thtmScmpltDate)) ?? contractEnd(period),
    method: method || "미정",
    kind: t(it.lngtrmCtnuDivNm) || undefined,
    corps: parseCorps(it.corpList),
    bidNo: t(it.ntceNo) || undefined,
    ref: qp(url, "ctrtNo"),
    se: qp(url, "prcmBsneSeCd"),
  };
}

async function fetchDay(d: string, op: string, biz: BizType): Promise<Contract[] | null> {
  const params = { inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359`, numOfRows: "999" };
  const first = await call(PATH, op, { ...params, pageNo: "1" }).catch(() => null);
  if (!first) return null;
  const pages = Math.ceil(first.total / 999);
  const rest = await mapLimit(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), 3, (p) => call(PATH, op, { ...params, pageNo: String(p) }).catch(() => null));
  if (rest.some((r) => !r)) return null;
  return [first, ...rest].flatMap((r) => r!.items).map((it) => toContract(it as Record<string, string>, biz)).filter((x): x is Contract => !!x);
}

/** 최근 days일 등록된 경쟁 계약 (계약일 최근 순, 같은 번호는 나중 것) */
export async function fetchContracts(days = CONTRACT_DAYS, now = new Date()): Promise<Contract[]> {
  mkdirSync(CACHE, { recursive: true });
  const fresh = new Set(recentDays(2, now));
  const jobs = recentDays(days, now).flatMap((d) => OPS.map(([op, biz]) => ({ d, op, biz })));
  const rows = await mapLimit(jobs, 4, async ({ d, op, biz }) => {
    const file = join(CACHE, `v${CACHE_VER}-${d}-${op}.json`);
    if (!fresh.has(d) && existsSync(file)) {
      try { return JSON.parse(readFileSync(file, "utf8")) as Contract[]; } catch { /* 깨진 캐시는 다시 받는다 */ }
    }
    const got = await fetchDay(d, op, biz);
    if (got && !fresh.has(d)) writeFileSync(file, JSON.stringify(got));
    return got ?? [];
  });
  // 기간 안에 맺은 계약만 (오래전 계약의 변경 등록과 앞날짜 계약일은 뺀다). 같은 계약번호는 나중 등록분 하나만
  const dash = (d: string) => d.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  const from = dash(recentDays(days, now).at(-1)!), to = dash(recentDays(1, now)[0]);
  const out = new Map<string, Contract>();
  for (const c of rows.flat()) if (c.date >= from && c.date <= to) out.set(c.ref ?? c.no, c);
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}
