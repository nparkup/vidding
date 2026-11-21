import "server-only";
import { isSideDeal, type AptBid, type AptHistory, type AptPastDeal } from "../apt";
import { COMPARABLE, fetchAptEntrants, type AptAward, type AptEntrants } from "./client";

/**
 * 아파트 예측의 '낙찰 결과로 본 예측'. 나라장터 예측(ForecastCard)과 같은 자리에 같은 단지의 지난 계약,
 * 같은 지역·업종의 비슷한 낙찰, 경쟁 강도(응찰 업체 수), 참가 예상 기업을 붙인다.
 * K-apt 낙찰 결과에는 예정가격이 없어 낙찰률은 내지 않는다. 응찰 업체는 이름만 쓰고 담당자 이름·전화는 버린다.
 */
const SAME_MAX = 4;
const SIMILAR_SHOW = 5;
/** 경쟁 강도·참가 예상 기업을 셀 비슷한 낙찰 수 */
const POOL = 15;
/** 금액이 이 배율 안이면 비슷한 규모로 본다 */
const BAND: [number, number] = [0.5, 2];

const kind = isSideDeal;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function attachAptHistory(bids: AptBid[], awards: AptAward[]): Promise<{ attached: number; asked: number; cached: number; failed: number; error?: string }> {
  const byKey = new Map<string, AptAward[]>();
  const byArea = new Map<string, AptAward[]>();
  for (const a of awards) {
    if (!a.prior.closedAt || !(a.prior.amount > 0)) continue;
    (byKey.get(a.key) ?? byKey.set(a.key, []).get(a.key)!).push(a);
    const cat = a.key.split("|")[1];
    if (a.prior.via === "낙찰" && a.area) (byArea.get(`${a.area}|${cat}`) ?? byArea.set(`${a.area}|${cat}`, []).get(`${a.area}|${cat}`)!).push(a);
  }
  const desc = (x: AptAward, y: AptAward) => (y.prior.closedAt ?? "").localeCompare(x.prior.closedAt ?? "");
  for (const l of byKey.values()) l.sort(desc);
  for (const l of byArea.values()) l.sort(desc);

  // 공고마다 같은 단지 지난 계약과 비슷한 낙찰 후보를 고른다
  const plan = new Map<AptBid, { same: AptAward[]; pool: AptAward[] }>();
  const urgent: string[] = [], later: string[] = [];
  for (const b of bids) {
    if (!COMPARABLE.includes(b.category) || new Date(b.closeAt).getTime() < Date.now()) continue;
    const k = kind(b.title);
    const same = (byKey.get(`${b.aptCode}|${b.category}`) ?? []).filter((a) => a.no !== b.no && kind(a.prior.title) === k).slice(0, SAME_MAX);
    const ref = same[0]?.prior.amount ?? (b.prior && kind(b.prior.title) === k ? b.prior.amount : undefined);
    const pool = (byArea.get(`${b.region}|${b.category}`) ?? [])
      .filter((a) => a.no !== b.no && kind(a.prior.title) === k && !a.key.startsWith(`${b.aptCode}|`) && (!ref || (a.prior.amount >= ref * BAND[0] && a.prior.amount <= ref * BAND[1])))
      .slice(0, POOL);
    if (!same.length && !pool.length) continue;
    plan.set(b, { same, pool });
    for (const a of same) if (a.prior.via === "낙찰") urgent.push(a.no);
    pool.slice(0, SIMILAR_SHOW).forEach((a) => urgent.push(a.no));
    pool.slice(SIMILAR_SHOW).forEach((a) => later.push(a.no));
  }
  // 마감 임박 공고의 같은 단지·보이는 비슷한 낙찰부터 묻는다
  const { map, asked, cached, failed, error } = await fetchAptEntrants([...urgent, ...later]);

  // 업종별 응찰 업체 수 분포 (경쟁 강도 기준)
  const countsByCat = new Map<string, number[]>();
  for (const [b, p] of plan) for (const a of [...p.same, ...p.pool]) {
    const e = map.get(a.no);
    if (e && e.n > 0) (countsByCat.get(b.category) ?? countsByCat.set(b.category, []).get(b.category)!).push(e.n);
  }
  const cuts = new Map<string, [number, number]>();
  for (const [cat, xs] of countsByCat) {
    const s = [...xs].sort((a, b) => a - b);
    if (s.length >= 30) cuts.set(cat, [s[Math.floor(s.length / 3)], s[Math.floor((s.length * 2) / 3)]]);
  }

  const deal = (a: AptAward, e?: AptEntrants, withApt = false): AptPastDeal => ({
    no: a.no,
    via: a.prior.via ?? "낙찰",
    date: a.prior.closedAt!,
    title: a.prior.title,
    apt: withApt ? a.apt : undefined,
    amount: a.prior.amount,
    winner: a.prior.via === "수의계약" ? a.prior.company : e?.winner,
    bidders: e && e.n > 0 ? e.n : undefined,
    entrants: !withApt && e && e.n > 0 ? e.names : undefined,
    start: a.prior.start,
    end: a.prior.end,
  });

  let attached = 0;
  for (const [b, p] of plan) {
    const h: AptHistory = {
      same: p.same.map((a) => deal(a, map.get(a.no))),
      similar: p.pool.slice(0, SIMILAR_SHOW).map((a) => deal(a, map.get(a.no), true)),
    };
    // 경쟁 강도: 같은 단지 낙찰 + 비슷한 낙찰의 응찰 업체 수
    const counted = [...p.same, ...p.pool].map((a) => map.get(a.no)?.n ?? 0).filter((n) => n > 0);
    const cut = cuts.get(b.category);
    if (counted.length >= 3 && cut) {
      const md = median(counted);
      const avg = Math.round((counted.reduce((x, y) => x + y, 0) / counted.length) * 10) / 10;
      const level = md <= cut[0] ? "낮음" : md > cut[1] ? "높음" : "보통";
      h.competition = { level, median: md, avg, n: counted.length, text: `같은 단지·${b.region} ${b.category} 비슷한 규모 낙찰 ${counted.length}건의 응찰 업체 수 가운데값 ${md}곳(평균 ${avg}곳). ${b.category} 전체에서 ${level === "낮음" ? "적은" : level === "높음" ? "많은" : "중간"} 편입니다.` };
    }
    // 참가 예상 기업: 같은 단지에서 응찰·낙찰한 업체를 먼저, 그다음 비슷한 낙찰에서 자주 응찰·낙찰한 업체
    const score = new Map<string, { sameWins: number; sameBids: number; wins: number; bids: number }>();
    const add = (name: string | undefined, same: boolean, win: boolean) => {
      if (!name) return;
      const v = score.get(name) ?? { sameWins: 0, sameBids: 0, wins: 0, bids: 0 };
      if (same) { v.sameBids++; if (win) v.sameWins++; } else { v.bids++; if (win) v.wins++; }
      score.set(name, v);
    };
    for (const a of p.same) {
      const e = map.get(a.no);
      if (a.prior.via === "수의계약") add(a.prior.company, true, true);
      else if (e) for (const n of e.names) add(n, true, n === e.winner);
    }
    for (const a of p.pool) {
      const e = map.get(a.no);
      if (e) for (const n of e.names) add(n, false, n === e.winner);
    }
    const likely = [...score].map(([name, v]) => ({ name, ...v }))
      .filter((v) => v.sameBids > 0 || v.bids >= 2 || v.wins > 0)
      .sort((x, y) => y.sameWins * 6 + y.sameBids * 3 + y.wins * 2 + y.bids - (x.sameWins * 6 + x.sameBids * 3 + x.wins * 2 + x.bids))
      .slice(0, 6);
    if (likely.length) h.likely = likely;
    b.history = h;
    attached++;
  }
  return { attached, asked, cached, failed, error };
}
