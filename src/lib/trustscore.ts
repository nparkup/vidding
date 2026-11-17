/**
 * 신뢰도 가감점(신인도) 평가.
 *
 * 기업이 해당하는 가점·감점 항목을 고르면, 평가 기준표의 항목별 점수로 가점·감점을 더하고
 * 상한·하한과 적용 원칙(같은 묶음은 높은 점수 하나, 가점은 수행능력이 만점에 못 미칠 때만)을 적용한다.
 *
 * 기준표 출처
 * - 일반용역(시설분야 포함): 조달청 일반용역 적격심사 세부기준(조달청 공고 제2026-390호, 2026.7.27. 시행)의
 *   신인도 배점한도 +4.25 ~ △5.0, 항목별 점수는 같은 기준을 옮긴 공고 첨부 기준표(추정가격 5억 원 이상, 2026년 공고)에서 확인.
 * - 기술용역: 조달청 기술용역 적격심사 세부기준(2026.5.26. 시행) 별표2. 고시금액 이상 +1.0 ~ △4.0, 미만 +3.5 ~ △4.0.
 * - 공사·물품: 세부 기준표를 대조하지 않았다. 일반용역 항목 점수를 준용하고, 상·하한은 평가표 배점을 따른다.
 * 공고서에 신인도 기준표가 있으면 그 상·하한과 항목별 점수를 우선한다(parseTrustRule).
 */

export interface TrustItem {
  id: string;
  label: string;
  /** 화면 묶음 */
  section: string;
  /** 같은 exclusive 값을 가진 항목끼리는 가장 유리한(감점은 가장 큰) 하나만 인정 */
  exclusive?: string;
  /** 고용 관련 법령 위반: 일반용역은 이 감점만큼 가점 상한을 줄인다 */
  employment?: boolean;
  /** 공고서 기준표에서 이 항목 줄을 찾는 말 */
  keywords: RegExp;
}

export const TRUST_ITEMS: TrustItem[] = [
  { id: "innoSme", label: "혁신형 중소기업 지정", section: "중소기업", exclusive: "sme", keywords: /혁신형\s*중소\s*기업/ },
  { id: "smallBiz", label: "소기업·소상공인 확인서", section: "중소기업", exclusive: "sme", keywords: /소기업\s*[·ㆍ,]?\s*소상공인\s*확인/ },
  { id: "women10", label: "여성기업 (존속 5년 이상 10년 미만)", section: "약자기업", exclusive: "women", keywords: /$^/ },
  { id: "women5", label: "여성기업 (존속 3년 이상 5년 미만)", section: "약자기업", exclusive: "women", keywords: /$^/ },
  { id: "women3", label: "여성기업 (존속 3년 미만)", section: "약자기업", exclusive: "women", keywords: /$^/ },
  { id: "disabledBiz", label: "장애인기업 확인서", section: "약자기업", keywords: /장애인\s*기업/ },
  { id: "genderEq", label: "남녀고용평등 우수기업", section: "고용", keywords: /남녀\s*고용\s*평등\s*우수/ },
  { id: "disabledEmpBest", label: "장애인고용우수사업주 선정", section: "고용", exclusive: "disabledEmp", keywords: /장애인\s*고용\s*우수\s*사업주/ },
  { id: "disabledEmpRate", label: "장애인 고용률 3.1% 이상", section: "고용", exclusive: "disabledEmp", keywords: /장애인\s*고용률/ },
  { id: "familyFriendly", label: "가족친화인증", section: "저출생 대응", keywords: /가족\s*친화\s*인증/ },
  { id: "workLife", label: "대한민국 일·생활균형 우수기업", section: "저출생 대응", keywords: /일\s*[·ㆍ]?\s*생활\s*균형\s*우수/ },
  { id: "socialEnt", label: "사회적기업·사회적협동조합·자활기업·마을기업", section: "정책지원", keywords: /사회적\s*기업|사회적\s*협동\s*조합|자활\s*기업|마을\s*기업/ },
  { id: "jobBest", label: "대한민국 일자리 으뜸기업", section: "정책지원", keywords: /일자리\s*으뜸/ },
  { id: "workStudy", label: "일·학습병행제 참여기업", section: "정책지원", keywords: /일\s*[·ㆍ]?\s*학습\s*병행/ },
  { id: "elderFriendly", label: "고령자친화기업", section: "정책지원", keywords: /고령자\s*친화/ },
  { id: "hrd", label: "인적자원개발 우수기업", section: "정책지원", keywords: /인적\s*자원\s*개발\s*우수/ },
  { id: "quality", label: "품질경영우수기업", section: "정책지원", keywords: /품질\s*경영\s*우수/ },
  { id: "wageArrears", label: "체불사업주 명단 공개 중", section: "감점", employment: true, keywords: /체불\s*사업주/ },
  { id: "employImprove", label: "고용개선조치 미이행 명단 공표 (최근 2년)", section: "감점", employment: true, keywords: /고용\s*개선\s*조치/ },
  { id: "subconHabit", label: "하도급법 상습위반자 (최근 2년)", section: "감점", exclusive: "subcon", keywords: /상습\s*위반/ },
  { id: "subconFine", label: "불공정 하도급 과징금 부과 (최근 2년)", section: "감점", exclusive: "subcon", keywords: /하도급.{0,12}과징금/ },
];

export interface TrustRule {
  /** 기준표 이름 (화면 표시) */
  name: string;
  /** 가점 상한 */
  plusCap: number;
  /** 감점 하한 (양수로 저장, 예: 5 = △5.0) */
  minusCap: number;
  /** 항목별 점수 (가점 +, 감점 −). 없는 항목은 이 기준표에서 0점 */
  points: Record<string, number>;
  /** 고용 관련 감점만큼 가점 상한을 줄이는지 (일반용역) */
  employmentReducesCap?: boolean;
  /** 상·하한을 공고서에서 읽었는지 */
  capFromNotice?: boolean;
  /** 공고서에서 읽은 값 설명 */
  fromNotice?: string[];
  /** 기준표를 공식 문서와 대조하지 않은 추정인지 */
  estimated?: boolean;
}

/** 조달청 일반용역(시설분야 포함) 적격심사 신인도 */
const GENERAL_POINTS: Record<string, number> = {
  innoSme: 1.5, smallBiz: 1.0,
  women10: 0.75, women5: 0.5, women3: 0.25, disabledBiz: 1.5,
  genderEq: 2.0, disabledEmpBest: 2.0, disabledEmpRate: 1.5,
  familyFriendly: 2.0, workLife: 2.0,
  socialEnt: 2.0, jobBest: 2.0, workStudy: 1.0, elderFriendly: 1.25, hrd: 1.0, quality: 0.5,
  wageArrears: -2.0, employImprove: -2.0, subconHabit: -2.0, subconFine: -1.0,
};

/** 조달청 기술용역 적격심사 별표2 신인도 (여성·장애인기업 가점은 고시금액 미만만) */
function techPoints(small: boolean): Record<string, number> {
  return {
    ...(small ? { women10: 0.5, women5: 0.5, women3: 0.25, disabledBiz: 0.2 } : {}),
    genderEq: 0.4, familyFriendly: 0.4, workLife: 0.4,
    socialEnt: 0.2, jobBest: 0.2, workStudy: 0.2,
    wageArrears: -2.0, employImprove: -2.0,
  };
}

/** 고시금액(용역 2.3억 원 내외) */
const NOTICE_AMOUNT = 230_000_000;

export function generalServiceRule(): TrustRule {
  return { name: "조달청 일반용역 적격심사 기준", plusCap: 4.25, minusCap: 5.0, points: { ...GENERAL_POINTS }, employmentReducesCap: true };
}

export function techServiceRule(amount: number): TrustRule {
  const small = amount > 0 && amount < NOTICE_AMOUNT;
  return { name: `조달청 기술용역 적격심사 기준 (고시금액 ${small ? "미만" : "이상"})`, plusCap: small ? 3.5 : 1.0, minusCap: 4.0, points: techPoints(small) };
}

/** 공사·물품: 기준표 미대조. 일반용역 항목 점수를 준용하고 상·하한은 따로 준다 */
export function estimatedRule(name: string, plusCap: number, minusCap: number): TrustRule {
  return { name, plusCap, minusCap, points: { ...GENERAL_POINTS }, estimated: true };
}

const NUM = String.raw`(\d{1,2}(?:\.\d{1,2})?)`;
const CAP_RE = new RegExp(String.raw`신\s*인\s*도[^\n]{0,40}?[+＋]\s*${NUM}\s*점?\s*[~∼～]\s*[△▲−\-–]\s*${NUM}`);

/**
 * 공고서·평가기준서 텍스트에서 신인도 상·하한과 항목별 점수를 읽어 기준표를 고친다.
 * 항목 이름이 있는 줄의 마지막 숫자(5점 이하)를 그 항목 점수로 본다. 감점 항목은 부호를 붙인다.
 */
export function parseTrustRule(text: string, base: TrustRule): TrustRule {
  let rule = base;
  if (/기술\s*용역\s*적격\s*심사/.test(text) && !/일반\s*용역\s*적격\s*심사/.test(text) && base.name.startsWith("조달청 일반용역")) {
    const amt = Number(text.match(/추정\s*가격[^\n]{0,10}?(\d{1,3}(?:,\d{3})+)\s*원/)?.[1]?.replace(/,/g, "")) || 0;
    rule = techServiceRule(amt);
  }
  const out: TrustRule = { ...rule, points: { ...rule.points }, fromNotice: [] };
  const cap = text.match(CAP_RE);
  if (cap) {
    out.plusCap = Number(cap[1]);
    out.minusCap = Number(cap[2]);
    out.capFromNotice = true;
    out.fromNotice!.push(`상·하한 +${cap[1]} ~ △${cap[2]}`);
  }
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  // 여성기업은 존속기간 구간 줄에서 읽는다
  const women = lines.findIndex((l) => /여성\s*기업/.test(l));
  if (women >= 0) {
    for (const l of lines.slice(women, women + 5)) {
      const v = l.match(new RegExp(String.raw`${NUM}\s*점?\s*$`))?.[1];
      if (!v || Number(v) > 5) continue;
      const id = /5\s*년\s*이상/.test(l) ? "women10" : /3\s*년\s*이상/.test(l) ? "women5" : /3\s*년\s*미만/.test(l) ? "women3" : undefined;
      if (id) { out.points[id] = Number(v); out.fromNotice!.push(`${TRUST_ITEMS.find((t) => t.id === id)!.label} ${v}점`); }
    }
  }
  for (const t of TRUST_ITEMS) {
    if (t.id.startsWith("women")) continue;
    const line = lines.find((l) => t.keywords.test(l));
    if (!line) continue;
    const nums = [...line.matchAll(new RegExp(String.raw`([△▲−\-–])?\s*${NUM}\s*점?(?=\s|$|\))`, "g"))];
    const last = nums[nums.length - 1];
    if (!last || !/\d\s*점?\s*\)?\s*$/.test(line)) continue;
    const v = Number(last[2]);
    if (!(v > 0 && v <= 5)) continue;
    const neg = t.section === "감점" || !!last[1];
    out.points[t.id] = neg ? -v : v;
    out.fromNotice!.push(`${t.label} ${neg ? "△" : ""}${v}점`);
  }
  if (!out.fromNotice!.length) delete out.fromNotice;
  return out;
}

export interface TrustScore {
  /** 상한 적용 전 가점 합 */
  plusRaw: number;
  /** 감점 합 (양수) */
  minus: number;
  /** 상·하한과 적용 원칙을 거친 가점 */
  plus: number;
  /** 최종 가감점 (가점 − 감점) */
  total: number;
  /** 인정된 항목 */
  applied: { id: string; label: string; points: number }[];
  /** 기준표에 점수가 없어 빠진 항목 */
  ignored: string[];
  notes: string[];
}

/**
 * 고른 항목으로 신뢰도 가감점을 계산한다.
 * @param plusRoom 가점을 넣을 수 있는 여유(수행능력 항목에서 잃은 점수). 없으면 제한하지 않는다
 */
export function scoreTrust(selected: string[], rule: TrustRule, plusRoom?: number): TrustScore {
  const best = new Map<string, { id: string; label: string; points: number }>();
  const ignored: string[] = [];
  for (const id of selected) {
    const t = TRUST_ITEMS.find((x) => x.id === id);
    if (!t) continue;
    const p = rule.points[id];
    if (!p) { ignored.push(t.label); continue; }
    const key = t.exclusive ?? t.id;
    const cur = best.get(key);
    if (!cur || Math.abs(p) > Math.abs(cur.points)) best.set(key, { id, label: t.label, points: p });
  }
  const applied = [...best.values()];
  const plusRaw = r2(applied.filter((a) => a.points > 0).reduce((s, a) => s + a.points, 0));
  const minusRaw = 0 + r2(-applied.filter((a) => a.points < 0).reduce((s, a) => s + a.points, 0));
  const notes: string[] = [];
  let cap = rule.plusCap;
  if (rule.employmentReducesCap) {
    const emp = r2(-applied.filter((a) => a.points < 0 && TRUST_ITEMS.find((t) => t.id === a.id)?.employment).reduce((s, a) => s + a.points, 0));
    if (emp > 0) { cap = Math.max(0, cap - emp); notes.push(`고용 관련 감점 ${emp}점만큼 가점 상한을 줄였습니다.`); }
  }
  let plus = Math.min(plusRaw, cap);
  if (plusRaw > cap) notes.push(`가점 ${plusRaw}점 중 상한 ${r2(cap)}점까지만 인정합니다.`);
  if (plusRoom !== undefined && plus > plusRoom) {
    plus = Math.max(0, plusRoom);
    notes.push(plusRoom > 0 ? `가점은 수행능력 점수가 만점에 못 미친 ${r2(plusRoom)}점 안에서만 더해집니다.` : "수행능력 점수가 이미 만점이라 가점이 더해지지 않습니다.");
  }
  const minus = Math.min(minusRaw, rule.minusCap) || 0;
  if (minusRaw > rule.minusCap) notes.push(`감점은 하한 △${rule.minusCap}점까지만 적용합니다.`);
  return { plusRaw, minus, plus: r2(plus), total: r2(plus - minus), applied, ignored, notes };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
