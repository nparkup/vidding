import { evaluate, rank, type MatchResult } from "./analysis";
import { keywordHits, titleMatchesKeywords } from "./keywords";
import { KEY_FIELDS, type NoticeChange } from "./noticeChanges";
import { FACILITY_CATEGORIES, type Bid, type ClientProfile } from "./types";
import type { PreSpec } from "./preSpecs";
import type { OrderPlan } from "./orderPlans";

export interface KeywordSection {
  keyword: string;
  /** 새로 올라온 키워드 공고 (참가 가능 여부 포함, 5건까지) */
  items: MatchResult[];
  /** 새 공고 수 */
  fresh: number;
  /** 진행 중인 키워드 공고 전체 수 */
  total: number;
}

export interface WatchedChange {
  change: NoticeChange;
  /** 왜 이 고객에게 보내는지 */
  reason: "관심 공고" | "추천 공고" | "관심 키워드";
}

export interface Digest {
  client: ClientProfile;
  recommended: MatchResult[];
  closingSoon: MatchResult[];
  newToday: number;
  excluded: number;
  /** 새로 공개된 같은 분야 사전규격 (파트너 요금제만, 최대 5건) */
  preSpecs: PreSpec[];
  /** 새로 올라온 같은 분야 발주계획 (파트너 요금제만, 최대 5건) */
  orderPlans: OrderPlan[];
  /** 관심 키워드별 새 공고 */
  keywords: KeywordSection[];
  /** 관심·추천 공고의 정정·취소 (최근 36시간) */
  changes: WatchedChange[];
}

/**
 * 고객과 관련된 정정·취소: 관심 공고(공고번호 기준)는 모든 정정·취소, 참가 가능 공고·관심 키워드 공고는
 * 금액·마감·개찰·자격·낙찰방법이 바뀐 정정과 취소만 (공고서 문구만 고친 정정까지 보내면 너무 많다).
 * 관심 공고 > 추천 공고 > 관심 키워드 순, 최근 게시 순.
 */
export function changesFor(client: ClientProfile, changes: NoticeChange[], eligibleIds: Set<string>, keywordNos: Set<string>, since?: number): WatchedChange[] {
  const watched = new Set(client.watchlist.map((id) => id.split("-")[0]));
  const order = { "관심 공고": 0, "추천 공고": 1, "관심 키워드": 2 } as const;
  const out: WatchedChange[] = [];
  for (const c of changes) {
    if (since && new Date(c.at).getTime() < since) continue;
    const matters = c.kind === "취소" || c.fields.some((f) => KEY_FIELDS.includes(f.field));
    const reason = watched.has(c.no) ? "관심 공고"
      : !matters ? null
      : c.bidId && eligibleIds.has(c.bidId) ? "추천 공고"
      : keywordNos.has(c.no) || (c.kind === "취소" && titleMatchesKeywords(c.title, client.keywords ?? [])) ? "관심 키워드" : null;
    if (reason) out.push({ change: c, reason });
  }
  return out.sort((a, b) => order[a.reason] - order[b.reason] || b.change.at.localeCompare(a.change.at));
}

/** 영업일 아침 발송되는 맞춤 공고 요약 */
export function buildDigest(client: ClientProfile, bids: Bid[], now = new Date(), preSpecs: PreSpec[] = [], allChanges: NoticeChange[] = [], orderPlans: OrderPlan[] = []): Digest {
  // 관심 업종이 없으면 전 업종. 청소·시설관리 계열을 고른 고객에게는 통합관리 공고도 함께 보낸다
  const facility = client.categories.some((c) => FACILITY_CATEGORIES.includes(c));
  const wanted = (b: Bid) => client.categories.length === 0 || client.categories.includes(b.category) || (facility && b.category === "통합관리");
  const ranked = rank(bids.filter(wanted), client, now);
  const eligible = ranked.filter((r) => r.eligible);
  const dayAgo = now.getTime() - 36 * 3600 * 1000;
  // 관심 키워드: 업종·면허·지역 조건과 상관없이 단어로 찾는다 (참가 가능 여부는 함께 표시)
  const hits = keywordHits(bids, client.keywords ?? [], { since: dayAgo, now });
  const keywords = hits.map((h) => ({
    keyword: h.keyword,
    items: h.bids.filter((b) => new Date(b.postedAt).getTime() >= dayAgo).slice(0, 5).map((b) => evaluate(b, client, now)),
    fresh: h.fresh,
    total: h.bids.length,
  }));
  const kwNos = new Set(hits.flatMap((h) => h.bids.map((b) => b.bidNtceNo)));
  return {
    client,
    recommended: eligible.slice(0, 5),
    closingSoon: eligible.filter((r) => r.daysLeft <= 3).slice(0, 3),
    newToday: eligible.filter((r) => new Date(r.bid.postedAt).getTime() >= dayAgo).length,
    excluded: ranked.length - eligible.length,
    preSpecs: client.plan === "partner" ? matchPreSpecs(client, preSpecs, now) : [],
    orderPlans: client.plan === "partner" ? matchOrderPlans(client, orderPlans, now) : [],
    keywords,
    changes: changesFor(client, allChanges, new Set(eligible.map((r) => r.bid.id)), kwNos, dayAgo),
  };
}

/** 사전규격 선제 알림: 관심 분야·금액 범위에 맞고 최근 36시간 안에 공개됐으며 의견 마감 전인 사전규격 */
export function matchPreSpecs(client: ClientProfile, list: PreSpec[], now = new Date()): PreSpec[] {
  const since = now.getTime() - 36 * 3600 * 1000;
  const facility = client.categories.some((c) => FACILITY_CATEGORIES.includes(c));
  return list
    .filter((p) => new Date(p.postedAt).getTime() >= since && (!p.opinionBy || new Date(p.opinionBy).getTime() >= now.getTime()))
    .filter((p) => client.categories.length === 0 || client.categories.includes(p.category) || (facility && p.category === "통합관리"))
    .filter((p) => !p.budget || ((!client.minAmount || p.budget >= client.minAmount) && (!client.maxAmount || p.budget <= client.maxAmount * 1.1)))
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 5);
}

/** 발주계획 선제 알림: 관심 분야·금액 범위에 맞고 최근 36시간 안에 올라오거나 바뀐 발주계획 (공고가 이미 보이는 건 뺀다) */
export function matchOrderPlans(client: ClientProfile, list: OrderPlan[], now = new Date()): OrderPlan[] {
  const since = now.getTime() - 36 * 3600 * 1000;
  const facility = client.categories.some((c) => FACILITY_CATEGORIES.includes(c));
  return list
    .filter((p) => new Date(p.postedAt).getTime() >= since && !p.bidIds?.length)
    .filter((p) => client.categories.length === 0 || client.categories.includes(p.category) || (facility && p.category === "통합관리"))
    .filter((p) => !p.amount || ((!client.minAmount || p.amount >= client.minAmount) && (!client.maxAmount || p.amount <= client.maxAmount * 1.1)))
    .sort((a, b) => a.month.localeCompare(b.month) || b.amount - a.amount)
    .slice(0, 5);
}
