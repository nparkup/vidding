/**
 * 사전규격 공개 (조달청_나라장터 사전규격정보서비스 HrcspSsstndrdInfoService).
 * 본공고 전에 규격서를 미리 공개하고 업체 의견을 받는 단계라, 여기서 공고를 미리 보면 서류를 일찍 준비할 수 있다.
 * 빌드(scripts/fetch-bids.ts)가 최근 PRESPEC_DAYS일 등록분을 받아 /prespecs-data.json 으로 낸다. 화면은 /prespecs.
 * 필드 이름은 2026-11-20 실제 응답(용역·공사·물품)으로 확인했다.
 */
import { call, mapLimit, recentDays } from "./client";
import { classify } from "./client";
import type { BizType } from "../types";
import type { PreSpec } from "../preSpecs";

export const PRESPEC_DAYS = 14;
const PATH = "/ao/HrcspSsstndrdInfoService";
const OPS: [string, BizType][] = [["getPublicPrcureThngInfoServc", "용역"], ["getPublicPrcureThngInfoCnstwk", "공사"], ["getPublicPrcureThngInfoThng", "물품"]];


const t = (v?: string) => (v ?? "").trim();
const kst = (v?: string) => (t(v) ? `${t(v).replace(" ", "T")}+09:00` : undefined);

function toPreSpec(it: Record<string, string>, biz: BizType): PreSpec | undefined {
  const no = t(it.bfSpecRgstNo);
  const title = t(it.prdctClsfcNoNm);
  if (!no || !title) return undefined;
  const files = [1, 2, 3, 4, 5].filter((i) => /^https:\/\//.test(t(it[`specDocFileUrl${i}`])));
  // "[1^2410165201^지브크레인], [2^...^...]"
  const items = [...t(it.prdctDtlList).matchAll(/\^[^^\]]*\^([^\]]+)\]/g)].map((m) => m[1].trim()).filter(Boolean);
  return {
    no, biz, div: t(it.bsnsDivNm) || undefined, title,
    category: classify(title, items.join(" "), biz),
    agency: t(it.orderInsttNm), demand: t(it.rlDminsttNm) || t(it.orderInsttNm),
    budget: Number(it.asignBdgtAmt) || 0,
    postedAt: kst(it.rgstDt) ?? new Date().toISOString(),
    opinionBy: kst(it.opninRgstClseDt),
    days: Number(it.dlvrDaynum) || 0,
    files,
    items: items.length ? items : undefined,
    bidNos: t(it.bidNtceNoList).split(/[,\s]+/).map((s) => s.replace(/[^\w-]/g, "")).filter(Boolean),
    sw: it.swBizObjYn === "Y" || undefined,
  };
}

/** 최근 days일 등록된 사전규격 (최근 등록 순, 같은 번호는 마지막 변경분) */
export async function fetchPreSpecs(days = PRESPEC_DAYS): Promise<PreSpec[]> {
  const jobs = recentDays(days).flatMap((d) => OPS.map(([op, biz]) => ({ d, op, biz })));
  const out = new Map<string, PreSpec>();
  const rows = await mapLimit(jobs, 4, async ({ d, op, biz }) => {
    const params = { inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359`, numOfRows: "999" };
    const first = await call(PATH, op, { ...params, pageNo: "1" }).catch(() => ({ items: [], total: 0 }));
    const items = [...first.items];
    for (let p = 2; p <= Math.ceil(first.total / 999); p++) items.push(...(await call(PATH, op, { ...params, pageNo: String(p) }).catch(() => ({ items: [] }))).items);
    return items.map((it) => toPreSpec(it as Record<string, string>, biz)).filter((x): x is PreSpec => !!x);
  });
  for (const p of rows.flat()) out.set(p.no, p);
  return [...out.values()].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}
