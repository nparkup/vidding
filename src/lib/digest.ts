import { rank, type MatchResult } from "./analysis";
import type { Bid, ClientProfile } from "./types";

export interface Digest {
  client: ClientProfile;
  recommended: MatchResult[];
  closingSoon: MatchResult[];
  newToday: number;
  excluded: number;
}

/** 영업일 아침 발송되는 맞춤 공고 요약 */
export function buildDigest(client: ClientProfile, bids: Bid[], now = new Date()): Digest {
  const ranked = rank(bids.filter((b) => client.categories.length === 0 || client.categories.includes(b.category) || b.category === "통합관리"), client, now);
  const eligible = ranked.filter((r) => r.eligible);
  const dayAgo = now.getTime() - 36 * 3600 * 1000;
  return {
    client,
    recommended: eligible.slice(0, 5),
    closingSoon: eligible.filter((r) => r.daysLeft <= 3).slice(0, 3),
    newToday: eligible.filter((r) => new Date(r.bid.postedAt).getTime() >= dayAgo).length,
    excluded: ranked.length - eligible.length,
  };
}
