/**
 * 사업자등록번호 하나로 공공데이터포털의 기업 정보를 모아 온다.
 * 서버(Next API)와 Cloudflare Worker(정적 사이트용 중계 서버)가 같이 쓴다. 서비스키는 호출하는 쪽이 넘긴다.
 *
 * 1. 국세청_사업자등록정보 진위확인 및 상태조회: 계속·휴업·폐업 상태, 과세유형
 * 2. 조달청_나라장터 사용자정보서비스: 조달업체 등록 정보(상호·대표자·개업일·종업원 수·소재지·등록 업종)
 * 3. 금융위원회_기업기본정보: 법인등록번호, 설립일, 종업원 수, 중소기업 여부, 감사의견 (법인만)
 * 4. 금융위원회_기업 재무정보: 요약재무제표 매출·영업이익·순이익·자산·부채·자본·부채비율 (공시·외감 법인만)
 * 5. 조달청_나라장터 사용자정보서비스 부정당제재업체정보조회: 입찰참가자격 제한 이력과 기간
 * 6. 한국중소벤처기업유통원_공공구매종합정보망 인증서 정보 제공 서비스: 장애인기업확인서·여성기업확인서 유효기간
 *    (신뢰도 가감점 항목 1차 확인. 포털에서 활용신청이 안 되어 있으면 '등록되지 않은 서비스키'로 실패하고 나머지는 그대로 보여 준다)
 *
 * 금융위원회_개인사업자평가정보는 업체를 특정할 수 없는 익명 통계(지역·업종별 등급 분포)라 사업자번호 조회에는 쓰지 않는다.
 * 신용평가등급은 어느 API에도 없어 신용평가등급확인서에서 읽는다.
 */

const NARA = "https://apis.data.go.kr/1230000/ao/UsrInfoService02";
const FSC_CORP = "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2";
const FSC_FIN = "https://apis.data.go.kr/1160100/service/GetFinaStatInfoService_V2/getSummFinaStat_V2";
const NTS_STATUS = "https://api.odcloud.kr/api/nts-businessman/v1/status";
const SMPP_CERT = "https://apis.data.go.kr/B550598/smppCertInfo";
/**
 * 공공구매종합정보망 인증서 API 오퍼레이션. 장애인기업확인은 getDspsnList 로 확인했다.
 * 여성기업확인 오퍼레이션 이름은 포털 공개 화면에 없어, 활용신청 후 상세기능에서 확인해 채운다 (빈 값이면 조회하지 않는다).
 */
export const SMPP_CERT_OPS = { disabled: "getDspsnList", women: "" } as const;

export interface NtsStatus {
  /** 계속사업자 / 휴업자 / 폐업자, 미등록이면 빈 값 */
  state: string;
  taxType: string;
  closedAt?: string;
  registered: boolean;
}

export interface NaraCorp {
  corpName: string;
  ceoName?: string;
  openedAt?: string;
  employees?: number;
  address?: string;
  /** 소재지 시·군·구 (예: 전북특별자치도 전주시 완산구). 참가지역 제한 판정에 쓴다 */
  region?: string;
  bizDivisions: string[];
  manufacturer?: string;
  registeredAt?: string;
  /** 나라장터 등록 업종. 오래된 업종은 이름 없이 코드만 오기도 한다 */
  industries: { name: string; code: string; representative: boolean; expiresAt?: string }[];
}

export interface FscCorp {
  crno: string;
  corpName: string;
  ceoName?: string;
  establishedAt?: string;
  employees?: number;
  smallBusiness?: boolean;
  market?: string;
  mainBank?: string;
  auditor?: string;
  auditOpinion?: string;
  address?: string;
}

export interface FinanceYear {
  year: string;
  /** 연결 / 별도 */
  basis: string;
  sales?: number;
  operatingProfit?: number;
  netIncome?: number;
  assets?: number;
  liabilities?: number;
  equity?: number;
  debtRatio?: number;
}

/** 부정당제재(입찰참가자격 제한) 한 건 */
export interface Sanction {
  agency: string;
  begin?: string;
  end?: string;
  /** 제재 / 해제 / 집행정지 등 */
  state: string;
  reason?: string;
  law?: string;
  /** 오늘이 제재 기간 안이고 해제·집행정지가 아니면 true */
  active: boolean;
}

/** 공공구매종합정보망 확인서 (장애인기업·여성기업) */
export interface CertRecord {
  validFrom?: string;
  validTo?: string;
  certifiedAt?: string;
  /** 오늘 기준 유효한지 */
  valid: boolean;
}

export interface CorpLookup {
  bizno: string;
  corpName?: string;
  ceoName?: string;
  openedAt?: string;
  employees?: number;
  nts?: NtsStatus;
  nara?: NaraCorp;
  fsc?: FscCorp;
  finance: FinanceYear[];
  /** 부정당제재 이력. undefined 면 조회하지 못했다 */
  sanctions?: Sanction[];
  /** 확인서 조회 결과. null 은 조회했지만 확인서가 없음, undefined 는 조회하지 못했거나 하지 않음 */
  certs?: { disabled?: CertRecord | null; women?: CertRecord | null };
  /** 출처별 실패 사유: 한 곳이 실패해도 나머지는 보여 준다 */
  errors: Record<string, string>;
}

type Item = Record<string, string | undefined>;

export const normalizeBizno = (s: string) => s.replace(/\D/g, "");

/** 국세청 사업자등록번호 체크섬 */
export function validBizno(no: string): boolean {
  if (!/^\d{10}$/.test(no)) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(no[i]) * w[i];
  sum += Math.floor((Number(no[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(no[9]);
}

const num = (v?: string) => (v && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const dateOf = (v?: string) => {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : undefined;
};
const clean = (v?: string) => (v ?? "").replace(/\s+/g, " ").replace(/\*+$/, "").trim() || undefined;

/** 공공데이터포털은 가끔 연결을 끊는다: 네트워크 오류만 한 번 더 시도한다 */
async function fetchRetry(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  }
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetchRetry(url, init);
  const text = await r.text();
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error(`응답 형식 오류 (HTTP ${r.status})`); }
  const auth = (j as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnAuthMsg?: string; errMsg?: string } } }).OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (auth) throw new Error(auth.returnAuthMsg ?? auth.errMsg ?? "인증 오류");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return j;
}

/** data.go.kr 응답에서 item 배열을 꺼낸다 (items 가 배열이거나 { item } 이거나) */
function itemsOf(j: unknown): Item[] {
  const res = (j as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown } } }).response;
  const code = res?.header?.resultCode;
  if (code && code !== "00") throw new Error(`API 오류(${code}): ${res?.header?.resultMsg ?? ""}`);
  const raw = res?.body?.items as Item[] | { item?: Item | Item[] } | undefined;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.item ? (Array.isArray(raw.item) ? raw.item : [raw.item]) : [];
}

const qs = (key: string, p: Record<string, string>) => new URLSearchParams({ serviceKey: key, ...p }).toString();

async function ntsStatus(key: string, no: string): Promise<NtsStatus> {
  const j = (await getJson(`${NTS_STATUS}?${qs(key, {})}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ b_no: [no] }),
  })) as { status_code?: string; data?: { b_stt?: string; tax_type?: string; end_dt?: string; b_stt_cd?: string }[] };
  if (j.status_code && j.status_code !== "OK") throw new Error(`국세청 오류: ${j.status_code}`);
  const d = j.data?.[0];
  if (!d) throw new Error("국세청 응답이 비어 있습니다.");
  const registered = !!d.b_stt_cd;
  return { state: d.b_stt ?? "", taxType: registered ? d.tax_type ?? "" : "국세청에 등록되지 않은 사업자등록번호", closedAt: dateOf(d.end_dt), registered };
}

const kstStamp = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-T:]/g, "");

async function naraCorp(key: string, no: string): Promise<NaraCorp | undefined> {
  const b = itemsOf(await getJson(`${NARA}/getPrcrmntCorpBasicInfo02?${qs(key, { type: "json", pageNo: "1", numOfRows: "1", inqryDiv: "3", bizno: no })}`))[0];
  if (!b) return undefined;
  // 업종 조회는 조회 기간이 필요하고 길게 잡으면 범위 초과(07)라, 최근 변경분 기준으로 넓게 잡는다
  let industries: NaraCorp["industries"] = [];
  try {
    const now = new Date();
    const r = itemsOf(await getJson(`${NARA}/getPrcrmntCorpIndstrytyInfo02?${qs(key, {
      type: "json", pageNo: "1", numOfRows: "100", inqryDiv: "1", bizno: no,
      inqryBgnDt: kstStamp(new Date(now.getTime() - 28 * 86400e3)), inqryEndDt: kstStamp(now),
    })}`));
    // 이름이 빈 업종(옛 업종 코드)도 참가자격 판정에 필요해 코드가 있으면 모두 남긴다
    industries = r.filter((i) => i.bizno === no && (i.indstrytyNm || i.indstrytyCd))
      .map((i) => ({ name: clean(i.indstrytyNm) ?? "", code: i.indstrytyCd ?? "", representative: i.rprsntIndstrytyYn === "Y", expiresAt: dateOf(i.vldPrdExprtDt) }));
  } catch {
    // 업종 조회 실패는 기본정보만으로 진행
  }
  return {
    corpName: clean(b.corpNm) ?? "",
    ceoName: clean(b.ceoNm),
    openedAt: dateOf(b.opbizDt),
    employees: num(b.emplyeNum),
    address: [b.adrs, b.dtlAdrs].filter(Boolean).join(" ").trim() || b.rgnNm,
    region: clean(b.rgnNm),
    bizDivisions: (b.corpBsnsDivNm ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    manufacturer: clean(b.mnfctDivNm),
    registeredAt: dateOf(b.rgstDt),
    industries,
  };
}

const todayKst = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function sanctions(key: string, no: string): Promise<Sanction[]> {
  const rows = itemsOf(await getJson(`${NARA}/getUnptRsttCorpInfo02?${qs(key, { type: "json", pageNo: "1", numOfRows: "50", inqryDiv: "1", bizno: no })}`))
    .filter((i) => i.bizno === no);
  const today = todayKst();
  return rows.map((i) => {
    const begin = dateOf(i.rsttBgnDate);
    const end = dateOf(i.rsttEndDate);
    const state = clean(i.rsttProgrsNm) ?? "";
    const lifted = /해제|정지|취소/.test(state);
    return {
      agency: clean(i.insttNm) ?? "",
      begin, end, state,
      reason: clean(i.enfcPrvNm) ?? clean(i.lawordArtclClauseCdNm),
      law: [clean(i.lawordNm)?.replace(/-부정당제재근거법령$/, ""), clean(i.lawordArtclClause)].filter(Boolean).join(" ") || undefined,
      active: !lifted && !!begin && begin <= today && (!end || end >= today),
    };
  }).sort((a, b) => (b.begin ?? "").localeCompare(a.begin ?? ""));
}

/** XML 응답의 <item> 들을 꺼낸다 (Worker 에는 DOMParser 가 없어 정규식으로 읽는다) */
function xmlItems(text: string): Item[] {
  const auth = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/)?.[1];
  if (auth) throw new Error(auth);
  const code = text.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1];
  if (code && code !== "00") throw new Error(`API 오류(${code}): ${text.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1] ?? ""}`);
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const o: Item = {};
    for (const f of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) o[f[1]] = f[2].trim();
    return o;
  });
}

/** 공공구매종합정보망 확인서: 오늘 유효한 것이 있으면 그것, 없으면 가장 최근 것 */
async function smppCert(key: string, no: string, op: string): Promise<CertRecord | null> {
  const today = todayKst();
  const r = await fetchRetry(`${SMPP_CERT}/${op}?${qs(key, { pageNo: "1", numOfRows: "20", bsnmNo: no, stdrDate: today.replace(/-/g, "") })}`);
  const rows = xmlItems(await r.text());
  if (!rows.length) return null;
  const recs = rows.map((i) => {
    const validFrom = dateOf(i.validPdBeginDe);
    const validTo = dateOf(i.validPdEndDe ?? i.validPdDe);
    return { validFrom, validTo, certifiedAt: dateOf(i.certfcDe), valid: (!validFrom || validFrom <= today) && (!validTo || validTo >= today) };
  });
  return recs.find((c) => c.valid) ?? recs.sort((a, b) => (b.validTo ?? "").localeCompare(a.validTo ?? ""))[0];
}

async function fscCorp(key: string, no: string): Promise<FscCorp | undefined> {
  const items = itemsOf(await getJson(`${FSC_CORP}?${qs(key, { resultType: "json", pageNo: "1", numOfRows: "20", bzno: no })}`))
    .filter((i) => i.bzno === no && i.crno);
  if (!items.length) return undefined;
  // 같은 법인이 기준일별로 여러 건 온다: 가장 최근 것
  const b = items.sort((a, c) => (c.lastOpegDt ?? c.fstOpegDt ?? "").localeCompare(a.lastOpegDt ?? a.fstOpegDt ?? ""))[0];
  return {
    crno: b.crno!,
    corpName: clean(b.corpNm) ?? "",
    ceoName: clean(b.enpRprFnm),
    establishedAt: dateOf(b.enpEstbDt),
    employees: num(b.enpEmpeCnt) || undefined,
    smallBusiness: b.smenpYn === "Y" ? true : b.smenpYn === "N" ? false : undefined,
    market: clean(b.corpRegMrktDcdNm),
    mainBank: clean(b.enpMntrBnkNm),
    auditor: clean(b.actnAudpnNm),
    auditOpinion: clean(b.audtRptOpnnCtt),
    address: clean([b.enpBsadr, b.enpDtadr].filter(Boolean).join(" ")),
  };
}

async function finance(key: string, crno: string): Promise<FinanceYear[]> {
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear - 2, thisYear - 3];
  const rows = (await Promise.all(years.map(async (y) => {
    try {
      return itemsOf(await getJson(`${FSC_FIN}?${qs(key, { resultType: "json", pageNo: "1", numOfRows: "10", crno, bizYear: String(y) })}`));
    } catch {
      return [];
    }
  }))).flat();
  const out: FinanceYear[] = [];
  for (const y of years) {
    const ofYear = rows.filter((r) => r.bizYear === String(y));
    // 입찰 경영상태 평가는 개별(별도) 재무제표 기준이 일반적이라 별도를 우선한다
    const r = ofYear.find((i) => i.fnclDcd === "120") ?? ofYear[0];
    if (!r) continue;
    const debtRatio = num(r.fnclDebtRto);
    out.push({
      year: String(y),
      basis: (r.fnclDcdNm ?? "").replace("요약재무제표", "") || "요약",
      sales: num(r.enpSaleAmt),
      operatingProfit: num(r.enpBzopPft),
      netIncome: num(r.enpCrtmNpf),
      assets: num(r.enpTastAmt),
      liabilities: num(r.enpTdbtAmt),
      equity: num(r.enpTcptAmt),
      debtRatio: debtRatio !== undefined ? Math.round(debtRatio * 10) / 10 : undefined,
    });
  }
  return out;
}

export async function lookupCompany(bizno: string, serviceKey: string): Promise<CorpLookup> {
  const no = normalizeBizno(bizno);
  if (no.length !== 10) throw new Error("사업자등록번호 10자리를 입력해 주세요.");
  if (!validBizno(no)) throw new Error("올바른 사업자등록번호가 아닙니다. 숫자를 다시 확인해 주세요.");
  const errors: Record<string, string> = {};
  const catchTo = <T,>(src: string, p: Promise<T>) => p.catch((e: Error) => { errors[src] = e.message || "조회 실패"; return undefined; });

  const [nts, nara, fsc, sanc, disabled, women] = await Promise.all([
    catchTo("nts", ntsStatus(serviceKey, no)),
    catchTo("nara", naraCorp(serviceKey, no)),
    catchTo("fsc", fscCorp(serviceKey, no)),
    catchTo("sanction", sanctions(serviceKey, no)),
    catchTo("disabledCert", smppCert(serviceKey, no, SMPP_CERT_OPS.disabled)),
    SMPP_CERT_OPS.women ? catchTo("womenCert", smppCert(serviceKey, no, SMPP_CERT_OPS.women)) : Promise.resolve(undefined),
  ]);
  const fin = fsc ? (await catchTo("finance", finance(serviceKey, fsc.crno))) ?? [] : [];

  return {
    bizno: no,
    corpName: nara?.corpName || fsc?.corpName || undefined,
    ceoName: nara?.ceoName || fsc?.ceoName,
    openedAt: nara?.openedAt || fsc?.establishedAt,
    employees: nara?.employees ?? fsc?.employees,
    nts: nts ?? undefined,
    nara: nara ?? undefined,
    fsc: fsc ?? undefined,
    finance: fin,
    sanctions: sanc,
    certs: { disabled, women },
    errors,
  };
}
