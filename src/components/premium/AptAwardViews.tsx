"use client";

import type { AptBid, AptHistory, AptPastDeal } from "@/lib/apt";
import type { AptPriceForecast } from "@/lib/aptPrice";
import { contractMonths } from "@/lib/aptPrice";
import { useMemo } from "react";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { NetworkGraph, type NetEdge, type NetNode } from "@/components/charts/NetworkGraph";
import { CHART } from "@/components/charts/useWidth";
import { won, wonAxis, wonFull } from "@/lib/format";

/**
 * 아파트 예측의 낙찰 결과 화면. 나라장터 예측의 ForecastCard·AwardAnalysisSection 과 같은 순서·모양으로 둔다.
 * K-apt 낙찰 결과에는 예정가격·투찰금액·개찰 순위가 없어, 낙찰률 대신 직전 계약 대비 변화율과 응찰 업체 수를 쓴다.
 * 업체는 이름만 보여 주고 담당자 이름·전화는 받지도 않는다.
 */
const LEVEL_TONE: Record<string, string> = {
  낮음: "bg-mint-50 text-mint-700",
  보통: "bg-ink-100 text-ink",
  높음: "bg-amber-100 text-ink",
};
const signed = (r: number) => `${r >= 1 ? "+" : ""}${((r - 1) * 100).toFixed(1)}%`;
const round = (x: number) => Math.round(x / 1000) * 1000;
const period = (d: AptPastDeal) => {
  if (!d.start || !d.end) return "";
  const m = contractMonths(d.start, d.end);
  return `계약 ${d.start} ~ ${d.end}${m ? ` (${m}개월)` : ""}`;
};
const label = (d: AptPastDeal) => (d.via === "수의계약" ? "수의계약" : "낙찰");

function likelyText(b: NonNullable<AptHistory["likely"]>[number]) {
  const same = [b.sameWins ? `낙찰 ${b.sameWins}회` : "", b.sameBids - b.sameWins > 0 ? `응찰 ${b.sameBids}회` : ""].filter(Boolean).join(" · ");
  const sim = [b.wins ? `낙찰 ${b.wins}회` : "", b.bids ? `응찰 ${b.bids}회` : ""].filter(Boolean).join(" · ");
  return [same && `${same} (같은 단지)`, sim && `${sim} (비슷한 낙찰)`].filter(Boolean).join(" / ");
}

/** 결과 패널: 낙찰 결과로 본 예측 (나라장터 예측과 같은 순서) */
export function AptForecastCard({ bid, f }: { bid: AptBid; f?: AptPriceForecast }) {
  const h = bid.history;
  if (!h && !f) return null;
  const prior = h?.same[0];
  const sameWins = h?.same.filter((d) => d.winner) ?? [];
  const keep = sameWins.length >= 2 && sameWins[0].winner === sameWins[1].winner;
  const recent = h ? (h.same.length > 1 ? h.same.slice(1, 4) : h.similar.slice(0, 3)) : [];
  const chance = h?.competition ? Math.round(100 / Math.max(1, h.competition.median)) : 0;
  return (
    <section className="card p-6">
      <h3 className="font-bold">낙찰 결과로 본 예측</h3>
      <dl className="mt-3 space-y-3 text-sm">
        {h?.competition && (
          <div>
            <dt className="flex items-center justify-between gap-2">
              <span className="text-ink-500">경쟁 강도</span>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${LEVEL_TONE[h.competition.level]}`}>{h.competition.level}</span>
            </dt>
            <dd className="mt-0.5 text-xs text-ink-500">{h.competition.text}</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-500">같은 단지 직전 계약</dt>
          {prior ? (
            <dd className="mt-1 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 text-base font-bold">{prior.winner || "업체명 확인 중"}</span>
                <span className="shrink-0 text-base font-bold tabular-nums">{won(prior.amount)}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">{[prior.date, label(prior), prior.bidders ? `${prior.bidders}곳 응찰` : "", period(prior)].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-ink-300">{prior.title}</p>
              {keep && <p className="mt-1 text-xs font-semibold text-ink-700">최근 두 번 모두 {sameWins[0].winner}이(가) 맡았습니다.</p>}
            </dd>
          ) : (
            <dd className="mt-0.5 text-xs text-ink-500">같은 단지의 같은 업종 낙찰·수의계약을 최근 3개 연도에서 찾지 못했습니다.</dd>
          )}
        </div>
        {f && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">직전 대비 낙찰금액 변화</dt>
            <dd className="text-right"><b className="tabular-nums">{won(round(f.mid))}</b> <span className="text-xs font-semibold tabular-nums text-ink-500">({signed(f.stat.median)})</span> <span className="block text-xs text-ink-300">{f.basis} 낙찰 {f.stat.n.toLocaleString()}건의 가운데값{f.scale !== 1 ? ` · 직전 대비 ${Math.round(f.scale * 100) / 100}배 규모` : ""}</span></dd>
          </div>
        )}
        {f && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="shrink-0 text-ink-500">예상 낙찰금액 구간</dt>
            <dd className="text-right"><b className="tabular-nums">{wonFull(round(f.low))}</b><span className="text-ink-300"> ~ </span><b className="tabular-nums">{wonFull(round(f.high))}</b> <span className="block text-xs text-ink-300">과거 낙찰 10~90% ({signed(f.stat.low)} ~ {signed(f.stat.high)})</span></dd>
          </div>
        )}
        {h?.likely && h.likely.length > 0 && (
          <div>
            <dt className="text-ink-500">참가 예상 기업</dt>
            <dd className="mt-1">
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                {h.likely.map((b) => (
                  <li key={b.name} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 px-3 py-1.5">
                    <span className="min-w-0 font-semibold">{b.name}</span>
                    <span className="text-xs text-ink-500">{likelyText(b)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-300">같은 단지에 응찰·낙찰했던 업체를 먼저, 그다음 같은 지역·업종 비슷한 규모 낙찰에 자주 응찰·낙찰한 업체 순서입니다.</p>
            </dd>
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <dt className="text-ink-500">{h!.same.length > 1 ? "같은 단지 이전 계약" : "비슷한 단지 최근 낙찰"}</dt>
            <dd className="mt-1">
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                {recent.map((r) => (
                  <li key={r.no} className="min-w-0 px-3 py-1.5">
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <span className="min-w-0 font-semibold">{r.winner || "업체명 확인 중"}</span>
                      <span className="shrink-0 font-bold tabular-nums">{won(r.amount)}</span>
                    </div>
                    <p className="text-xs text-ink-500">{[r.date, label(r), r.bidders ? `${r.bidders}곳 응찰` : ""].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs text-ink-300">{r.apt ? `${r.apt} · ` : ""}{r.title}</p>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {chance > 0 && (
          <div>
            <dt className="flex items-center justify-between gap-2">
              <span className="text-ink-500">응찰 업체 수로 본 기본 확률</span>
              <span className="font-bold tabular-nums">약 {chance}%</span>
            </dt>
            <dd className="mt-0.5 text-xs text-ink-500">응찰 업체 가운데값 {h!.competition!.median}곳이 모두 같은 조건일 때의 확률입니다. 적격심사 점수·가격에 따라 달라집니다.</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Box({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-ink-100 p-4">
      <p className="font-bold">{title}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** wide: 원 단위 전체 금액이 휴대폰에서도 한 줄에 들어가게 두 칸을 쓴다 */
function Fact({ label, value, note, wide }: { label: string; value: React.ReactNode; note?: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-paper px-3 py-2${wide ? " col-span-2" : ""}`}>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 font-bold tabular-nums [overflow-wrap:anywhere]">{value}</p>
      {note && <p className="text-xs text-ink-300">{note}</p>}
    </div>
  );
}

function Entrants({ d }: { d: AptPastDeal }) {
  if (!d.entrants?.length) return <p className="text-xs text-ink-300">{d.via === "수의계약" ? "수의계약은 응찰 업체가 없습니다." : "응찰 업체는 다음 갱신 때 채워집니다."}</p>;
  const list = [...d.entrants].sort((a, b) => Number(b === d.winner) - Number(a === d.winner));
  return (
    <>
      <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        {list.map((n) => (
          <li key={n} className={`flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-1.5 ${n === d.winner ? "bg-mint-50 sm:col-span-2" : "bg-paper"}`}>
            <span className={`min-w-0 [overflow-wrap:anywhere] ${n === d.winner ? "font-bold" : ""}`}>{n}</span>
            {n === d.winner ? (
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {d.amount > 0 && <b className="tabular-nums">{won(d.amount)}</b>}
                <span className="rounded bg-white px-1.5 text-xs font-semibold text-mint-700">낙찰</span>
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-xs text-ink-300">입찰가격 비공개</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-ink-300">K-apt 입찰결과는 낙찰 업체의 낙찰금액만 공개하고, 다른 응찰 업체의 입찰가격과 순위는 공개하지 않습니다.</p>
    </>
  );
}

/** 공고 내용 아래: 같은 단지 지난 계약 추이, 비슷한 낙찰, 업체별 응찰·낙찰 */
export function AptAwardSection({ bid }: { bid: AptBid }) {
  const h = bid.history;
  return (
    <section className="card min-w-0 p-6">
      <h3 className="text-lg font-bold">낙찰 결과 분석</h3>
      <p className="mt-1 text-sm text-ink-500">
        K-apt 입찰결과·수의계약 공지 최근 3개 연도에서 같은 단지·같은 업종의 지난 계약과, 같은 지역·업종에서 금액이 직전 계약의 0.5~2배인 최근 낙찰을 찾았습니다.<br />응찰 업체는 입찰결과의 응찰업체 목록에서 업체명만 가져옵니다.<br />K-apt는 낙찰 업체의 낙찰금액만 공개하고 다른 응찰 업체의 입찰가격과 순위는 공개하지 않아, 낙찰 업체 옆에만 금액을 표시합니다.
      </p>
      {!h ? (
        <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-sm text-ink-500">이 공고는 비교할 지난 낙찰이 없습니다.<br />같은 단지·같은 지역의 같은 업종 낙찰이 최근 3개 연도에 없거나 사이트가 다시 만들어질 때 채워집니다.</p>
      ) : (
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4">
          {/* 응찰 업체 목록 길이가 공고마다 달라 두 칸으로 나누면 빈 자리가 생긴다. 위아래로 쌓는다 */}
          <SameCard same={h.same} />
          {h.same.length >= 2 && <TrendCard same={h.same} />}
          <div className="min-w-0">
            <SimilarCard similar={h.similar} region={bid.region} category={bid.category} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <AptNetwork apt={bid.apt} h={h} />
          </div>
        </div>
      )}
    </section>
  );
}

function SameCard({ same }: { same: AptPastDeal[] }) {
  const d = same[0];
  if (!d) {
    return (
      <Box title="같은 단지 직전 계약" sub="같은 단지·같은 업종, 최근 3개 연도">
        <p className="text-sm text-ink-500">같은 단지의 같은 업종 계약을 찾지 못했습니다.<br />처음 입찰하는 단지이거나 3년 넘게 같은 업체와 계약한 경우일 수 있습니다.</p>
      </Box>
    );
  }
  return (
    <Box title="같은 단지 직전 계약" sub={`${d.date} ${label(d)} · 번호 ${d.no}`}>
      <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{d.title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Fact wide label={d.via === "수의계약" ? "계약금액" : "낙찰금액"} value={won(d.amount)} />
        <Fact wide label={d.via === "수의계약" ? "계약 업체" : "낙찰 업체"} value={d.winner || "-"} />
        <Fact label="응찰 업체" value={d.bidders ? `${d.bidders}곳` : "-"} note={d.via === "수의계약" ? "수의계약" : undefined} />
        <Fact label="계약 기간" value={d.start && d.end ? `${contractMonths(d.start, d.end) ?? "-"}개월` : "-"} note={d.start && d.end ? `${d.start} ~ ${d.end}` : "공지에 기간 없음"} />
      </div>
      <p className="mb-2 mt-4 text-xs font-semibold text-ink-500">응찰 업체</p>
      <Entrants d={d} />
    </Box>
  );
}

function TrendCard({ same }: { same: AptPastDeal[] }) {
  if (same.length < 2) {
    return (
      <Box title="같은 단지 계약 추이" sub="같은 단지·같은 업종 지난 계약">
        <p className="text-sm text-ink-500">{same.length ? "같은 단지 계약이 1건뿐이라 추이 대신 직전 계약과 비슷한 낙찰을 씁니다." : "같은 단지 계약이 없어 같은 지역·업종 비슷한 낙찰을 씁니다."}</p>
      </Box>
    );
  }
  return (
    <Box title="같은 단지 계약 추이" sub={`최근 ${same.length}건, 최근순`}>
      <ColumnChart
        ariaLabel="같은 단지 계약 금액 추이" height={160}
        fmt={wonAxis}
        cols={[...same].reverse().map((d, i, xs) => ({
          key: d.no, label: d.date.slice(2, 7).replace("-", "."), value: d.amount, hot: i === xs.length - 1,
          tip: [`${d.date} ${label(d)}`, d.winner || "업체명 확인 중", `금액 ${wonFull(d.amount)}`, ...(i > 0 ? [`이전 대비 ${signed(d.amount / xs[i - 1].amount)}`] : []), ...(period(d) ? [period(d)] : [])],
        }))}
      />
      <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100 text-sm">
        {same.map((d, i) => {
          const older = same[i + 1];
          return (
            <li key={d.no} className="min-w-0 px-3 py-2">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="min-w-0 font-semibold">{d.winner || "업체명 확인 중"}</span>
                <span className="shrink-0 font-bold tabular-nums">{won(d.amount)}</span>
              </div>
              <p className="text-xs text-ink-500">{[d.date, label(d), d.bidders ? `${d.bidders}곳 응찰` : "", older ? `이전 대비 ${signed(d.amount / older.amount)}` : ""].filter(Boolean).join(" · ")}</p>
              {period(d) && <p className="text-xs text-ink-300">{period(d)}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-300">계약 기간이 다르면(1년·2년) 금액이 크게 달라 보일 수 있습니다.</p>
    </Box>
  );
}

function SimilarCard({ similar, region, category }: { similar: AptPastDeal[]; region: string; category: string }) {
  const counted = similar.filter((d) => d.bidders);
  return (
    <Box title={`${region || "같은 지역"} ${category} 비슷한 규모 최근 낙찰`} sub={counted.length ? `응찰 업체 평균 ${(counted.reduce((a, d) => a + (d.bidders ?? 0), 0) / counted.length).toFixed(1)}곳 (${counted.length}건)` : "같은 단지 제외, 최근순"}>
      {!similar.length ? (
        <p className="text-sm text-ink-500">같은 지역·업종에서 금액이 비슷한 최근 낙찰을 찾지 못했습니다.</p>
      ) : (
        <>
        {/* 휴대폰: 표를 가로로 밀지 않고 한 건씩 카드로 */}
        <ul className="divide-y divide-ink-100 sm:hidden">
          {similar.map((d) => (
            <li key={d.no} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{d.apt}</span>
                <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums">{won(d.amount)}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500 [overflow-wrap:anywhere]">{d.title}</p>
              <p className="mt-0.5 text-xs text-ink-500 [overflow-wrap:anywhere]">
                <span className="tabular-nums">{d.date}</span> · 낙찰 {d.winner || "-"}{d.bidders ? ` · 응찰 ${d.bidders}곳` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="hidden min-w-0 overflow-x-auto sm:block">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                <th className="py-2 pr-3 font-semibold">낙찰일</th>
                <th className="py-2 pr-3 font-semibold">단지 · 공고명</th>
                <th className="py-2 pr-3 font-semibold">낙찰 업체</th>
                <th className="py-2 pr-3 text-right font-semibold">응찰</th>
                <th className="py-2 text-right font-semibold">낙찰금액</th>
              </tr>
            </thead>
            <tbody>
              {similar.map((d) => (
                <tr key={d.no} className="border-b border-ink-100/70 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-500">{d.date}</td>
                  <td className="py-2 pr-3"><span className="font-semibold">{d.apt}</span><span className="block text-xs text-ink-500">{d.title}</span></td>
                  <td className="py-2 pr-3">{d.winner || "-"}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{d.bidders ? `${d.bidders}곳` : "-"}</td>
                  <td className="whitespace-nowrap py-2 text-right font-bold tabular-nums">{won(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </Box>
  );
}

/** 관계도: 이 단지 ― 응찰·낙찰 업체 ― 같은 업체가 낙찰받은 비슷한 단지 */
function AptNetwork({ apt, h }: { apt: string; h: AptHistory }) {
  const g = useMemo(() => {
    const nodes = new Map<string, NetNode>();
    const edges = new Map<string, NetEdge>();
    const edge = (a: string, b: string) => { const k = `${a}|${b}`; const e = edges.get(k); if (e) e.w++; else edges.set(k, { a, b, w: 1 }); };
    nodes.set("me", { id: "me", label: apt, group: "me", weight: h.same.length, tip: [apt, `같은 업종 지난 계약 ${h.same.length}건`] });
    const cnt = new Map<string, { bids: number; wins: number }>();
    for (const d of h.same) {
      const names = new Set([...(d.entrants ?? []), ...(d.winner ? [d.winner] : [])]);
      for (const n of names) { const c = cnt.get(n) ?? { bids: 0, wins: 0 }; c.bids++; if (n === d.winner) c.wins++; cnt.set(n, c); }
    }
    for (const [n, c] of [...cnt.entries()].sort((a, b) => b[1].bids - a[1].bids).slice(0, 16)) {
      nodes.set(`c:${n}`, { id: `c:${n}`, label: n, group: c.wins ? "win" : "bid", weight: c.bids, tip: [n, `이 단지 ${c.wins ? `낙찰 ${c.wins}회 · ` : ""}응찰 ${c.bids}회`] });
      for (let i = 0; i < c.bids; i++) edge("me", `c:${n}`);
    }
    for (const d of h.similar.slice(0, 10)) {
      if (!d.winner || !d.apt) continue;
      const a = `a:${d.apt}`;
      if (!nodes.has(a)) nodes.set(a, { id: a, label: d.apt, group: "apt", weight: 1, tip: [d.apt, `${d.date} ${d.winner} 낙찰 ${won(d.amount)}`] });
      const c = `c:${d.winner}`;
      if (!nodes.has(c)) nodes.set(c, { id: c, label: d.winner, group: "sim", weight: 1, tip: [d.winner, "비슷한 단지 낙찰"] });
      edge(a, c);
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }, [apt, h]);
  if (g.nodes.length < 3) return null;
  return (
    <div className="min-w-0 rounded-2xl border border-ink-100 p-4">
      <p className="font-bold">단지·업체 관계도</p>
      <p className="mt-0.5 text-xs text-ink-500">원 크기 = 이 단지 응찰 횟수, 선 = 응찰 또는 낙찰</p>
      <NetworkGraph
        nodes={g.nodes} edges={g.edges} centerId="me" height={380} ariaLabel="단지와 업체 관계도"
        groups={[{ key: "win", label: "이 단지 낙찰 업체", color: CHART.cat[0] }, { key: "bid", label: "이 단지 응찰 업체", color: CHART.cat[1] }, { key: "apt", label: "비슷한 단지", color: CHART.cat[2] }, { key: "sim", label: "비슷한 단지 낙찰 업체", color: CHART.cat[3] }]}
      />
      <p className="mt-2 text-xs text-ink-500">업체 이름만 씁니다.<br />원을 누르면 이어진 곳만 진하게 보입니다.</p>
    </div>
  );
}
