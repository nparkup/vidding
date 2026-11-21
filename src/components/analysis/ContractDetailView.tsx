"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { contractHref, contractUrl, type Contract } from "@/lib/contracts";
import { won, wonFull } from "@/lib/format";
import { bidHref } from "@/lib/links";
import { assessRate, type RecentAwardRow, type RecentAwardsFile } from "@/lib/recentAwards";
import { loadBids } from "@/lib/useBids";
import { loadSiteJson } from "@/lib/useSiteJson";

interface Cell { k: string; v: ReactNode; sub?: string; wide?: boolean }

const ymd = (d?: string) => (d ? d.slice(0, 10).replace(/-/g, ".") : "");
const pct = (n: number, d = 3) => `${n.toFixed(d).replace(/\.?0+$/, "")}%`;
const bizNoFmt = (n?: string) => (n && n.length === 10 ? `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}` : n ?? "");
const corpHref = (key: string) => `/contracts?${new URLSearchParams({ corp: key })}`;
const g2bBidUrl = (no: string, ord = "000") => `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${encodeURIComponent(no)}&bidPbancOrd=${ord}`;

/** 계약 기간(일). 시작·끝을 모두 알 때만 */
function spanDays(from?: string, to?: string): number | undefined {
  if (!from || !to) return undefined;
  const d = Math.round((Date.parse(to) - Date.parse(from)) / 86400e3) + 1;
  return d > 0 && d < 365 * 30 ? d : undefined;
}

/** 오늘(한국 날짜)부터 끝나는 날까지 남은 날 */
function daysLeft(end?: string): number | undefined {
  if (!end) return undefined;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return Math.round((Date.parse(end) - Date.parse(today)) / 86400e3);
}

function amountCell(k: string, n: number, sub?: string): Cell {
  return {
    k,
    v: (
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span>{won(n)}</span>
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-500">{wonFull(n)}</span>
      </span>
    ),
    sub,
    wide: true,
  };
}

/** 계약 상세: 계약현황 목록의 한 건을 사이트 안에서 바로 보여 준다 (계약정보 API 항목 + 연결된 공고·낙찰 결과) */
export function ContractDetailView({ contract: c, list }: { contract: Contract; list: Contract[] }) {
  const x = c.x ?? {};
  const corps = x.corps?.length ? x.corps : c.corps;
  const start = x.start;
  const end = c.end ?? x.allEnd;
  const days = spanDays(start, end);
  const left = daysLeft(end);
  const changed = x.chgOrd && x.chgOrd !== "00" ? Number(x.chgOrd) : 0;

  // 연결된 공고: 지금 진행 중인 공고면 공고 분석으로, 최근 한 달 낙찰이면 낙찰 결과를 함께 보여 준다
  const [bidId, setBidId] = useState<string | null>(null);
  const [award, setAward] = useState<RecentAwardRow | null | undefined>(c.bidNo ? undefined : null);
  useEffect(() => {
    if (!c.bidNo) return;
    let alive = true;
    loadBids().then((bs) => { const b = bs.find((b) => b.bidNtceNo === c.bidNo); if (alive && b) setBidId(b.id); }).catch(() => {});
    loadSiteJson<RecentAwardsFile>("recent-awards.json")
      .then((f) => { if (alive) setAward(f.rows.filter((r) => r[0] === c.bidNo).sort((a, b) => b[1].localeCompare(a[1]))[0] ?? null); })
      .catch(() => alive && setAward(null));
    return () => { alive = false; };
  }, [c.bidNo]);

  // 같은 수요기관·같은 업체의 다른 최근 계약
  const sameDemand = useMemo(() => list.filter((o) => o.no !== c.no && o.demand === c.demand).sort((a, b) => b.date.localeCompare(a.date)), [list, c]);
  const mainCorp = c.corps[0];
  const sameCorp = useMemo(() => {
    if (!mainCorp) return [];
    return list.filter((o) => o.no !== c.no && o.corps.some((k) => (mainCorp.bizNo ? k.bizNo === mainCorp.bizNo : k.name === mainCorp.name))).sort((a, b) => b.date.localeCompare(a.date));
  }, [list, c, mainCorp]);

  const cells: (Cell | undefined | false | "")[] = [
    amountCell(c.total ? "이번 차수 계약금액" : "계약금액", c.amount, c.kind && c.kind !== "신규" ? `${c.kind} 계약` : undefined),
    !!c.total && amountCell("총 계약금액", c.total, "장기계속·계속비 전체 금액"),
    { k: "계약일", v: ymd(c.date), sub: x.cntrctDate && x.cntrctDate !== c.date ? `${x.cntrctDate < c.date ? "최초 계약일" : "계약 시작일"} ${ymd(x.cntrctDate)}` : undefined },
    start && { k: c.biz === "공사" ? "착공일" : "착수일", v: ymd(start) },
    end && { k: c.biz === "공사" ? "준공 예정일" : "계약 끝", v: ymd(end), sub: left !== undefined ? (left >= 0 ? `${left.toLocaleString()}일 남음` : "기간 지남") : undefined },
    x.thisEnd && x.thisEnd !== end && { k: "이번 차수 완료일", v: ymd(x.thisEnd) },
    // 기간 원문이 끝나는 날짜 하나뿐이면 '시작 ~ 끝'으로 보여 준다
    c.period && (() => {
      const v = /^\s*20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*$/.test(c.period) && start && end ? `${ymd(start)} ~ ${ymd(end)}` : c.period;
      return { k: "계약 기간", v, sub: days ? `${days.toLocaleString()}일` : undefined, wide: v.length > 14 };
    })(),
    { k: "계약방법", v: c.method },
    { k: "업무", v: c.div && c.div !== c.biz ? `${c.biz} · ${c.div}` : c.biz },
    { k: "분야", v: c.category },
    { k: "계약업체", v: corps.length > 1 ? `공동수급 ${corps.length}개사` : "단독", sub: x.joint ? "공동계약" : undefined },
    x.guarantee !== undefined && { k: "계약보증금률", v: pct(x.guarantee, 2) },
    x.delay !== undefined && { k: "지체상금률", v: pct(x.delay, 3), sub: "하루 지체당 계약금액 대비" },
    x.pay && { k: "대금 지급", v: x.pay },
    changed > 0 && { k: "계약 변경", v: `${changed}차 변경`, sub: "변경 계약 등록분" },
  ];
  const shown = cells.filter((v): v is Cell => !!v);

  const points = [
    changed > 0 && `${changed}차 변경 계약입니다. 금액·기간이 최초 계약과 다를 수 있습니다.`,
    c.kind === "장기계속" && "장기계속계약이라 해마다 차수 계약을 새로 맺습니다. 계약금액은 이번 차수 금액입니다.",
    c.kind === "계속비" && "계속비 계약입니다. 여러 해에 걸친 전체 사업비가 한 번에 확정된 계약입니다.",
    left !== undefined && left >= 0 && left <= 120 && `계약이 ${left}일 뒤 끝납니다. 같은 사업이 다시 공고될 수 있으니 발주계획과 공고를 지켜보세요.`,
    corps.length > 1 && `공동수급 ${corps.length}개사가 나눠 맡았습니다. 지분은 아래 계약업체 표에서 볼 수 있습니다.`,
    sameCorp.length > 0 && `${mainCorp?.name}은(는) 최근 2주 동안 이 계약 말고도 ${sameCorp.length}건을 계약했습니다.`,
  ].filter((p): p is string => !!p);

  const assess = award ? assessRate(award) : undefined;

  return (
    <div className="container-x py-10 sm:py-14">
      <Link href="/contracts" className="text-sm text-ink-500 hover:text-ink">계약현황으로</Link>

      <header className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip border-ink bg-ink text-white">계약 {c.date}</span>
            <span className="chip">{c.biz}{c.div && c.div !== c.biz ? ` · ${c.div}` : ""}</span>
            <span className="chip">{c.category}</span>
            <span className="chip">{c.method}</span>
            {c.kind && c.kind !== "신규" && <span className="chip">{c.kind}</span>}
            {corps.length > 1 && <span className="chip">공동수급 {corps.length}개사</span>}
            {changed > 0 && <span className="chip border-amber/40 bg-amber-100/60 text-ink">{changed}차 변경</span>}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{c.title}</h1>
          <p className="mt-2 text-ink-500 [overflow-wrap:anywhere]">{c.demand === c.agency ? c.demand : `${c.demand} · 계약 ${c.agency}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mainCorp && <Link href={corpHref(mainCorp.bizNo ?? mainCorp.name)} className="btn-ghost btn-sm">이 업체 계약 모아보기</Link>}
          <a href={contractUrl(c)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-ink-500">나라장터 원문</a>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-bold">핵심 요약</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
              {shown.map((v) => (
                <div key={v.k} className={`min-w-0 rounded-xl bg-paper p-3${v.wide ? " col-span-2" : ""}`}>
                  <dt className="text-xs text-ink-500">{v.k}</dt>
                  <dd className="mt-1 break-words font-bold">{v.v}</dd>
                  {v.sub && <dd className="mt-0.5 text-xs text-ink-500">{v.sub}</dd>}
                </div>
              ))}
            </dl>
            {points.length > 0 && (
              <ul className="mt-5 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">계약업체</h2>
              <span className="chip">{corps.length > 1 ? `공동수급 ${corps.length}개사` : "단독 계약"}</span>
            </div>
            <ul className="mt-4 space-y-3">
              {corps.map((k, i) => {
                const full = k as typeof k & { ceo?: string; mode?: string; nation?: string };
                return (
                  <li key={`${k.name}-${i}`} className="rounded-xl bg-paper p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={corpHref(k.bizNo ?? k.name)} className="min-w-0 font-bold underline decoration-ink-200 underline-offset-2 [overflow-wrap:anywhere] hover:text-mint-700">{k.name}</Link>
                      {k.share !== undefined && <span className="text-sm font-semibold tabular-nums">지분 {k.share}%</span>}
                    </div>
                    <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">
                      {[k.role ?? (i === 0 ? "주계약업체" : ""), full.mode, full.ceo ? `대표 ${full.ceo}` : "", k.bizNo ? `사업자번호 ${bizNoFmt(k.bizNo)}` : "", full.nation && full.nation !== "대한민국" ? full.nation : "",
                        corps.length > 1 && k.share ? `분담 금액 약 ${won(Math.round((c.amount * k.share) / 100))}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-300">업체 이름을 누르면 그 업체의 최근 2주 계약을 모아 봅니다.</p>
          </section>

          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">연결된 공고·낙찰 결과</h2>
              {c.bidNo && <span className="chip">공고번호 {c.bidNo}</span>}
            </div>
            {!c.bidNo ? (
              <p className="mt-3 text-sm text-ink-500">계약정보에 입찰공고번호가 없습니다. 조달요청·다른 시스템을 거친 계약일 수 있습니다.</p>
            ) : award === undefined ? (
              <p className="mt-3 text-sm text-ink-500">낙찰 결과를 찾는 중…</p>
            ) : (
              <>
                {award ? (
                  <>
                    <dl className="mt-4 divide-y divide-ink-100/70 text-sm">
                      <Fact k="공고명" v={award[3]} />
                      <Fact k="최종낙찰일" v={ymd(award[5])} />
                      <Fact k="참가업체" v={award[6] ? `${award[6].toLocaleString()}개사` : undefined} />
                      <Fact k="낙찰업체" v={award[7]} />
                      <Fact k="낙찰금액" v={award[9] ? `${wonFull(award[9])}${award[10] ? ` (낙찰률 ${pct(award[10])})` : ""}` : undefined} />
                      <Fact k="기초금액" v={award[11] ? wonFull(award[11]) : undefined} />
                      <Fact k="예정가격" v={award[12] ? `${wonFull(award[12])}${assess ? ` (사정율 ${pct(assess, 4)})` : ""}` : undefined} />
                      <Fact k="낙찰하한율" v={award[14] ? pct(award[14]) : undefined} />
                      <Fact k="계약방법" v={award[13] || undefined} />
                    </dl>
                    {award[15].length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold">개찰 순위</p>
                        <ol className="mt-2 space-y-1.5 text-sm">
                          {award[15].map(([rank, name, amt, rate]) => (
                            <li key={rank} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-paper px-3 py-2">
                              <span className="min-w-0 [overflow-wrap:anywhere]"><span className="mr-2 font-bold">{rank}위</span>{name}</span>
                              <span className="tabular-nums text-ink-500">{wonFull(amt)}{rate ? ` · ${pct(rate)}` : ""}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-500">최근 한 달 낙찰 결과에 이 공고가 없습니다. 낙찰이 한 달보다 오래됐거나 개찰 결과가 아직 공개되지 않았을 수 있습니다.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {bidId && <Link href={bidHref(bidId)} className="btn-mint btn-sm">공고 분석 보기</Link>}
                  <a href={g2bBidUrl(c.bidNo, award?.[1])} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-ink-500">나라장터 공고 원문</a>
                </div>
              </>
            )}
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold">계약 근거·분류</h2>
            <dl className="mt-4 divide-y divide-ink-100/70 text-sm">
              <Fact k="계약 체결 방법" v={c.method} />
              <Fact k="근거 법률" v={x.law} />
              <Fact k="계약 근거 내역" v={x.basis} />
              <Fact k="공공조달분류" v={x.cls ? `${x.cls}${x.clsNo ? ` (${x.clsNo})` : ""}` : undefined} />
              <Fact k="물가 변동 조정" v={x.priceAdj} />
              <Fact k="계약 구분" v={c.kind} />
              <Fact k="정보화사업" v={x.infoBiz ? "해당" : undefined} />
            </dl>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-bold">계약 기관</h2>
            <dl className="mt-4 divide-y divide-ink-100/70 text-sm">
              <Fact k="계약기관" v={c.agency} />
              <Fact k="기관 구분" v={x.jur} />
              <Fact k="담당 부서" v={x.dept} />
              <Fact k="수요기관" v={x.demands?.length ? x.demands.map(([n, kind]) => (kind ? `${n} (${kind})` : n)).join(", ") : c.demand} />
              <Fact k="채권자" v={x.creditor} />
            </dl>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold">계약 번호</h2>
            <dl className="mt-4 divide-y divide-ink-100/70 text-sm">
              <Fact k="통합계약번호" v={c.no} />
              <Fact k="확정계약번호" v={x.dcsnNo} />
              <Fact k="계약참조번호" v={x.refNo && x.refNo !== x.dcsnNo ? x.refNo : undefined} />
              <Fact k="조달요청번호" v={x.reqNo} />
              <Fact k="입찰공고번호" v={c.bidNo} />
              <Fact k="나라장터 등록" v={x.rgstDt ? `${ymd(x.rgstDt)} ${x.rgstDt.slice(11, 16)}` : undefined} />
            </dl>
          </section>

          <Related title={`같은 기관 최근 계약`} sub={c.demand} items={sameDemand} />
          {mainCorp && <Related title="같은 업체 최근 계약" sub={mainCorp.name} items={sameCorp} more={corpHref(mainCorp.bizNo ?? mainCorp.name)} />}
        </aside>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-ink-400">
        조달청 나라장터 계약정보를 매일 받아 보여 줍니다. 계약 담당자 이름·연락처는 싣지 않습니다. 최종 내용은 나라장터 계약 원문으로 확인하세요.
      </p>
    </div>
  );
}

function Fact({ k, v }: { k: string; v?: ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-28 shrink-0 text-ink-500">{k}</dt>
      <dd className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}

function Related({ title, sub, items, more }: { title: string; sub: string; items: Contract[]; more?: string }) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{sub} · 최근 2주 {items.length.toLocaleString()}건</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-400">이 계약 말고는 없습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100/70">
          {items.slice(0, 5).map((o) => (
            <li key={o.no} className="py-2.5">
              <Link href={contractHref(o.no)} className="block text-sm font-semibold leading-snug [overflow-wrap:anywhere] hover:text-mint-700">{o.title}</Link>
              <p className="mt-0.5 text-xs text-ink-500 [overflow-wrap:anywhere]">{[o.date, won(o.amount), o.corps[0]?.name].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      {more && items.length > 5 && <Link href={more} className="btn-ghost btn-sm mt-3 w-full">{items.length.toLocaleString()}건 모두 보기</Link>}
    </section>
  );
}
