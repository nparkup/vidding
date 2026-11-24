/**
 * 공고서에 적힌 "이 공고의 평가 기준"을 읽는다.
 *
 * 적격심사 공고 대부분은 배점표를 싣지 않고 적용할 기준(「○○ 적격심사 세부기준」 [별표 N])과
 * 통과점수·낙찰하한율·경영상태 기준비율·이행실적 인정 범위 같은 그 공고만의 값을 문장으로 적는다.
 * (2026-11-18 실제 공고 64건 대조: 적격심사 공고 중 배점표를 실은 공고는 몇 건뿐이고,
 *  통과점수는 같은 금액대라도 85·88·92·95점으로 기준마다 달랐다)
 * 여기서 읽은 값은 기준표보다 우선한다. 값마다 원문 문장을 함께 둬 화면에 근거로 보여 준다.
 */

export interface NoticeFact<T> {
  value: T;
  /** 공고서 원문 문장 (화면 표시용으로 줄임) */
  quote: string;
}

export type NoticeIssuer = "행정안전부" | "조달청" | "환경부" | "중소벤처기업부" | "기관 자체";

export interface NoticeCriteria {
  /** 공고가 적용한다고 적은 평가 기준 (예: 「경상남도 청사관리용역 적격심사 세부기준」 별표 1) */
  standard?: NoticeFact<string> & { issuer: NoticeIssuer };
  /** 적용 구간 (예: "추정가격 5억원 미만 2억원 이상인 용역의 평가기준") */
  tier?: NoticeFact<string>;
  /** 통과 기준: 적격심사 종합평점, 협상 합산점수, 또는 기술점수 비율 */
  pass?: NoticeFact<{ kind: "total"; score: number } | { kind: "techRatio"; ratio: number }>;
  /** 공고에 적힌 낙찰하한율 (%) */
  lowerLimit?: NoticeFact<number>;
  /** 신뢰도 가감점(신인도) 범위 */
  trustRange?: NoticeFact<{ plus: number; minus: number }>;
  /** 경영상태 평가 기준비율 (재무비율 평가 공고) */
  financeBase?: NoticeFact<{ equity?: number; current?: number }>;
  /** 이행실적 등 평가 기준 금액 (원) */
  refAmount?: NoticeFact<number>;
  /** 실적 인정 대상·기간 등 공고 문장 */
  recognition?: string[];
  /** 공고서의 입찰 참가자격 항목 (업종 등록·소재지·실적·인력·시설 등, 원문 그대로) */
  qualify?: string[];
}

const NUM = String.raw`(\d{1,3}(?:\.\d{1,4})?)`;

/** PDF에서 "95 점 이상"처럼 글자 사이가 벌어진 것을 붙이고 줄을 합친다 */
function normalize(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/(\d)\s+\.\s*(\d)/g, "$1.$2")
    .replace(/(\d)\s+(점|%|억|원)/g, "$1$2");
}

const clip = (s: string, n = 120) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** 문장 단위로 나눈다 (줄바꿈과 마침표) */
function sentences(text: string): string[] {
  return normalize(text)
    .split(/\r?\n|(?<=[다음함]\s?\.)\s|(?<=\.)\s(?=[가-힣])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

const STD_RE = /[「『“"｢⸢【《〈‘]\s*([^」』”"｣⸥】》〉’]{3,80}?(?:적격\s*심사|평가\s*기준|결정\s*기준|계약\s*이행\s*능력\s*심사|심사\s*기준)[^」』”"｣⸥】》〉’]{0,40})\s*[」』”"｣⸥】》〉’]/g;
/** 따옴표 없이 적은 기준 이름 ("적격심사 기준은 조달청 일반용역 적격심사 세부기준(조달청공고 …)") */
const BARE_STD_RE = /((?:조달청|지방자치단체|행정안전부)\s*[가-힣·\s]{0,20}?적격\s*심사\s*세부\s*기준)/;
/** 기준 이름 앞에 붙은 발주기관 (예: 한국농어촌공사 「시설공사적격심사세부기준」) */
const ORG_BEFORE_RE = /([가-힣]{2,}(?:공사|공단|교육청|재단|진흥원|연구원|본부|병원|대학교))\s*$/;
const GENERIC_STD = /^지방자치단체\s*입찰\s*시?\s*낙찰자\s*결정\s*기준(?:\s*\(.*\))?$|^낙찰자\s*결정\s*기준$|^(지방자치단체\s*)?입찰\s*및\s*계약\s*집행\s*기준|^건설공사\s*발주\s*세부\s*기준$|^사업\s*수행\s*능력|^용역\s*사업\s*수행\s*능력|제안서\s*평가/;

function issuerOf(name: string): NoticeIssuer {
  if (/조달청/.test(name)) return "조달청";
  if (/환경부|기후에너지환경부|건설\s*폐기물/.test(name)) return "환경부";
  if (/중소벤처기업부|중소기업자간|계약\s*이행\s*능력\s*심사/.test(name)) return "중소벤처기업부";
  if (/지방자치단체|행정안전부|행안부/.test(name)) return "행정안전부";
  return "기관 자체";
}

/** 적용 기준 이름: 가장 구체적인 것(별표·장·분야가 붙은 것, 지자체 일반 기준보다 기관·분야 기준)을 고른다 */
function readStandard(all: string[]): NoticeCriteria["standard"] {
  const cands = new Map<string, { n: number; quote: string; used: number }>();
  for (const s of all) {
    if (/정하지\s*아니한|정하지\s*않은|이외의\s*사항|외의\s*사항|준용|열람|게시|홈페이지|참고하시기/.test(s) && !/적용|의하여|따라|의거|평가하/.test(s)) continue;
    const add = (raw: string, at: number) => {
      let name = raw.replace(/\s+/g, " ").replace(/\s*별지\s*제?\s*\d+\s*호\s*서식.*$/, "").trim();
      if (/협상|제안서|사업수행능력\s*세부평가|발주\s*세부기준|등록\s*기준|기술\s*자격|인정\s*방법|자동차/.test(name)) return;
      // 따옴표가 문장 중간에서 열려 조사로 시작하는 조각("는 의료기관 인증평가 기준에 부합하도록")은 기준 이름이 아니다
      if (/^[은는이가을를의에로와과도]\s/.test(name) || /(?:하도록|하여야|해야|합니다)$/.test(name)) return;
      const org = s.slice(Math.max(0, at - 20), at).match(ORG_BEFORE_RE)?.[1];
      if (org && !name.includes(org)) name = `${org} ${name}`;
      const c = cands.get(name) ?? { n: 0, quote: s, used: 0 };
      c.n++;
      // "기준은 「…」", "「…」을 적용", "「…」에 따라" 처럼 이 공고에 적용한다고 적은 문장
      if (/기준은\s*$/.test(s.slice(Math.max(0, at - 12), at)) || /^[^「」]{0,6}(?:을|를|이|에)\s*(?:적용|의하여|의거|따라|따른)/.test(s.slice(at + raw.length + 2, at + raw.length + 20))) c.used++;
      cands.set(name, c);
    };
    for (const m of s.matchAll(STD_RE)) add(m[1], m.index ?? 0);
    const bare = s.match(BARE_STD_RE);
    if (bare && !/[「『“"｢⸢【《〈‘]/.test(s.slice(Math.max(0, (bare.index ?? 0) - 2), bare.index ?? 0))) add(bare[1], bare.index ?? 0);
  }
  if (!cands.size) return undefined;
  const score = (name: string, n: number, used = 0) =>
    (used ? 4 : 0) +
    (GENERIC_STD.test(name) ? 0 : 10) + (/별표|제\s*\d+\s*장/.test(name) ? 3 : 0) + (/적격\s*심사|계약\s*이행\s*능력/.test(name) ? 2 : 0) + Math.min(n, 3);
  const [name, c] = [...cands.entries()].sort((a, b) => score(b[0], b[1].n, b[1].used) - score(a[0], a[1].n, a[1].used))[0];
  // "물품 적격심사 세부기준"처럼 기관 이름 없이 적었으면 공고 전체에서 어느 기준인지 가린다
  let issuer = issuerOf(name);
  if (issuer === "기관 자체" && !/[가-힣]+(?:도|시|군|구|공사|공단|교육청|재단|원|본부|병원)\s/.test(`${name} `) && /^(시설공사|물품|기술|일반용역|용역|낙찰자)/.test(name.replace(/\s/g, ""))) {
    const all2 = all.join(" ");
    issuer = /지방자치단체\s*입찰\s*시?\s*낙찰자\s*결정\s*기준/.test(all2) ? "행정안전부" : /조달청/.test(all2) ? "조달청" : issuer;
  }
  return { value: name, quote: clip(c.quote), issuer };
}

/** 적용 구간: "[별표 3] 추정가격이 고시금액 미만인 물품의 평가기준" 같은 문구 */
function readTier(all: string[]): NoticeCriteria["tier"] {
  for (const s of all) {
    // 세부기준 전문의 "추정가격 10억원 이상인 용역은 90점, 10억원 미만인 용역은 95점"처럼 구간을 나열한 문장은 이 공고의 구간이 아니다
    if ((s.match(/추정\s*가격|공사\s*예정\s*금액/g) ?? []).length >= 2) continue;
    const m = s.match(/((?:[\[<〈［(]\s*별표\s*[\d#]+(?:-\d+)?\s*[\]>〉］)]\s*)?(?:추정\s*가격|공사\s*예정\s*금액)[^.。「」]{2,50}?(?:평가\s*기준|용역|입찰\s*공사|공사|물품))/)
      // "세부기준(추정가격 5억원 미만 2억원 이상)에 따라"처럼 괄호 안에 구간만 적은 문장
      ?? s.match(/[(（]\s*((?:추정\s*가격|공사\s*예정\s*금액)\s*\d[^.。()（）]{2,40}?(?:이상|미만|이하|초과))\s*[)）]/);
    if (m && /(이상|미만)/.test(m[1]) && /(적용|의하여|따라|의거|심사|평가)/.test(s)) return { value: clip(m[1].replace(/\s+/g, " "), 80), quote: clip(s) };
  }
  return undefined;
}

function readPass(all: string[]): NoticeCriteria["pass"] {
  // 협상: 기술능력 평가점수가 배점한도의 N% 이상
  for (const s of all) {
    const m = s.match(new RegExp(String.raw`기술\s*(?:능력)?\s*평가\s*(?:점수|결과)?[^.]{0,30}?배점\s*한도의\s*${NUM}\s*%\s*이상`));
    if (m && Number(m[1]) >= 50 && Number(m[1]) <= 95) return { value: { kind: "techRatio", ratio: Number(m[1]) / 100 }, quote: clip(s) };
  }
  // 적격심사 종합평점 / 협상 합산점수 N점 이상 (낙찰자·적격자·협상대상자 문장 우선)
  const re = new RegExp(String.raw`(종합\s*평점|종합\s*점수|합산\s*점수|평가\s*점수의\s*합산|총점|적격\s*심사|적격\s*통과\s*점수|통과\s*점수)[^.]{0,30}?${NUM}점\s*이상`);
  const hits: { s: string; v: number; w: number }[] = [];
  for (const s of all) {
    const m = s.match(re);
    if (!m) continue;
    const v = Number(m[2]);
    if (!(v >= 60 && v <= 100)) continue;
    if (/등급|S\s*등급|A\s*등급|정성|위원/.test(s.slice(0, (m.index ?? 0) + m[0].length)) && !/종합\s*평점|합산/.test(s)) continue;
    // 구간·용역 종류마다 통과 점수를 나열한 세부기준 문장("10억원 이상은 90점 이상, 10억원 미만은 95점 이상")은 뒤로 미룬다
    const listed = new Set([...s.matchAll(new RegExp(String.raw`${NUM}점\s*이상`, "g"))].map((x) => x[1])).size > 1;
    hits.push({ s, v, w: (/낙찰자|적격자|협상\s*(?:대상|적격)자|선정/.test(s) ? 2 : 0) + (/종합\s*평점|합산\s*점수/.test(m[1]) ? 1 : 0) - (listed ? 3 : 0) });
  }
  if (!hits.length) return undefined;
  const best = hits.sort((a, b) => b.w - a.w)[0];
  return { value: { kind: "total", score: best.v }, quote: clip(best.s) };
}

function readLowerLimit(all: string[]): NoticeCriteria["lowerLimit"] {
  for (const s of all) {
    const m = s.match(new RegExp(String.raw`낙찰\s*하한율\s*[(（:：은는이]?\s*(?:[^0-9.%]{0,10})?${NUM}\s*%`));
    if (m && Number(m[1]) >= 70 && Number(m[1]) <= 95) return { value: Number(m[1]), quote: clip(s) };
  }
  // "낙찰하한율은 물품구매 10억원 미만 고시금액 이상으로 80.495%", "낙찰 하한율(입찰가격-A를 예정가격-A로 나눈 결과 89.745%)":
  // 사이에 금액 구간·산식 낱말이 끼어 있으면 소수 셋째 자리까지 적힌 비율만 하한율로 본다
  for (const s of all) {
    const m = s.match(/낙찰\s*하\s*한\s*율[^%。]{0,60}?(\d{2}\.\d{3})\s*%/);
    if (m && Number(m[1]) >= 70 && Number(m[1]) <= 95) return { value: Number(m[1]), quote: clip(s) };
  }
  return undefined;
}

function readTrustRange(all: string[]): NoticeCriteria["trustRange"] {
  for (const s of all) {
    const m = s.match(/신인도[^.]{0,20}?[(（]?\s*[+＋]\s*(\d(?:\.\d+)?)\s*점?\s*[∼~～\-–]\s*[△▲\-−–]\s*(\d(?:\.\d+)?)\s*점?/);
    if (m) return { value: { plus: Number(m[1]), minus: Number(m[2]) }, quote: clip(s) };
  }
  return undefined;
}

function readFinanceBase(text: string): NoticeCriteria["financeBase"] {
  const t = normalize(text);
  if (!/기준\s*비율|기업\s*경영\s*분석/.test(t)) return undefined;
  const eq = t.match(new RegExp(String.raw`자기\s*자본\s*비율\s*[:：]?\s*${NUM}\s*%`));
  const cu = t.match(new RegExp(String.raw`유동\s*비율\s*[:：]?\s*${NUM}\s*%`));
  if (!eq && !cu) return undefined;
  const v = { equity: eq ? Number(eq[1]) : undefined, current: cu ? Number(cu[1]) : undefined };
  const at = eq?.index ?? cu?.index ?? 0;
  // 기준비율이 적힌 줄과 그 앞 줄(출처: 기업경영분석 등)
  const lineStart = t.lastIndexOf("\n", at - 1) + 1;
  const prevStart = t.lastIndexOf("\n", Math.max(0, lineStart - 2)) + 1;
  const lineEnd = t.indexOf("\n", at);
  return { value: v, quote: clip(t.slice(prevStart, lineEnd < 0 ? undefined : lineEnd)) };
}

function readRefAmount(all: string[]): NoticeCriteria["refAmount"] {
  // "평가 기준금액: 금…원", "기준금액(추정가격)은 금229,750,000원", "※ 기준금액 : 금1,549,800,000원(금일십오억…)"
  // 금액 앞에 업무 이름이 붙어 여러 금액으로 나뉘어 있으면(예: 처리 …원, 운반 …원) 어느 것을 쓸지 몰라 읽지 않는다
  // (합계 뒤에 업무별 내역이 이어지는 "기준금액: 금482,390,909원 -건물시설관리: 금…원"은 앞의 합계를 쓴다)
  const re = /(?:평가\s*)?기준\s*금액\s*(?:[(（]\s*[가-힣\s]{2,10}\s*[)）])?\s*[:：은는]?\s*([가-힣]{1,8}\s*)?금?\s*([\d,]{7,})\s*원/;
  for (const s of all) {
    const m = s.match(re);
    if (!m) continue;
    const amounts = s.slice(m.index ?? 0).match(/[\d,]{7,}\s*원/g) ?? [];
    if (m[1] && !/^금$/.test(m[1].trim()) && amounts.length > 1) continue;
    const v = Number(m[2].replace(/,/g, ""));
    if (v >= 1_000_000) return { value: v, quote: clip(s) };
  }
  return undefined;
}

const PERF_RE = /(이행\s*실적|납품\s*실적|시공\s*실적|수행\s*실적|유사\s*(?:용역|실적)|동[일종]\s*(?:용역|실적))/;
function readRecognition(all: string[]): string[] | undefined {
  const out: string[] = [];
  for (const s of all) {
    if (!PERF_RE.test(s)) continue;
    if (!/(최근\s*\d+\s*년|인정|합계|기준으로|이행이\s*완료|준공|제외)/.test(s)) continue;
    if (/서식|첨부|제출\s*서류\s*목록/.test(s) && !/최근/.test(s)) continue;
    const t = clip(s, 140);
    const key = t.replace(/[\s\d)①-⑳.,]/g, "").slice(0, 30);
    if (!out.some((o) => o.replace(/[\s\d)①-⑳.,]/g, "").slice(0, 30) === key)) out.push(t);
    if (out.length >= 4) break;
  }
  return out.length ? out : undefined;
}

/** "4. 입찰참가자격", "□ 입찰 참가자격", "Ⅲ. 참가자격 및 제한" 같은 머리 줄 */
const QUAL_HEAD = /^\s*(?:\d{1,2}\s*[.)]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*\.?|[□■◎●▣]|제\s*\d+\s*조)?\s*(?:입찰\s*)?참\s*가\s*자\s*격(?:\s*(?:및|등)\s*[가-힣\s]{1,12})?\s*[:：]?\s*$/;
/** 같은 수준의 다음 머리 줄 (참가자격 절이 끝나는 곳) */
const NEXT_HEAD = /^\s*(?:\d{1,2}\s*[.)]\s*\S|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*\.|[□■◎●▣]\s*\S|제\s*\d+\s*조)/;
/** 참가자격 안의 항목 머리 (가. / 1) / (1) / ○ / - / ①) */
const ITEM_HEAD = /^\s*(?:[가-하]\s*[.)]|\(?\d{1,2}\)|[○◦·•▪\-※]|[①-⑳])\s*/;
/** 모든 공고에 같은 절차 문구 (지문인식·인증서·조세포탈 서약 등)는 빼고 그 공고만의 자격만 남긴다 */
const QUAL_BOILER = /(지문|개인\s*인증서|조세\s*포탈|서약서|전자\s*입찰\s*이용자\s*등록|입찰\s*대리인)|^아래의?\s.*(?:모두|갖춘)/;

/** 같은 공고서가 PDF·HWP로 함께 오면 참가자격 절도 여러 번 나온다: 항목을 가장 많이(같으면 길게) 읽은 쪽을 쓴다 (PDF는 줄이 끊겨 짧게 읽히기도 한다) */
function readQualify(text: string): string[] | undefined {
  const lines = normalize(text).split(/\r?\n/);
  let best: string[] | undefined;
  const size = (l: string[]) => l.length * 1000 + l.join("").length;
  for (let n = 0; n < lines.length; n++) {
    if (!QUAL_HEAD.test(lines[n]) || lines[n].trim().length > 40) continue;
    const items: string[] = [];
    let cur = "";
    const push = () => { const t = cur.replace(/\s+/g, " ").trim(); if (t.length >= 10 && !QUAL_BOILER.test(t)) items.push(clip(t, 180)); cur = ""; };
    for (let k = n + 1; k < Math.min(lines.length, n + 40); k++) {
      const l = lines[k].trim();
      if (!l || /^[-─━=]{5,}$/.test(l)) continue;
      if (NEXT_HEAD.test(l) && !ITEM_HEAD.test(l)) break;
      if (ITEM_HEAD.test(l)) { push(); cur = l.replace(ITEM_HEAD, ""); }
      else cur += ` ${l}`;
    }
    push();
    const got = items.slice(0, 8);
    if (got.length && (!best || size(got) > size(best))) best = got;
  }
  return best;
}

export function readNoticeCriteria(text: string): NoticeCriteria | undefined {
  if (!text || text.length < 200) return undefined;
  const all = sentences(text);
  const out: NoticeCriteria = {
    standard: readStandard(all),
    tier: readTier(all),
    pass: readPass(all),
    lowerLimit: readLowerLimit(all),
    trustRange: readTrustRange(all),
    financeBase: readFinanceBase(text),
    refAmount: readRefAmount(all),
    recognition: readRecognition(all),
    qualify: readQualify(text),
  };
  (Object.keys(out) as (keyof NoticeCriteria)[]).forEach((k) => out[k] === undefined && delete out[k]);
  return Object.keys(out).length ? out : undefined;
}
