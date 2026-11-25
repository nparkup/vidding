"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aptDetailUrl, aptFileUrl, type AptBid, type AptBidsFile, type AptHistory } from "@/lib/apt";
import { contractMonths, forecastAptPrice, type AptPriceCheck, type AptPriceForecast } from "@/lib/aptPrice";
import { shortDate, won, wonFull } from "@/lib/format";
import { loadSiteJson } from "@/lib/useSiteJson";
import { CloseDdayBadge } from "../Badges";
import { CloseDay } from "../CloseDay";
import { AptAwardSection, AptForecastCard } from "./AptAwardViews";
import { syncTrialServer, type TrialEntry } from "@/lib/trial";
import { useUsage } from "@/lib/usage";
import { readMember } from "@/lib/member";
import { TrialIntro, TrialLocked, TrialNote } from "./TrialGate";
import { PredictSummary, StepBar, type SummaryTile } from "./PredictSummary";

const TRIAL_API = process.env.NEXT_PUBLIC_STATIC_SITE === "1" ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";

/** 직전 계약과 비교해 예측하는 분야 (공사·물품·기타 용역은 단지마다 일이 달라 예측하지 않는다) */
const PRICEABLE = new Set<string>(["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "주택관리(위탁)"]);
const MAX_MATCHES = 100;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (r: number) => `${r >= 1 ? "+" : ""}${((r - 1) * 100).toFixed(1)}%`;
const digits = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;
const round = (x: number) => Math.round(x / 1000) * 1000;
const priorLabel = (b: AptBid) => (b.prior ? `직전 ${b.prior.via === "수의계약" ? "수의계약" : "낙찰"} ${won(b.prior.amount)}` : "직전 계약 자료 없음");

const SCALES = [
  { v: "1", t: "직전과 같음" },
  { v: "2", t: "두 배 (예: 1년 → 2년 계약)" },
  { v: "0.5", t: "절반 (예: 2년 → 1년 계약)" },
  { v: "1.5", t: "1.5배 (예: 2년 → 3년 계약)" },
];

/**
 * 아파트 예측: 나라장터 예측(ScorePredictor)과 같은 구성으로
 * 1. 공고 선택 → 2. 직전 계약과 이번 계약 규모 → 오른쪽 예상 낙찰금액 → 아래 공고 내용을 보여 준다.
 * 예측은 같은 단지·같은 업종 직전 계약(낙찰·수의계약)과 과거 낙찰 변화율로 낸다 (src/lib/aptPrice.ts).
 */
export function AptPredictor() {
  const sp = useSearchParams();
  const [data, setData] = useState<AptBidsFile | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(sp.get("apt"));
  // 직전 계약을 직접 넣는 칸 (자료가 없거나 다른 계약과 비교하고 싶을 때)
  const [manualAmount, setManualAmount] = useState("");
  const [scale, setScale] = useState("1");
  const [months, setMonths] = useState("");

  useEffect(() => {
    loadSiteJson<AptBidsFile>("apt-bids-data.json").then(setData).catch(() => setError(true));
    // 낙찰 결과로 본 예측은 따로 받는다 (없어도 금액 예측은 된다)
    loadSiteJson<Record<string, AptHistory>>("apt-history-data.json").then(setHistory).catch(() => setHistory({}));
  }, []);
  useEffect(() => {
    const no = sp.get("apt");
    if (no) setPicked(no);
  }, [sp]);
  useEffect(() => { setManualAmount(""); setScale("1"); setMonths(""); }, [picked]);

  const open = useMemo(() => (data?.items ?? []).filter((b) => PRICEABLE.has(b.category) && new Date(b.closeAt).getTime() > Date.now()), [data]);
  const [history, setHistory] = useState<Record<string, AptHistory> | null>(null);
  const pickedBid = useMemo(() => {
    const b = (data?.items ?? []).find((x) => x.no === picked);
    return b && history?.[b.no] ? { ...b, history: history[b.no] } : b;
  }, [data, picked, history]);
  // 무료 체험: 공고를 고르면 1건 차감 (나라장터 예측과 합쳐 3건, 이미 분석한 공고는 그대로)
  const trialKey = pickedBid ? `apt:${pickedBid.no}` : null;
  const trial = useUsage(trialKey, pickedBid ? `${pickedBid.apt} ${pickedBid.title}` : undefined);
  const trialLocked = !!pickedBid && trial?.status === "locked";
  const bid = trialLocked || (trialKey && !trial) ? undefined : pickedBid;
  // 가입한 사업자번호가 있으면 그 번호로 쓴 체험 건수도 중계 서버에서 맞춘다
  useEffect(() => {
    const m = readMember();
    if (TRIAL_API && m && trialKey && trial?.status === "ok" && !trial.server && !trial.off) syncTrialServer(TRIAL_API, m.bizno, trialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialKey]);
  const pickTrial = (e: TrialEntry) => {
    if (e.k.startsWith("apt:")) choose(e.k.slice(4));
    else window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/premium?bid=${encodeURIComponent(e.k.slice(5))}#predict`;
  };

  const { matches, matchTotal } = useMemo(() => {
    const words = query.trim().split(/\s+/).filter(Boolean).map(norm);
    if (!words.length) return { matches: [] as AptBid[], matchTotal: 0 };
    const all = open
      .filter((b) => words.every((w) => norm(`${b.title} ${b.apt} ${b.category} ${b.region} ${b.no}`).includes(w)))
      .sort((a, b) => Number(!!b.prior) - Number(!!a.prior) || a.closeAt.localeCompare(b.closeAt));
    return { matches: all.slice(0, MAX_MATCHES), matchTotal: all.length };
  }, [open, query]);

  // 처음 들어오면 직전 계약이 있는 마감 임박 공고 몇 건을 바로 고를 수 있게 둔다
  const quick = useMemo(() => open.filter((b) => b.prior).sort((a, b) => a.closeAt.localeCompare(b.closeAt)).slice(0, 6), [open]);

  const choose = (no: string) => {
    setPicked(no);
    setQuery("");
    // 좁은 화면은 맨 위 한눈에 보기가 보이게 올린다 (검색 목록이 길어 아래로 내려가 있다)
    if (typeof window !== "undefined" && window.innerWidth < 1024) setTimeout(() => document.getElementById("predict")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const model = data?.pricing;
  const manual = digits(manualAmount) > 0;
  const prior = manual ? { amount: digits(manualAmount) } : bid?.prior;
  const priorMonths = !manual && bid?.prior ? contractMonths(bid.prior.start, bid.prior.end) : undefined;
  const want = Math.min(60, digits(months));
  // 직전 계약기간을 알면 이번 개월 수로, 모르면 규모 배율로 맞춘다
  const k = priorMonths && want ? want / priorMonths : Number(scale) || 1;
  const f = bid && model && prior && PRICEABLE.has(bid.category) ? forecastAptPrice(model, bid.category, bid.award, prior, k) : undefined;

  const basis = f ? (
    <>
      <BasisPanel f={f} />
      {f.check && f.check.n > 0 && model && <CheckPanel c={f.check} cutoff={model.check.cutoff} cat={f.checkBasis} />}
    </>
  ) : null;

  const searchBox = (
    <div className={`relative ${bid ? "mt-3" : "mt-4"}`}>
      <input className="input" placeholder={bid ? "다른 공고 찾기: 단지명·공고명·업종·지역" : "단지명·공고명·업종·지역으로 검색"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="공동주택 입찰공고 검색" />
      {query.trim() && (
        <div className="card absolute inset-x-0 top-full z-20 mt-1 overflow-hidden">
          <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500">
            {matchTotal > matches.length
              ? `검색 결과 ${matchTotal.toLocaleString("ko-KR")}건 중 ${matches.length}건 표시 · 검색어를 더 입력하면 좁혀집니다`
              : matchTotal ? `검색 결과 ${matchTotal.toLocaleString("ko-KR")}건 · 직전 계약이 있는 공고가 먼저 나옵니다` : "조건에 맞는 공고가 없습니다"}
          </p>
          {matches.length > 0 && (
            <ul className="max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain p-1">
              {matches.map((m) => (
                <li key={m.no}>
                  <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => choose(m.no)}>
                    <span className="font-semibold"><CloseDdayBadge iso={m.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={m.closeAt} />{m.title}</span>
                    <span className="text-xs text-ink-500">{m.apt} · {m.category}{m.region ? ` · ${m.region}` : ""} · {priorLabel(m)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  if (error) return <p className="card p-6 text-sm text-coral">공동주택 입찰공고 자료를 불러오지 못했습니다.<br />잠시 후 다시 시도해 주세요.</p>;
  if (!data) return <p className="card p-6 text-sm text-ink-300">공고 목록을 불러오는 중…</p>;
  if (!model) return <p className="card p-6 text-sm text-ink-500">아파트 예측 자료가 아직 준비되지 않았습니다.<br />다음 갱신 뒤에 다시 확인해 주세요.</p>;

  // 무료 체험 3건을 다 쓴 뒤 새 공고를 고른 경우
  if (trialLocked && pickedBid && trial) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">{pickedBid.classLabel || pickedBid.category} · 공고번호 {pickedBid.no}</p>
            <p className="mt-1 font-bold leading-snug [overflow-wrap:anywhere]"><CloseDdayBadge iso={pickedBid.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={pickedBid.closeAt} />{pickedBid.title}</p>
            <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{pickedBid.apt}{pickedBid.region ? ` · ${pickedBid.region}` : ""}</p>
          </div>
          {searchBox}
        </section>
        <TrialLocked used={trial.used} onPick={pickTrial} state={trial} />
      </div>
    );
  }

  // 공고를 고르기 전: 검색만 보이고, 결과 자리에는 안내만 둔다
  if (!bid) {
    return (
      <div className="space-y-6">
      <StepBar steps={[
        { label: "공고 선택", state: "now" },
        { label: "직전 계약·규모 확인", state: "todo" },
        { label: "예상 낙찰금액 확인", state: "todo" },
      ]} />
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <p className="mt-2 text-sm text-ink-500">분석할 공동주택 입찰공고를 검색해 고르세요.<br />청소·경비·소독·승강기유지·전기안전관리·정화조·저수조·위탁관리 진행 중 공고 {open.length.toLocaleString("ko-KR")}건에서 찾습니다.</p>
          {picked && <p className="mt-2 text-sm text-coral">고른 공고({picked})는 마감됐거나 목록에서 빠졌습니다.<br />다른 공고를 골라 주세요.</p>}
          {searchBox}
          <TrialIntro />
          {quick.length > 0 && (
            <div className="mt-5 border-t border-ink-100 pt-4">
              <p className="text-xs font-semibold text-ink-500">직전 계약이 있는 마감 임박 공고</p>
              <ul className="mt-2 space-y-1">
                {quick.map((m) => (
                  <li key={m.no}>
                    <button type="button" className="w-full rounded-xl bg-paper px-3 py-2 text-left text-sm hover:bg-ink-100/60" onClick={() => choose(m.no)}>
                      <span className="font-semibold"><CloseDdayBadge iso={m.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={m.closeAt} />{m.title}</span>
                      <span className="text-xs text-ink-500">{m.apt} · {m.category} · {priorLabel(m)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <aside className="card min-w-0 p-6">
          <p className="font-bold">공고를 고르면 나오는 것</p>
          <ol className="mt-4 space-y-3 text-sm">
            {[
              ["직전 계약", "같은 단지·같은 업종의 직전 낙찰·수의계약 금액과 업체"],
              ["예상 낙찰금액", "직전 계약과 과거 낙찰 변화율로 낸 가운데값과 구간"],
              ["경쟁 강도", "같은 단지·비슷한 낙찰의 응찰 업체 수와 참가 예상 업체"],
              ["예측 정확도", "같은 계산을 올해 실제 낙찰에 맞춰 본 결과"],
            ].map(([t, d], n) => (
              <li key={t} className="flex gap-3">
                <span className="w-5 shrink-0 font-bold tabular-nums text-mint-600">{n + 1}</span>
                <span className="min-w-0"><span className="block font-semibold">{t}</span><span className="block text-ink-500">{d}</span></span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      </div>
    );
  }

  // 맨 위 한눈에 보기: 예상 낙찰금액 → 구간 → 직전 계약 → 경쟁 강도
  const comp = bid.history?.competition;
  const tiles: SummaryTile[] = [
    f
      ? { label: "예상 낙찰금액", value: wonFull(round(f.mid)), tone: "mint", sub: `직전 계약${f.scale !== 1 ? " 환산" : ""} 대비 ${signed(f.stat.median)}` }
      : { label: "예상 낙찰금액", value: "예측하지 않음", tone: "muted", sub: PRICEABLE.has(bid.category) ? "직전 계약금액을 2번에 넣으면 계산합니다." : `${bid.category} 공고는 예측 대상이 아닙니다.` },
    f
      ? { label: "예상 구간 (과거 낙찰 10~90%)", value: <span className="text-base">{wonFull(round(f.low))} ~ {wonFull(round(f.high))}</span>, tone: "ink", sub: `${signed(f.stat.low)} ~ ${signed(f.stat.high)}` }
      : { label: "예상 구간", value: "-", tone: "muted" },
    prior
      ? { label: manual ? "직접 넣은 직전 계약" : `직전 ${bid.prior?.via === "수의계약" ? "수의계약" : "낙찰"}`, value: wonFull(prior.amount), tone: "ink", sub: manual ? "2번에 넣은 금액" : [bid.prior?.closedAt, bid.prior?.company ?? (bid.prior?.via === "낙찰" ? bid.history?.same?.find((d) => d.amount === bid.prior?.amount)?.winner : undefined), priorMonths ? `${priorMonths}개월 계약` : ""].filter(Boolean).join(" · ") || undefined }
      : { label: "직전 계약", value: "자료 없음", tone: "muted", sub: "같은 단지·같은 업종 계약을 찾지 못했습니다." },
    comp
      ? { label: "경쟁 강도", value: comp.level, tone: "ink", sub: `응찰 업체 수 가운데값 ${comp.median}곳 (${comp.n}건 기준)` }
      : { label: "경쟁 강도", value: history ? "자료 부족" : "불러오는 중", tone: "muted" },
  ];

  return (
    <div className="space-y-6">
      <StepBar steps={[
        { label: "공고 선택", state: "done" },
        { label: "직전 계약·규모 확인", state: f ? "done" : "now", href: "#prior" },
        { label: "예상 낙찰금액 확인", state: f ? "now" : "todo", href: "#price" },
      ]} />
      <PredictSummary
        title="한눈에 보기"
        tiles={tiles}
        links={[
          { href: "#price", label: "예상 금액" },
          { href: "#forecast", label: "낙찰 결과로 본 예측" },
          { href: "#notice", label: "입찰 조건" },
          { href: "#history", label: "지난 계약" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* 1. 공고 */}
          <section className="card p-6">
            <Step n={1} title="공고 선택" />
            <div className="mt-4 rounded-2xl bg-paper p-4">
              <p className="text-xs text-ink-500">{bid.classLabel || bid.category}{bid.kind ? ` · ${bid.kind}` : ""}{bid.award ? ` · ${bid.award}` : ""} · 공고번호 {bid.no}</p>
              <p className="mt-1 font-bold leading-snug [overflow-wrap:anywhere]"><CloseDdayBadge iso={bid.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={bid.closeAt} />{bid.title}</p>
              <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{bid.apt}{bid.region ? ` · ${bid.region}` : ""} · 마감 {shortDate(bid.closeAt)}</p>
            </div>
            <TrialNote state={trial} />
            {searchBox}
            <div className="mt-4 border-t border-ink-100 pt-4">
              {!PRICEABLE.has(bid.category) && <p className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-500">{bid.category} 공고는 단지마다 일의 범위가 달라 금액을 예측하지 않습니다.</p>}
              {PRICEABLE.has(bid.category) && (
                <p className={`rounded-xl px-3 py-2 text-sm ${bid.prior ? "bg-mint-50 text-mint-700" : "bg-paper text-ink-500"}`}>
                  {bid.prior
                    ? `같은 단지의 직전 ${bid.category} ${bid.prior.via === "수의계약" ? "수의계약" : "낙찰"}을 찾았습니다. 그 금액과 과거 낙찰 변화율로 계산합니다.`
                    : `같은 단지의 직전 ${bid.category} 계약을 찾지 못했습니다. 직전 계약금액을 알고 있으면 아래 2번에 입력해 주세요.`}
                </p>
              )}
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                <a href={aptDetailUrl(bid.no)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm hover:bg-ink-100/60">
                  <span className="min-w-0 truncate">K-apt 공고 원문</span>
                  <span className="shrink-0 text-xs text-ink-300">원문</span>
                </a>
                {(bid.files ?? []).map((seq, n) => (
                  <a key={seq} href={aptFileUrl(seq)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm hover:bg-ink-100/60">
                    <span className="min-w-0 truncate">첨부파일 {n + 1}</span>
                    <span className="shrink-0 text-xs text-ink-300">첨부</span>
                  </a>
                ))}
              </div>
            </div>
          </section>

          {/* 2. 직전 계약과 이번 계약 규모 */}
          {PRICEABLE.has(bid.category) && (
            <section id="prior" className="card scroll-mt-24 p-6">
              <Step n={2} title="직전 계약과 이번 계약 규모" />
              {bid.prior && !manual && (
                <div className="mt-4 rounded-2xl bg-paper p-4 text-sm">
                  <p className="text-xs text-ink-500">같은 단지 직전 {bid.category} {bid.prior.via === "수의계약" ? "수의계약" : "낙찰"}{bid.prior.closedAt ? ` · ${bid.prior.closedAt}` : ""}</p>
                  <p className="mt-1 font-semibold leading-snug [overflow-wrap:anywhere]">{bid.prior.title}</p>
                  <p className="mt-1 tabular-nums"><b>{wonFull(bid.prior.amount)}</b>{bid.prior.company ? ` · ${bid.prior.company}` : ""}</p>
                  {bid.prior.start && bid.prior.end && <p className="tabular-nums text-ink-500">계약 {bid.prior.start} ~ {bid.prior.end}{priorMonths ? ` (${priorMonths}개월)` : ""}</p>}
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                <label className="min-w-0">
                  <span className="label">{bid.prior ? "다른 직전 계약금액으로 계산 (선택)" : "직전 계약금액 (원)"}</span>
                  <input inputMode="numeric" value={manualAmount ? digits(manualAmount).toLocaleString() : ""} onChange={(e) => setManualAmount(e.target.value)} placeholder="예: 36,000,000" className="input" />
                </label>
                {priorMonths ? (
                  <label className="min-w-0">
                    <span className="label">이번 계약기간 (개월)</span>
                    <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/[^\d]/g, ""))} placeholder={`${priorMonths} (직전과 같음)`} className="input" />
                  </label>
                ) : (
                  <label className="min-w-0">
                    <span className="label">이번 계약 규모 (직전 대비)</span>
                    <select value={scale} onChange={(e) => setScale(e.target.value)} className="input">
                      {SCALES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-500">공고서의 계약기간·과업 범위가 직전과 다르면 계약기간이나 규모를 바꿔 보세요.<br />계약기간이 1년에서 2년으로 늘면 금액도 거의 두 배가 됩니다.</p>
            </section>
          )}

          {/* 넓은 화면: 계산 기준·정확도는 입력 아래에 둔다 (오른쪽 결과만 길어져 왼쪽이 비지 않게) */}
          {basis && <div className="hidden space-y-6 lg:block">{basis}</div>}
        </div>

        {/* 결과: 예상 낙찰금액 → 낙찰 결과로 본 예측 */}
        <aside id="price" className="min-w-0 scroll-mt-24 space-y-4 lg:self-start">
          {f ? <PriceCard f={f} /> : (
            <section className="card p-6">
              <p className="font-bold">예상 낙찰금액</p>
              <p className="mt-2 text-sm text-ink-500">
                {PRICEABLE.has(bid.category) ? "같은 단지 직전 계약 자료가 없어 예측하지 않습니다. 직전 계약금액을 알고 있으면 왼쪽 2번에 입력해 주세요." : `${bid.category} 공고는 예측 대상이 아닙니다. 청소·경비·소독 같은 반복 용역 공고를 골라 주세요.`}
              </p>
            </section>
          )}
          <div id="forecast" className="scroll-mt-24"><AptForecastCard bid={bid} f={f} /></div>
          {/* 좁은 화면: 예상 금액 다음에 계산 기준·정확도 */}
          {basis && <div className="space-y-4 lg:hidden">{basis}</div>}
          <p className="text-xs leading-relaxed text-ink-300">K-apt 입찰결과에는 예정가격·기초금액이 없어 나라장터처럼 투찰률로 계산하지 않고, 같은 단지·같은 업종 직전 계약(낙찰·수의계약) 대비 다음 낙찰의 변화율로 계산합니다.<br />예측값은 과거 자료로 낸 추정치입니다.</p>
        </aside>
      </div>

      {/* 공고 내용 (전체 폭) */}
      <div id="notice" className="scroll-mt-24"><NoticePanel bid={bid} /></div>

      {/* 공고 내용 아래: 같은 단지 지난 계약·비슷한 낙찰 (나라장터 예측의 낙찰 결과 분석 자리) */}
      <div id="history" className="scroll-mt-24"><AptAwardSection bid={bid} /></div>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white tabular-nums">{n}</span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

/** 예상 낙찰금액: 나라장터 예측의 예상 평가점수 카드와 같은 모양 */
function PriceCard({ f }: { f: AptPriceForecast }) {
  const st = f.stat;
  // 구간 막대: 낮은 값~높은 값 사이에서 가운데값 위치
  const span = Math.max(1, f.high - f.low);
  const at = Math.min(100, Math.max(0, ((f.mid - f.low) / span) * 100));
  return (
    <section className="overflow-hidden rounded-3xl bg-ink-900 text-white shadow-lift">
      <div className="p-6">
        <p className="text-sm text-ink-300">예상 낙찰금액{f.scale !== 1 ? ` (직전 대비 ${Math.round(f.scale * 100) / 100}배 규모)` : " (계약 기간·범위가 직전과 같을 때)"}</p>
        <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight [overflow-wrap:anywhere] sm:text-5xl">{wonFull(round(f.mid))}</p>
        <p className="mt-2 text-sm text-ink-300">직전 계약{f.scale !== 1 ? " 환산" : ""} 대비 <b className="text-white">{signed(st.median)}</b></p>
      </div>
      <div className="border-t border-white/10 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
          <span className="font-semibold">예상 구간 (과거 낙찰 10~90%)</span>
          <span className="text-xs tabular-nums text-ink-300">{signed(st.low)} ~ {signed(st.high)}</span>
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-white/10">
          <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-mint/70" />
          <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-white" style={{ left: `${at}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-xs tabular-nums text-ink-300">
          <span>{wonFull(round(f.low))}</span>
          <span>{wonFull(round(f.high))}</span>
        </div>
      </div>
    </section>
  );
}

/** 계산 기준: 나라장터 예측의 평가 기준 패널 자리 */
function BasisPanel({ f }: { f: AptPriceForecast }) {
  const st = f.stat;
  const rows: [string, string][] = [
    ["비교 묶음", `${f.basis} 낙찰`],
    ["직전 계약 다음 낙찰", `${st.all.toLocaleString("ko-KR")}건`],
    ["규모가 직전과 비슷", `${st.n.toLocaleString("ko-KR")}건 (${pct(st.same)})`],
    ["변화율 가운데값", signed(st.median)],
    ["10~90% 구간", `${signed(st.low)} ~ ${signed(st.high)}`],
    ["약 두 배 / 약 절반", `${pct(st.double)} / ${pct(st.half)}`],
  ];
  return (
    <section className="card overflow-hidden">
      <div className="p-6 pb-4">
        <p className="text-sm text-ink-500">계산 기준</p>
        <p className="mt-1 text-lg font-bold">같은 단지 직전 계약 → 다음 낙찰 변화율</p>
      </div>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {rows.map(([k, v]) => (
          <li key={k} className="flex min-w-0 items-baseline justify-between gap-3 px-6 py-3 text-sm">
            <span className="min-w-0 font-semibold">{k}</span>
            <span className="shrink-0 text-right tabular-nums text-ink-500">{v}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-100 bg-ink-50 px-6 py-3 text-sm leading-relaxed text-ink-500">
        규모가 약 두 배나 절반으로 바뀐 짝은 계약기간이나 과업 범위가 바뀐 경우로 보고, 가운데값·구간은 규모가 비슷했던 짝으로만 계산합니다.
      </p>
    </section>
  );
}

function CheckPanel({ c, cutoff, cat }: { c: AptPriceCheck; cutoff: string; cat: string }) {
  const y = cutoff.slice(0, 4);
  const rows: [string, string, string][] = [
    ["예상 금액과 5% 안", pct(c.within5), pct(c.naive5)],
    ["예상 금액과 10% 안", pct(c.within10), pct(c.naive10)],
    ["예상 구간 안", pct(c.inRange), "-"],
  ];
  return (
    <section className="card p-6">
      <h3 className="font-bold">예측 정확도</h3>
      <p className="mt-1 text-sm text-ink-500">{y}년 이전 자료로 만든 같은 계산을 {y}년 {cat} 낙찰 중 규모가 직전과 비슷했던 {c.n.toLocaleString("ko-KR")}건에 맞춰 본 결과입니다.</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 text-sm">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-ink-50 px-4 py-2 text-xs font-semibold text-ink-500">
          <span>실제 낙찰금액</span><span className="w-16 text-right">이 예측</span><span className="w-20 text-right">직전 금액 그대로</span>
        </div>
        {rows.map(([k, a, b]) => (
          <div key={k} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-ink-100 px-4 py-2 tabular-nums">
            <span className="min-w-0">{k}</span><b className="w-16 text-right">{a}</b><span className="w-20 text-right text-ink-500">{b}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 공고 내용: 나라장터 예측의 평가표 자리. K-apt 공고에 적힌 입찰 조건을 그대로 보여 준다 */
function NoticePanel({ bid }: { bid: AptBid }) {
  const rows: [string, string | undefined][] = [
    ["입찰 분류", bid.classLabel],
    ["입찰 방법", [bid.kind, bid.way].filter(Boolean).join(" · ") || undefined],
    ["낙찰 방법", bid.award],
    ["입찰 시스템", bid.system],
    ["공고일", bid.postedAt],
    ["입찰 마감", shortDate(bid.closeAt)],
    ["공고 상태", [bid.state, bid.urgent ? "긴급" : ""].filter(Boolean).join(" · ") || undefined],
    ["현장설명", [bid.briefingAt && shortDate(bid.briefingAt), bid.briefingPlace].filter(Boolean).join(" · ") || undefined],
    ["구비서류", bid.docs],
    ["서류 마감", bid.docsBy && shortDate(bid.docsBy)],
    ["입찰보증금", bid.guarantee === undefined ? undefined : bid.guarantee ? "있음" : "없음"],
    ["지급 조건", bid.payTerms],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  return (
    <section className="card min-w-0 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">공고 입찰 조건</h3>
        <span className="chip">K-apt 공고 기준</span>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {shown.map(([k, v]) => (
          <li key={k} className="min-w-0 rounded-2xl border border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-300">{k}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm font-semibold [overflow-wrap:anywhere]">{v}</p>
          </li>
        ))}
      </ul>
      {bid.content && (
        <div className="mt-4 rounded-2xl bg-paper p-4">
          <p className="text-sm font-semibold">공고 내용</p>
          <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{bid.content}</p>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-500">계약기간·과업 범위·참가자격은 공고 원문과 첨부파일에서 확인하세요.</p>
    </section>
  );
}
