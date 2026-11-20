import { rank, type MatchResult } from "./analysis";
import { FACILITY_CATEGORIES, type Bid, type ClientProfile } from "./types";
import type { PreSpec } from "./preSpecs";

export interface Digest {
  client: ClientProfile;
  recommended: MatchResult[];
  closingSoon: MatchResult[];
  newToday: number;
  excluded: number;
  /** 새로 공개된 같은 분야 사전규격 (파트너 요금제만, 최대 5건) */
  preSpecs: PreSpec[];
}

/** 영업일 아침 발송되는 맞춤 공고 요약 */
export function buildDigest(client: ClientProfile, bids: Bid[], now = new Date(), preSpecs: PreSpec[] = []): Digest {
  // 관심 업종이 없으면 전 업종. 청소·시설관리 계열을 고른 고객에게는 통합관리 공고도 함께 보낸다
  const facility = client.categories.some((c) => FACILITY_CATEGORIES.includes(c));
  const wanted = (b: Bid) => client.categories.length === 0 || client.categories.includes(b.category) || (facility && b.category === "통합관리");
  const ranked = rank(bids.filter(wanted), client, now);
  const eligible = ranked.filter((r) => r.eligible);
  const dayAgo = now.getTime() - 36 * 3600 * 1000;
  return {
    client,
    recommended: eligible.slice(0, 5),
    closingSoon: eligible.filter((r) => r.daysLeft <= 3).slice(0, 3),
    newToday: eligible.filter((r) => new Date(r.bid.postedAt).getTime() >= dayAgo).length,
    excluded: ranked.length - eligible.length,
    preSpecs: client.plan === "partner" ? matchPreSpecs(client, preSpecs, now) : [],
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
