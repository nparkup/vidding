/**
 * 공고 상세 '핵심 요약'에 보여 줄 나라장터 공고 항목.
 * 빌드 때 입찰공고정보서비스(BidPublicInfoService02) 용역·공사·물품 목록 원본과 기초금액(…BsisAmount02)에서 꺼내
 * 공고별 파일(/attachments/{id}.json 의 qual.info)에 둔다. 공고 목록 파일(bids-data.json)은 커지지 않게 손대지 않는다.
 * 필드 이름은 2026-11-19 실제 응답(용역·공사·물품 6건)으로 확인했다. 값이 비어 있으면 넣지 않고, 화면은 있는 항목만 보여 준다.
 */
import type { AValueParts } from "./awards/assess";
export interface NoticeInfo {
  /** 공고 종류: 등록공고 / 변경공고 / 재공고 / 취소공고 등 (ntceKindNm) */
  kind?: string;
  /** 재공고 여부 (reNtceYn) */
  reNotice?: boolean;
  /** 정정·취소 사유 (chgNtceRsn) */
  changeReason?: string;
  /** 입찰방식: 전자입찰 / 전자시담 / 전자시담(2인 이상) / 직찰 (bidMethdNm) */
  bidMethod?: string;
  /** 국제입찰 (intrbidYn) */
  international?: boolean;
  /** 용역 구분: 일반용역 / 기술용역 (srvceDivNm) */
  serviceDiv?: string;
  /** 추정가격(원, 부가세 별도) */
  presmpt?: number;
  /** 배정예산(원). 용역·물품은 asignBdgtAmt, 공사는 bdgtAmt */
  budget?: number;
  /** 부가가치세(원) */
  vat?: number;
  /** 관급자재 금액(원, 공사) */
  govSupply?: number;
  /** 기초금액(원). 발주기관이 따로 공개해야 생긴다 (…BsisAmount02 bssamt) */
  base?: number;
  /** 복수예비가격 범위 (%, 예: [-2, 2]) */
  baseRange?: [number, number];
  /** 공사 A값 항목(원). A값 적용 공고만 (bidPrceCalclAYn) */
  aParts?: AValueParts;
  /** 예정가격 결정: 복수예가 / 단일예가 / 비예가 (prearngPrceDcsnMthdNm) */
  priceMethod?: string;
  /** 복수예가 수와 추첨 수 (보통 15개 중 4개) */
  priceDraw?: [number, number];
  /** 적격심사 적용 기준: 행자부(지자체) / 조달청 등 (aplBssCntnts) */
  evalStd?: string;
  /** 협상: 기술능력 평가 비율 : 입찰가격 평가 비율 */
  evalRatio?: [number, number];
  /** 입찰서 제출 시작 (YYYY-MM-DD HH:mm) */
  bidBegin?: string;
  /** 입찰참가자격 등록 마감 */
  registerBy?: string;
  /** 입찰보증서 접수 마감 */
  guaranteeBy?: string;
  /** 개찰 장소 */
  openPlace?: string;
  /** 현장설명 일시·장소 (dcmtgOprtnDt / dcmtgOprtnPlce) */
  briefingAt?: string;
  briefingPlace?: string;
  /** 공동수급 방식 원문: (전자)분담이행 / (전자)공동이행 / (전자)혼합방식 / (없음)공동수급불허 (cmmnSpldmdMethdNm) */
  jointMethod?: string;
  /** 공동수급협정서 마감 */
  jointBy?: string;
  /** 지역의무공동도급 (rgnDutyJntcontrctYn) */
  jointRegionDuty?: boolean;
  /** 공동수급 구성원 지역 제한 (cmmnSpldmdCorpRgnLmtYn) */
  jointRegionLimit?: boolean;
  /** 실적제한 경쟁 (arsltCmptYn) */
  performanceLimit?: boolean;
  /** 지명경쟁 (dsgntCmptYn) */
  nominated?: boolean;
  /** 재입찰 허용 (rbidPermsnYn) */
  rebid?: boolean;
  /** 입찰참가수수료(원) */
  fee?: number;
  /** 공사: 주공종, 공사현장 */
  mainWork?: string;
  site?: string;
  /** 물품: 세부품명, 수량, 납품일수, 납품조건 */
  product?: string;
  quantity?: string;
  deliverDays?: number;
  deliverTerms?: string;
  /** 공고기관 담당자 */
  officer?: { name?: string; tel?: string; email?: string };
  /** 집행관 (공고 담당과 다를 때만) */
  executor?: string;
}

type Item = Record<string, string | undefined>;

/** 빈 값과 가려진 값(***)은 버린다 */
const s = (v?: string) => {
  const t = v?.trim();
  return t && !/^\*+$/.test(t) ? t : undefined;
};
const num = (v?: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const yn = (v?: string) => (v === "Y" ? true : v === "N" ? false : undefined);
/** "2026-11-24 10:00:00" → "2026-11-24 10:00" */
const dt = (v?: string) => s(v)?.match(/^\d{4}-\d\d-\d\d \d\d:\d\d/)?.[0] ?? s(v);

/** 입찰공고정보서비스 목록 원본 한 줄 → NoticeInfo */
export function noticeInfoOf(it: Item): NoticeInfo | undefined {
  const ofcl = { name: s(it.ntceInsttOfclNm), tel: s(it.ntceInsttOfclTelNo), email: s(it.ntceInsttOfclEmailAdrs) };
  const total = num(it.totPrdprcNum);
  const drawn = num(it.drwtPrdprcNum);
  const tech = Number(it.techAbltEvlRt);
  const price = Number(it.bidPrceEvlRt);
  const qty = [s(it.prdctQty), s(it.prdctUnit)].filter(Boolean).join(" ");
  const info: NoticeInfo = {
    kind: s(it.ntceKindNm),
    reNotice: yn(it.reNtceYn),
    changeReason: s(it.chgNtceRsn),
    bidMethod: s(it.bidMethdNm),
    international: yn(it.intrbidYn),
    serviceDiv: s(it.srvceDivNm),
    presmpt: num(it.presmptPrce),
    budget: num(it.asignBdgtAmt) ?? num(it.bdgtAmt),
    vat: num(it.VAT),
    govSupply: num(it.govsplyAmt),
    priceMethod: s(it.prearngPrceDcsnMthdNm),
    priceDraw: total && total > 1 && drawn ? [total, drawn] : undefined,
    evalStd: s(it.aplBssCntnts),
    evalRatio: it.techAbltEvlRt && it.bidPrceEvlRt && Number.isFinite(tech) && Number.isFinite(price) && tech + price > 0 ? [tech, price] : undefined,
    bidBegin: dt(it.bidBeginDt),
    registerBy: dt(it.bidQlfctRgstDt),
    guaranteeBy: dt(it.bidWgrnteeRcptClseDt),
    openPlace: s(it.opengPlce),
    briefingAt: dt(it.dcmtgOprtnDt),
    briefingPlace: s(it.dcmtgOprtnPlce),
    jointMethod: s(it.cmmnSpldmdMethdNm),
    jointBy: dt(it.cmmnSpldmdAgrmntClseDt),
    jointRegionDuty: yn(it.rgnDutyJntcontrctYn),
    jointRegionLimit: yn(it.cmmnSpldmdCorpRgnLmtYn),
    performanceLimit: yn(it.arsltCmptYn),
    nominated: yn(it.dsgntCmptYn),
    rebid: yn(it.rbidPermsnYn),
    fee: num(it.bidPrtcptFee),
    mainWork: s(it.mainCnsttyNm),
    site: s(it.cnstrtsiteRgnNm),
    product: s(it.dtilPrdctClsfcNoNm),
    quantity: qty || undefined,
    deliverDays: num(it.dlvrDaynum),
    deliverTerms: s(it.dlvryCndtnNm),
    officer: ofcl.name || ofcl.tel || ofcl.email ? ofcl : undefined,
    executor: s(it.exctvNm) && s(it.exctvNm) !== ofcl.name ? s(it.exctvNm) : undefined,
  };
  const kept = Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) as NoticeInfo;
  return Object.keys(kept).length ? kept : undefined;
}

/**
 * 기초금액 줄(…BsisAmount02, 분류마다 한 줄) → 기초금액·예가 범위.
 * 분류(bidClsfcNo)가 여럿이고 금액이 서로 다르면 한 금액으로 말할 수 없어 넣지 않는다.
 */
export function baseAmountOf(rows: Item[]): Pick<NoticeInfo, "base" | "baseRange" | "aParts"> | undefined {
  const vals = rows.map((r) => ({ base: num(r.bssamt), a: r.rsrvtnPrceRngBgnRate, b: r.rsrvtnPrceRngEndRate, r })).filter((r) => r.base);
  if (!vals.length || new Set(vals.map((v) => v.base)).size > 1) return undefined;
  const { base, a, b, r } = vals[0];
  const lo = Number(a);
  const hi = Number(b);
  return { base, baseRange: a && b && Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : undefined, aParts: aPartsOf(r) };
}

/** 공사 기초금액 행의 A값 항목 (A값 적용 공고만, 금액이 있는 항목만) */
function aPartsOf(r: Item): AValueParts | undefined {
  if (r.bidPrceCalclAYn?.trim() !== "Y") return undefined;
  const p: AValueParts = {
    health: num(r.mrfnHealthInsrprm), pension: num(r.npnInsrprm), care: num(r.odsnLngtrmrcprInsrprm), retire: num(r.rtrfundNon),
    safety: num(r.sftyMngcst), safetyCheck: num(r.sftyChckMngcst), quality: r.qltyMngcstAObjYn?.trim() === "N" ? 0 : num(r.qltyMngcst),
  };
  const kept = Object.fromEntries(Object.entries(p).filter(([, v]) => (v ?? 0) > 0)) as AValueParts;
  return Object.keys(kept).length ? kept : undefined;
}

/** 공동수급 방식 원문 → 허용 여부 (모르면 undefined) */
export function jointAllowed(method?: string): boolean | undefined {
  if (!method) return undefined;
  if (/불허/.test(method)) return false;
  if (/공동이행|분담이행|혼합/.test(method)) return true;
  return undefined;
}
