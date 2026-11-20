/**
 * 관심 키워드 알림.
 *
 * 고객이 "CCTV", "급식", "학교 청소"처럼 단어를 등록하면 공고명(과 세부품명·투찰가능업종)에 그 단어가 든 공고를
 * 맞춤공고 메일에 따로 모아 보낸다. 면허·지역 조건과 상관없이 단어로 찾되, 참가 가능 여부는 함께 표시한다.
 *
 * 규칙
 * - 쉼표·줄바꿈으로 나눈 하나하나가 키워드. 키워드 안의 띄어쓰기로 나눈 단어가 모두 들어 있으면 일치 (순서·띄어쓰기 무관)
 * - "-" 로 시작하는 단어는 제외어: 그 단어가 든 공고는 모든 키워드에서 뺀다 (예: "-설계")
 * - 대소문자를 가리지 않는다 (cctv = CCTV)
 */
import type { Bid } from "./types";

export const MAX_KEYWORDS = 20;
const MAX_LEN = 30;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 입력란 문자열 → 키워드 목록 (중복·빈 값 제거, 최대 20개) */
export function parseKeywords(text: string | string[] | undefined): string[] {
  const parts = (Array.isArray(text) ? text : [text ?? ""]).flatMap((t) => t.split(/[,\n，、]/));
  const out: string[] = [];
  for (const p of parts) {
    const k = p.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
    if (!k || k === "-") continue;
    if (!out.some((x) => norm(x) === norm(k))) out.push(k);
  }
  return out.slice(0, MAX_KEYWORDS);
}

/** 제외어("-단어")와 찾을 키워드로 나눈다 */
export function splitKeywords(keywords: string[]): { include: string[]; exclude: string[] } {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const k of keywords) {
    if (k.startsWith("-")) exclude.push(...k.slice(1).split(/\s+/).map(norm).filter(Boolean));
    else include.push(k);
  }
  return { include, exclude };
}

const hay = (b: Bid) => norm(`${b.title} ${b.cls?.nm ?? ""} ${b.licenseRaw ?? ""}`);

/** 공고가 키워드 하나에 맞는지 (제외어는 따로 확인) */
export function matchesKeyword(b: Bid, keyword: string, text = hay(b)): boolean {
  const words = keyword.split(/\s+/).map(norm).filter(Boolean);
  return words.length > 0 && words.every((w) => text.includes(w));
}

export interface KeywordHit {
  keyword: string;
  /** 키워드에 맞는 진행 중 공고 (최근 게시 순) */
  bids: Bid[];
  /** 그중 since 이후 게시된 새 공고 수 */
  fresh: number;
}

/**
 * 키워드마다 맞는 공고. since(ms)를 주면 그 이후 게시된 공고를 앞에 두고 개수를 센다.
 * 마감이 지난 공고는 뺀다.
 */
export function keywordHits(bids: Bid[], keywords: string[], opts: { since?: number; now?: Date } = {}): KeywordHit[] {
  const { include, exclude } = splitKeywords(keywords);
  if (!include.length) return [];
  const now = (opts.now ?? new Date()).getTime();
  const open = bids.filter((b) => new Date(b.closeAt).getTime() > now);
  const texts = new Map(open.map((b) => [b.id, hay(b)]));
  const pool = exclude.length ? open.filter((b) => !exclude.some((w) => texts.get(b.id)!.includes(w))) : open;
  return include.map((keyword) => {
    const hit = pool.filter((b) => matchesKeyword(b, keyword, texts.get(b.id)));
    hit.sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt) || +new Date(a.closeAt) - +new Date(b.closeAt));
    const fresh = opts.since ? hit.filter((b) => new Date(b.postedAt).getTime() >= opts.since!).length : hit.length;
    return { keyword, bids: hit, fresh };
  });
}

/** 공고명이 키워드 중 하나에 맞는지 (제외어 포함). 취소된 공고처럼 공고 목록에 없는 건에 쓴다 */
export function titleMatchesKeywords(title: string, keywords: string[]): boolean {
  const { include, exclude } = splitKeywords(keywords);
  const t = norm(title);
  if (!include.length || exclude.some((w) => t.includes(w))) return false;
  return include.some((k) => { const ws = k.split(/\s+/).map(norm).filter(Boolean); return ws.length > 0 && ws.every((w) => t.includes(w)); });
}
