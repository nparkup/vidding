/**
 * 기업명으로 업체 찾기: 낙찰 저장소(R2)의 10년치 낙찰업체와 개찰 1~5위 업체를 이름으로 찾는 색인.
 * 수집(scripts/awards/collect.ts)이 idx/corps/{000~1023}.json.gz 로 만들고, 중계 서버(worker/corp-lookup ?corps=)가 읽는다.
 * 이름 앞 두 글자(법인 형태 글자를 뺀 것)로 파일을 나눠 파일 하나를 작게(수백 줄) 둔다. 중계 서버 무료 CPU 한도 안에서 읽게 하려는 것.
 * 이름 중간 낱말로도 찾게, 띄어쓰기·괄호로 나뉜 낱말 앞 두 글자에도 같은 업체를 넣는다.
 * Node 전용 모듈은 쓰지 않는다.
 */

export const CORP_BUCKETS = 1024;
/** 한 번에 돌려주는 후보 수 */
export const CORP_LIMIT = 30;

/** 색인 한 줄 */
export type CorpEntry = [
  bizno: string,
  /** 상호 (가장 최근 것이 앞, 예전 상호가 뒤) */ names: string[],
  /** 낙찰 공고 수 */ wins: number,
  /** 개찰 1~5위에 든 공고 수 (낙찰 포함) */ tops: number,
  /** 마지막으로 낙찰받거나 상위에 든 날 YYYY-MM-DD */ last: string,
  /** 가장 많은 업무 (용역·공사·물품) */ biz: string,
  /** 지역 제한 공고로 본 주 지역 (시·도, 없으면 "") */ region: string,
];
export interface CorpIndexFile { v: 1; rows: CorpEntry[] }

/** 화면에 보내는 후보 */
export interface CorpHit {
  bizno: string;
  name: string;
  /** 예전 상호 */
  formerNames: string[];
  wins: number;
  tops: number;
  last: string;
  biz: string;
  region: string;
}
export interface CorpSearchResult { ready: boolean; query: string; total: number; hits: CorpHit[]; error?: string }

/** 상호 앞뒤에 붙는 법인 형태 (찾을 때는 빼고 본다) */
const FORMS = [
  "농업회사법인", "영농조합법인", "어업회사법인", "사회적협동조합", "주식회사", "유한회사", "유한책임회사", "합자회사", "합명회사",
  "사단법인", "재단법인", "사회복지법인", "협동조합",
];
const FORM_ABBR = /[(（]\s*(주|유|합|사|재|합자|유한|사단|재단|복)\s*[)）]|㈜|㈔|㈕|㈖|㈗|㈘|㈙|㈚|㈛/g;

/** 이름 → 찾기용 글자 (법인 형태·띄어쓰기·기호를 빼고 영문은 소문자) */
export function normCorpName(name: string): string {
  let s = (name ?? "").replace(FORM_ABBR, " ");
  for (const f of FORMS) s = s.split(f).join(" ");
  return s.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

/** 이름에서 찾을 수 있는 시작점들: 이름 전체, 그리고 띄어쓰기·괄호 뒤 낱말 (각각 찾기용 글자) */
export function corpNameKeys(name: string): string[] {
  let s = (name ?? "").replace(FORM_ABBR, " ");
  for (const f of FORMS) s = s.split(f).join(" ");
  const words = s.split(/[\s()（）[\]·,.&/_-]+/).map(normCorpName).filter(Boolean);
  const out = new Set<string>();
  const whole = normCorpName(name);
  if (whole) out.add(whole);
  // 낱말 i 부터 끝까지 이은 것 (예: "한국 환경 산업" → 환경산업, 산업)
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join("");
    if (tail.length >= 2) out.add(tail);
  }
  return [...out];
}

/** 찾기용 글자 앞 두 글자 → 색인 파일 번호 (000~1023) */
export function corpBucket(key: string): string {
  const p = key.slice(0, 2);
  let h = 2166136261;
  for (let i = 0; i < p.length; i++) { h ^= p.charCodeAt(i); h = Math.imul(h, 16777619); }
  return String((h >>> 0) % CORP_BUCKETS).padStart(3, "0");
}

/** 색인 파일 하나에서 검색어로 시작하는 업체를 고른다 (낙찰 많은 순, 같으면 최근 순) */
export function matchCorps(file: CorpIndexFile, query: string): { total: number; hits: CorpHit[] } {
  const q = normCorpName(query);
  const found: CorpHit[] = [];
  for (const [bizno, names, wins, tops, last, biz, region] of file.rows) {
    if (!names.some((n) => corpNameKeys(n).some((k) => k.startsWith(q)))) continue;
    found.push({ bizno, name: names[0], formerNames: names.slice(1), wins, tops, last, biz, region });
  }
  // 이름이 검색어와 똑같은 업체를 먼저, 그다음 낙찰 많은 순
  const exact = (h: CorpHit) => (normCorpName(h.name) === q ? 1 : 0);
  found.sort((a, b) => exact(b) - exact(a) || b.wins - a.wins || b.tops - a.tops || b.last.localeCompare(a.last));
  return { total: found.length, hits: found.slice(0, CORP_LIMIT) };
}

/** 중계 서버용: R2에서 검색어의 색인 파일을 읽어 찾는다 */
export async function searchCorps(
  bucket: { get(key: string): Promise<{ body: ReadableStream } | null> } | undefined,
  query: string,
): Promise<CorpSearchResult> {
  const q = normCorpName(query);
  if (q.length < 2) return { ready: true, query, total: 0, hits: [], error: "기업명을 두 글자 이상 넣어 주세요." };
  if (!bucket) return { ready: false, query, total: 0, hits: [] };
  const obj = await bucket.get(`idx/corps/${corpBucket(q)}.json.gz`);
  if (!obj) return { ready: false, query, total: 0, hits: [] };
  const text = await new Response(obj.body.pipeThrough(new DecompressionStream("gzip"))).text();
  return { ready: true, query, ...matchCorps(JSON.parse(text) as CorpIndexFile, q) };
}

/** 사업자번호 모양 (숫자 10자리, 하이픈 허용)인지: 아니면 기업명으로 찾는다 */
export const looksLikeBizno = (v: string) => /^[\d\s-]+$/.test(v.trim()) && v.replace(/\D/g, "").length >= 3;
