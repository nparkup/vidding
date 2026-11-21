"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { aptDetailUrl, type AptBid, type AptBidsFile } from "@/lib/apt";
import { contractMonths, forecastAptPrice, type AptPriceCheck } from "@/lib/aptPrice";
import { shortDate, won, wonFull } from "@/lib/format";
import { loadSiteJson } from "@/lib/useSiteJson";
import { CloseDdayBadge } from "../Badges";
import { CloseDay } from "../CloseDay";

/** 직전 계약과 비교해 예측하는 분야 (공사·물품·기타 용역은 단지마다 일이 달라 예측하지 않는다) */
const PRICEABLE = new Set<string>(["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "주택관리(위탁)"]);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (r: number) => `${r >= 1 ? "+" : ""}${((r - 1) * 100).toFixed(1)}%`;
const digits = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;

/** 아파트(K-apt) 입찰가격 예측: 공고를 고르면 같은 단지 직전 계약과 과거 낙찰 변화율로 예상 낙찰금액을 낸다 */
export function AptPricePredictor() {
  const sp = useSearchParams();
  const [data, setData] = useState<AptBidsFile | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(sp.get("apt"));
  // 직전 계약을 직접 넣는 칸 (자료가 없거나 다른 계약과 비교하고 싶을 때)
  const [manualAmount, setManualAmount] = useState("");
  const [scale, setScale] = useState("1");
  const [months, setMonths] = useState("");

  useEffect(() => {
    loadSiteJson<AptBidsFile>("apt-bids-data.json").then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => {
    const no = sp.get("apt");
    if (no) setPicked(no);
  }, [sp]);

  const open = useMemo(() => (data?.items ?? []).filter((b) => PRICEABLE.has(b.category) && new Date(b.closeAt).getTime() > Date.now()), [data]);
  const bid = useMemo(() => (data?.items ?? []).find((b) => b.no === picked), [data, picked]);
  useEffect(() => { setManualAmount(""); setScale("1"); setMonths(""); }, [picked]);

  const matches = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean).map(norm);
    return open
      .filter((b) => words.every((w) => norm(`${b.title} ${b.apt} ${b.category} ${b.region} ${b.no}`).includes(w)))
      .sort((a, b) => Number(!!b.prior) - Number(!!a.prior) || a.closeAt.localeCompare(b.closeAt))
      .slice(0, 100);
  }, [open, q]);

  if (error) return <p className="card p-6 text-sm text-ink-500">아파트 공고 자료를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>;
  if (!data) return <p className="card p-6 text-sm text-ink-300">불러오는 중…</p>;
  if (!data.pricing) return <p className="card p-6 text-sm text-ink-500">입찰가격 예측 자료가 아직 준비되지 않았습니다. 다음 갱신 뒤에 다시 확인해 주세요.</p>;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="card min-w-0 p-5 sm:p-6">
        <p className="text-sm font-semibold">아파트 공고 고르기</p>
        <p className="mt-1 text-xs text-ink-500">청소·경비·소독·승강기유지·전기안전관리·정화조·저수조·위탁관리 진행 중 공고 {open.length.toLocaleString()}건. 직전 계약이 있는 공고가 먼저 나옵니다.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="단지명·공고명·업종·지역" className="input mt-3 w-full" aria-label="아파트 공고 검색" />
        <ul className="mt-3 max-h-[420px] min-w-0 space-y-2 overflow-y-auto pr-1">
          {matches.map((b) => (
            <li key={b.no}>
              <button type="button" onClick={() => setPicked(b.no)} className={`w-full min-w-0 rounded-xl border p-3 text-left transition ${b.no === picked ? "border-mint-500 bg-mint-50" : "border-ink-100 hover:border-ink-300"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <CloseDdayBadge iso={b.closeAt} />
                  <span className="chip">{b.category}</span>
                  {b.region && <span className="chip">{b.region}</span>}
                </div>
                <p className="mt-1.5 text-sm font-semibold leading-snug [overflow-wrap:anywhere]"><CloseDay iso={b.closeAt} />{b.title}</p>
                <p className="mt-0.5 text-xs text-ink-500 [overflow-wrap:anywhere]">{b.apt} · {b.prior ? `직전 ${b.prior.via === "수의계약" ? "수의계약" : "낙찰"} ${won(b.prior.amount)}` : "직전 계약 자료 없음"}</p>
              </button>
            </li>
          ))}
          {!matches.length && <li className="p-3 text-sm text-ink-300">조건에 맞는 공고가 없습니다.</li>}
        </ul>
      </div>

      <div className="min-w-0">
        {bid ? <Result bid={bid} data={data} manualAmount={manualAmount} setManualAmount={setManualAmount} scale={scale} setScale={setScale} months={months} setMonths={setMonths} /> : (
          <div className="card p-6 text-sm text-ink-500">왼쪽에서 아파트 공고를 고르면 같은 단지 직전 계약금액과 과거 낙찰 변화율로 예상 낙찰금액을 계산합니다.</div>
        )}
      </div>
    </div>
  );
}

const SCALES = [
  { v: "1", t: "직전과 같음" },
  { v: "2", t: "두 배 (예: 1년 → 2년 계약)" },
  { v: "0.5", t: "절반 (예: 2년 → 1년 계약)" },
  { v: "1.5", t: "1.5배 (예: 2년 → 3년 계약)" },
];

function Result({ bid, data, manualAmount, setManualAmount, scale, setScale, months, setMonths }: {
  bid: AptBid; data: AptBidsFile;
  manualAmount: string; setManualAmount: (v: string) => void;
  scale: string; setScale: (v: string) => void;
  months: string; setMonths: (v: string) => void;
}) {
  const model = data.pricing!;
  const manual = digits(manualAmount) > 0;
  const prior = manual ? { amount: digits(manualAmount) } : bid.prior;
  const priorMonths = !manual && bid.prior ? contractMonths(bid.prior.start, bid.prior.end) : undefined;
  const want = Math.min(60, digits(months));
  // 직전 계약기간을 알면 이번 개월 수로, 모르면 규모 배율로 맞춘다
  const k = priorMonths && want ? want / priorMonths : Number(scale) || 1;
  const f = prior && PRICEABLE.has(bid.category) ? forecastAptPrice(model, bid.category, bid.award, prior, k) : undefined;
  const st = f?.stat;
  const round = (x: number) => Math.round(x / 1000) * 1000;
  // 좁은 화면은 결과가 목록 아래에 있어 공고를 고르면 결과로 내려간다
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.innerWidth < 1024) box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [bid.no]);

  return (
    <div ref={box} className="card min-w-0 scroll-mt-20 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <CloseDdayBadge iso={bid.closeAt} />
        <span className="chip">{bid.category}</span>
        {bid.award && <span className="chip">{bid.award}</span>}
        {bid.region && <span className="chip">{bid.region}</span>}
      </div>
      <p className="mt-2 font-semibold leading-snug [overflow-wrap:anywhere]">{bid.title}</p>
      <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">{bid.apt} · 마감 {shortDate(bid.closeAt)}</p>

      {bid.prior && !manual && (
        <div className="mt-4 rounded-xl bg-paper p-3 text-sm">
          <p className="font-semibold">같은 단지 직전 {bid.category} {bid.prior.via === "수의계약" ? "수의계약" : "낙찰"}</p>
          <p className="mt-1 text-ink-500 [overflow-wrap:anywhere]">{bid.prior.title}</p>
          <p className="mt-1 tabular-nums"><b>{wonFull(bid.prior.amount)}</b>{bid.prior.company ? ` · ${bid.prior.company}` : ""}</p>
          {bid.prior.start && bid.prior.end && <p className="tabular-nums text-ink-500">계약 {bid.prior.start} ~ {bid.prior.end}{priorMonths ? ` (${priorMonths}개월)` : ""}</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm">
          <span className="text-ink-500">{bid.prior ? "다른 직전 계약금액으로 계산 (선택)" : "직전 계약금액 (원)"}</span>
          <input inputMode="numeric" value={manualAmount ? digits(manualAmount).toLocaleString() : ""} onChange={(e) => setManualAmount(e.target.value)} placeholder="예: 36,000,000" className="input mt-1 w-full" />
        </label>
        {priorMonths ? (
          <label className="min-w-0 text-sm">
            <span className="text-ink-500">이번 계약기간 (개월)</span>
            <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/[^\d]/g, ""))} placeholder={`${priorMonths} (직전과 같음)`} className="input mt-1 w-full" />
          </label>
        ) : (
          <label className="min-w-0 text-sm">
            <span className="text-ink-500">이번 계약 규모 (직전 대비)</span>
            <select value={scale} onChange={(e) => setScale(e.target.value)} className="input mt-1 w-full">
              {SCALES.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          </label>
        )}
      </div>

      {f && st ? (
        <div className="mt-5">
          <p className="text-sm text-ink-500">예상 낙찰금액{f.scale !== 1 ? ` (직전 대비 ${Math.round(f.scale * 100) / 100}배 규모)` : " (계약 기간·범위가 직전과 같을 때)"}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{wonFull(round(f.mid))}</p>
          <p className="mt-1 text-sm tabular-nums text-ink-700">예상 구간 {wonFull(round(f.low))} ~ {wonFull(round(f.high))}</p>
          <p className="mt-1 text-sm tabular-nums text-ink-500">직전 계약{f.scale !== 1 ? " 환산" : ""} 대비 {signed(st.median)}</p>
          <div className="mt-4 space-y-2 rounded-xl border border-ink-100 p-3 text-sm leading-relaxed text-ink-700">
            <p><b>계산 근거</b> · {f.basis} 낙찰 가운데 같은 단지의 직전 계약 다음에 나온 {st.all.toLocaleString()}건을 보면, {pct(st.same)}는 규모가 직전과 비슷했고 그 {st.n.toLocaleString()}건의 낙찰금액은 직전보다 가운데값 {signed(st.median)}(10~90% 구간 {signed(st.low)} ~ {signed(st.high)}) 달라졌습니다. 전체 짝의 {pct(st.double)}는 약 두 배, {pct(st.half)}는 약 절반이었는데, 계약기간이나 과업 범위가 바뀐 경우로 보입니다.</p>
            {f.check && f.check.n > 0 && <CheckLine c={f.check} cutoff={model.check.cutoff} cat={f.checkBasis} />}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-paper p-3 text-sm text-ink-500">같은 단지 직전 계약 자료가 없어 예측하지 않습니다. 직전 계약금액을 알고 있으면 위에 입력해 주세요.</p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-300">K-apt 입찰결과에는 예정가격·기초금액이 없어 나라장터처럼 투찰률로 계산하지 않고, 같은 단지·같은 업종 직전 계약(낙찰·수의계약) 대비 다음 낙찰의 변화율로 계산합니다. 공고서의 계약기간·과업 범위가 직전과 다르면 위의 계약기간이나 규모를 바꿔 보세요.</p>
      <a href={aptDetailUrl(bid.no)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mt-3">K-apt 원문 보기</a>
    </div>
  );
}

function CheckLine({ c, cutoff, cat }: { c: AptPriceCheck; cutoff: string; cat: string }) {
  const y = cutoff.slice(0, 4);
  return (
    <p>
      <b>정확도</b> · {y}년 이전 자료로 만든 같은 계산을 {y}년 {cat} 낙찰 중 규모가 직전과 비슷했던 {c.n.toLocaleString()}건에 맞춰 보니, 예상 금액과 5% 안 {pct(c.within5)}, 10% 안 {pct(c.within10)}, 예상 구간 안 {pct(c.inRange)}였습니다. 직전 계약금액을 그대로 썼다면 5% 안 {pct(c.naive5)}, 10% 안 {pct(c.naive10)}입니다.
    </p>
  );
}
