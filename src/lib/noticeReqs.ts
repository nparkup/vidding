/**
 * 공고서 참가자격 문장에서 판정할 요건을 가려 낸다 (2026-11-24, 업종 제한 없는 공고 1,000건 표본으로 정함).
 *
 * 업종 제한이 없는 공고도 참가자격 본문에 "검진기관지정서 소지업체", "소기업·소상공인 확인서 소지", "직접생산확인증명서[세부품명] 소지",
 * "의약품 도매상 허가(업종코드 5307)", "최근 3년 납품 실적", "냉동탑차 보유" 같은 조건을 적는다.
 * 나라장터 업종·지역 자료에는 없으므로 여기서 읽어 참가자격 판정(eligibility.ts)에 넘긴다.
 */

export type NoticeReqKind =
  /** 법령상 허가·신고·등록·면허·지정 (검진기관 지정, 의약품 도매상 허가, 소프트웨어사업자 신고 등) */
  | "permit"
  /** 중소기업·소기업·소상공인만 (확인서) */
  | "sme"
  /** 직접생산확인증명 (세부품명) */
  | "direct"
  /** 여성기업·장애인기업·사회적기업·자활기업·조합 추천 업체 등 */
  | "social"
  /** 이행·납품 실적 */
  | "record"
  /** 인력·장비·차량·시설 보유 */
  | "staff"
  /** 납품 제품 인증·제조사 공급 확약 */
  | "product"
  /** 사업자등록 종목·법인 목적 */
  | "bizscope"
  /** 보험 가입 */
  | "insurance";

export interface NoticeReq {
  kind: NoticeReqKind;
  /** 화면에 쓰는 짧은 이름 (예: "검진기관지정서 소지") */
  label: string;
  /** 공고서가 적은 나라장터 업종코드 (4자리) */
  codes?: string[];
  /** 업종코드 중 하나만 있으면 되는지 ("A업 또는 B업") */
  anyCode?: boolean;
  /** 직접생산확인 세부품명번호 (10자리) */
  items?: string[];
  /** 여성기업·장애인기업처럼 조회로 확인할 수 있는 확인서 */
  cert?: "women" | "disabled";
  /** 이 요건을 갖출 수 있는 곳 (예: 병원·검진기관) */
  who?: string;
  quote: string;
}

/** 모든 공고에 같은 절차·결격 문구는 요건으로 보지 않는다 */
const BOILER = /시행령\s*제\s*1[23]\s*조|시행\s*규칙\s*제\s*14\s*조|제\s*76\s*조|제\s*92\s*조|부정당|전자\s*입찰\s*(?:특별\s*)?유의서|이용자\s*등록|공인\s*인증|지정\s*전자\s*서명|전자\s*서명\s*인증|사업자용\s*인증서|입찰\s*유의서|(?:다른|관련|관계)?\s*법령의?\s*규정에\s*의하여|부도|파산|휴업|폐업|법정\s*관리|화의/;

/** 본점 소재지 문장 속 "사업자등록증 또는 관련 법령에 따른 허가·인가·면허·등록·신고 등" 은 소재지 증빙 설명이다 */
const LOCATION_BOILER = /허가\s*[·ㆍ,･‧*\s]*\s*인가\s*[·ㆍ,･‧*\s]*\s*면허/;

const WHO: [RegExp, string][] = [
  [/검진\s*기관|건강\s*검진/, "병원·검진기관 (건강검진기본법에 따라 지정받은 곳)"],
  [/의료\s*기관|요양\s*기관/, "병원·의료기관"],
  [/의약품|약국|마약류/, "의약품 도매상·약국"],
  [/의료\s*기기/, "의료기기 판매업 신고 업체"],
  [/집단\s*급식소|식품\s*판매업|식품\s*위생/, "식품판매업 신고 업체"],
  [/폐기물/, "폐기물처리업 허가 업체"],
  [/소프트웨어\s*사업자/, "소프트웨어사업자 신고 업체"],
  [/엔지니어링|기술사/, "엔지니어링사업자·기술사사무소"],
  [/경비\s*업/, "경비업 허가 업체"],
  [/소독\s*업|방역/, "소독업 신고 업체"],
  [/여행\s*업/, "여행업 등록 업체"],
  [/측량\s*업/, "측량업 등록 업체"],
  [/비영리\s*법인/, "비영리법인"],
];

const whoOf = (s: string) => WHO.find(([re]) => re.test(s))?.[1];

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "「약사법」 제45조 규정에 따른 의약품판매업(의약품 도매상) 허가" → 법령·조항 뒤의 이름만 */
function stripLaw(s: string): string {
  let t = squash(s);
  t = t.replace(/^.*(?:에\s*따른|에\s*따라|에\s*의한|에\s*의하여|에\s*의거한?|의거|규정에\s*의한|규정한|정한)\s+/, "");
  t = t.replace(/^[^가-힣A-Za-z]+/, "").replace(/^(?:및|또는|그리고)\s+/, "");
  return t.trim();
}

/** 허가·신고·등록·면허·지정 요건 (괄호 속 업종코드 포함) */
const PERMIT_RES: RegExp[] = [
  // "“검진기관지정서” 소지업체", "허가증을 보유한 업체", "면허를 소지한 업체"
  /([가-힣A-Za-z0-9·ㆍ()\[\]“”"'‘’「」\s,]{2,60}?(?:지정서|허가증|면허증|등록증|신고증|인가서|면허|허가|신고))\s*[”"」’']?\s*(?:을|를)?\s*(?:소지|보유|취득|득)\s*(?:한|하고\s*있는)?\s*(?:업체|자|기관|사업자|법인|업자|투자사)/,
  // "… 허가를 득한 업체", "… 신고를 필한 업체", "… 등록을 필한 업체", "… 허가받은 업체"
  /([가-힣A-Za-z0-9·ㆍ()\[\]“”"'‘’「」\s,]{2,60}?(?:허가|신고|등록|면허|인가))\s*(?:를|을)?\s*(?:득한|필한|받은|받고|마친|한)\s*(?:업체|자|기관|사업자|법인|업자)/,
  // "… 사업자로 신고한 업체", "… 감리업으로 등록된 업체", "… 마약류취급자로 허가받은 업체", "… 적격업소로 지정된 자"
  /([가-힣A-Za-z0-9·ㆍ()\[\]“”"'‘’「」\s,]{2,50}?(?:업|사업자|업자|업소|기관|운영사|취급자|사무소))\s*(?:으로|로)\s*(?:허가|신고|등록|지정|인가)\s*(?:를|을)?\s*(?:받은|받고|된|한|필한|득한)/,
  // "… 허가(업종코드: 5307)" 처럼 업종코드를 붙인 이름
  /([가-힣A-Za-z0-9·ㆍ()\s]{2,40}?(?:업|업자|도매상|판매업))\s*[\[(（]\s*(?:업종\s*코드\s*[:：]?\s*)?\d{4}\s*[\])）]/,
];

const PERMIT_SKIP = /입찰\s*참가\s*신청|소정의\s*기일|입찰\s*공고\s*조건|경쟁\s*입찰\s*참가\s*자격|입찰\s*참가\s*(?:자격\s*)?등록|사업자\s*등록|직접\s*생산|중소\s*기업|소상공인|소기업|공인\s*인증|전자\s*인증|이용자\s*등록|물품\s*(?:분류|등록)|입찰\s*등록|공장\s*등록|차량\s*등록|자동차\s*등록|품목\s*허가|위생\s*허가/;

/** 업종 이름 + 업종코드 짝: "정보통신공사업[업종코드 0036]", "식품판매업(집단급식소 식품판매업, 업종코드5246)" */
const CODE_PAIR = /([가-힣A-Za-z·ㆍ]{2,20}(?:업|사업자|도매상|취급자))[^\d가-힣]{0,4}(?:\([^)]{0,30}?\)\s*)?[\[(（]?\s*(?:[가-힣\s,]{0,20}?)?(?:업종\s*코드\s*[:：]?\s*)?(?<!\d)(\d{4})(?!\d)/g;
const CODE_RE = /(?:업종\s*코드\s*[:：]?\s*|[\[(（]\s*)(?<!\d)(\d{4})(?![\d\-–~])\s*[\])）]?/g;
/** 나라장터 입찰참가자격 등록 안내 ("나라장터에 아래의 사항을 입찰참가자격으로 등록") 조각 */
const G2B_REG = /나라\s*장터|G2B|전자\s*조달|국가\s*종합|입찰\s*참가\s*자\s*격|이용자/;
/** 이름 앞에 붙은 문장 조각 */
const BAD_LEAD = /^(?:[가-힣]\s|[을를이가은는의에로와과]\s*(?:등록|아래)|따라|까지|에\s|으로|로\s|집행|반드시|해당\s*물품|지방자치단체)|반드시|아래의?\s*사항|마감일|전일까지|^[^(（]*[)）]|업체\s*등록|^업종을/;

function permitOf(t: string): { label: string; codes?: string[]; anyCode?: boolean } | undefined {
  if (LOCATION_BOILER.test(t) && /소재/.test(t)) return undefined;
  const codes = [...new Set([...t.matchAll(CODE_RE)].map((x) => x[1]).filter((c) => !/^(19|20)\d\d$/.test(c)))];
  // 업종코드를 적었으면 나라장터 등록 업종과 바로 대조한다 (이름은 코드 앞의 업종 이름)
  if (codes.length) {
    const names: string[] = [];
    for (const m of t.matchAll(CODE_PAIR)) if (codes.includes(m[2])) { const n = stripLaw(m[1]); if (n.length >= 2 && !names.includes(n)) names.push(n); }
    const anyCode = codes.length > 1 && /또는|이나|혹은/.test(t);
    return { label: names.length ? clip(names.join(anyCode ? " 또는 " : "·"), 50) : `업종코드 ${codes.join(", ")}`, codes, anyCode };
  }
  for (const re of PERMIT_RES) {
    const m = t.match(re);
    if (!m) continue;
    let name = stripLaw(m[1]).replace(/[“”"'‘’「」\[\]]/g, "").trim();
    if (name.length < 2 || !/[가-힣]{2}/.test(name) || PERMIT_SKIP.test(name) || BAD_LEAD.test(name)) continue;
    // 나라장터 입찰참가자격 등록 안내는 업종코드가 없으면 판정할 것이 없다
    if (G2B_REG.test(name) || (/등록$/.test(name) && G2B_REG.test(t))) continue;
    if (/^(?:해당|당해|관련|그|이)\s*(?:허가|면허|신고|등록)/.test(name)) continue;
    name = clip(squash(name), 50);
    return { label: /(?:지정서|허가증|면허증|등록증|신고증|인가서)$/.test(name) ? `${name} 소지` : name };
  }
  return undefined;
}

export function readNoticeReqs(qualify: string[] | undefined): NoticeReq[] | undefined {
  const out: NoticeReq[] = [];
  const add = (r: NoticeReq) => { if (!out.some((o) => o.kind === r.kind && o.label === r.label)) out.push(r); };
  for (const raw of qualify ?? []) {
    const t = squash(raw);
    const boiler = BOILER.test(t);
    // 직접생산확인증명 (세부품명번호가 있으면 기업의 증명과 대조)
    if (/직접\s*생산\s*확인/.test(t)) {
      const items = [...new Set([...t.matchAll(/(?<!\d)(\d{10})(?!\d)/g)].map((x) => x[1]))];
      const nm = t.match(/세부\s*품명\s*[:：]?\s*([가-힣A-Za-z0-9·()\s]{2,20}?)\s*[,，(\[]/)?.[1] ?? t.match(/증명서?\s*[\[(（]\s*([가-힣A-Za-z0-9·\s]{2,20}?)\s*[(（:：]/)?.[1];
      add({ kind: "direct", label: `직접생산확인증명${nm ? ` (${squash(nm)})` : ""}`, ...(items.length ? { items } : {}), quote: raw });
    }
    // 중소기업·소기업·소상공인만
    if (/확인서|확인을\s*받은|확인\s*받은/.test(t) && /중소\s*기업|소기업|소상공인/.test(t) && !/예외/.test(t)) {
      // "소기업·소상공인 확인서"만 인정하는 공고와 "중소기업 확인서"면 되는 공고를 나눈다
      const small = /소\s*기업\s*[·ㆍ∙(（]?\s*(?:또는\s*)?소상공인\s*[)）]?\s*확인서|소기업\s*또는\s*(?:「[^」]*」\s*[^소]{0,20})?소상공인|[“"‘']\s*소\s*기업\s*[”"’']/.test(t) && !/중\s*[·ㆍ∙]\s*소\s*기업|중소\s*기업\s*[·ㆍ∙]?\s*소상공인\s*확인서|중소\s*기업\s*확인서/.test(t);
      add({ kind: "sme", label: small ? "소기업·소상공인 확인서" : "중소기업(소상공인) 확인서", quote: raw });
    }
    if (/대기업/.test(t) && /(?:참여|참가)\s*(?:할\s*수\s*없|불가|제한)/.test(t)) add({ kind: "sme", label: "대기업·중견기업 참가 제한", quote: raw });
    // 여성기업·장애인기업·사회적기업 등, 조합 추천 업체
    if (/여성\s*기업/.test(t) && /(?:확인서|제한|한정|만)/.test(t)) add({ kind: "social", label: "여성기업 확인서", cert: "women", quote: raw });
    if (/장애인\s*기업\s*(?:확인서|으로\s*제한|만)|장애인\s*표준\s*사업장|중증\s*장애인\s*생산\s*시설/.test(t)) add({ kind: "social", label: "장애인기업 확인서", cert: "disabled", quote: raw });
    if (/사회적\s*기업|자활\s*(?:기업|사업단|공동체)|사회적\s*협동\s*조합/.test(t)) add({ kind: "social", label: "사회적기업·자활기업 등", quote: raw });
    if (/추천을\s*받은/.test(t) && /조합/.test(t)) add({ kind: "social", label: "조합 추천 업체", quote: raw });
    if (boiler && !/지정서|허가증|면허|신고를|허가를/.test(t)) continue;
    // 허가·신고·등록·면허·지정
    const p = permitOf(t);
    if (p) add({ kind: "permit", label: p.label, ...(p.codes ? { codes: p.codes, ...(p.anyCode ? { anyCode: true } : {}) } : {}), ...(whoOf(p.label) ? { who: whoOf(p.label) } : {}), quote: raw });
    // 실적
    if (/실적/.test(t) && /(?:있는|이상인?|보유한?|수행한|이행한|납품한)\s*(?:업체|자|사업자|사업체)|실적\s*제한\s*입찰|실적이\s*\d|실적\s*\d+\s*건/.test(t)) add({ kind: "record", label: "실적 요건", quote: raw });
    // 인력·장비·차량·시설
    if (/(?:인력|기술자|기술사|차량|탑차|장비|시설|점포|창고|영양사|위생사)/.test(t) && /(?:보유|갖추|갖춘|확보|소유|임차|설치)/.test(t) && !/소재/.test(t)) add({ kind: "staff", label: "인력·장비·시설 요건", quote: raw });
    // 납품 제품 인증·제조사 확약
    if (/HACCP|위해\s*요소|GMP|KC\s*인증|KS\s*인증|품목\s*허가|단체\s*표준|제조사|제조\s*업체|공급\s*(?:확약|증명)|정품\s*공급|A\/S\s*확약|기술\s*지원\s*확약/.test(t)) add({ kind: "product", label: "납품 제품 인증·공급 확약", quote: raw });
    // 사업자등록 종목·법인 목적
    if (/사업자\s*등록(?:증)?\s*(?:상|에)?\s*(?:기재된\s*)?(?:사업의\s*종류|종목|업태)|취급\s*종목|정관.*목적|목적에.*기재/.test(t)) add({ kind: "bizscope", label: "사업자등록 종목·법인 목적", quote: raw });
    // 보험
    if (/배상\s*책임\s*보험/.test(t) && /가입/.test(t)) add({ kind: "insurance", label: "배상책임보험 가입", quote: raw });
  }
  // 세부품명번호를 적은 직접생산확인 요건이 있으면 번호 없는 안내 문장은 뺀다. 기업 규모 요건도 하나만
  const direct = out.some((r) => r.kind === "direct" && r.items);
  const sme = out.find((r) => r.kind === "sme" && r.label !== "대기업·중견기업 참가 제한");
  const kept = out.filter((r) => !(direct && r.kind === "direct" && !r.items) && !(r.kind === "sme" && sme && r !== sme && r.label !== "대기업·중견기업 참가 제한"));
  return kept.length ? kept.slice(0, 10) : undefined;
}

/** 중소기업 우선조달의 예외 공고 (판로지원법 시행령 제2조의3): 기업 규모로 제한하지 않는다 */
export function readSmeExempt(sentences: string[]): { value: true; quote: string } | undefined {
  for (const s of sentences) {
    if (/우선\s*조달\s*계약?의?\s*(?:에\s*대한\s*)?예외|제\s*2\s*조의\s*3/.test(s) && /중소\s*기업|판로/.test(s)) return { value: true, quote: s.length > 160 ? `${s.slice(0, 159)}…` : s };
  }
  return undefined;
}

export const REQ_TITLE: Record<NoticeReqKind, string> = {
  permit: "허가·신고·지정",
  sme: "기업 규모",
  direct: "직접생산확인",
  social: "기업 유형",
  record: "실적",
  staff: "인력·장비·시설",
  product: "납품 제품",
  bizscope: "사업 종목",
  insurance: "보험",
};
