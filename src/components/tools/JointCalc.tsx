"use client";

import { useMemo, useState } from "react";
import { won, wonFull } from "@/lib/format";
import { calcJoint, estAmountOf, suggestShares, type JointCalcBid, type JointCalcMember, type Verdict } from "@/lib/jointCalc";
import { useBids } from "@/lib/useBids";

const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
const fmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");
const MEMBER = (i: number): JointCalcMember => ({ name: i === 0 ? "우리 회사 (대표사)" : `구성원 ${i + 1}`, cap: 0, perf: 0, share: i === 0 ? 60 : 40, local: false });

const badge: Record<Verdict, string> = {
  ok: "border-mint/30 bg-mint-50 text-mint-700",
  fail: "border-coral/30 bg-coral-100/60 text-coral",
  na: "border-ink-100 bg-paper text-ink-400",
};
const label: Record<Verdict, string> = { ok: "충족", fail: "부족", na: "해당 없음" };

function MoneyInput({ value, onChange, placeholder }: { value: number; onChange: (n: number) => void; placeholder?: string }) {
  return (
    <div className="min-w-0">
      <input className="input tabular-nums" inputMode="numeric" placeholder={placeholder} value={fmt(value)} onChange={(e) => onChange(num(e.target.value))} />
      {value > 0 && <p className="mt-0.5 text-[11px] text-ink-400">{won(value)}</p>}
    </div>
  );
}

/** 공동도급 지분 계산기: 공고 조건과 구성원 시평액·실적·지분을 넣으면 단독 가능 여부, 구성원별 최대 참여비율, 충족 여부를 본다 */
export function JointCalc() {
  const { bids } = useBids();
  const [bidNo, setBidNo] = useState("");
  const [loaded, setLoaded] = useState("");
  const [b, setB] = useState<JointCalcBid>({ est: 0, estAmt: 0, base: 0, bidRate: 88, capLimit: true, perfNeed: 0, minShare: 10, regionDuty: 0 });
  const [members, setMembers] = useState<JointCalcMember[]>([MEMBER(0), MEMBER(1)]);
  const r = useMemo(() => calcJoint(b, members), [b, members]);
  const set = <K extends keyof JointCalcBid>(k: K, v: JointCalcBid[K]) => setB((x) => ({ ...x, [k]: v }));
  const setM = (i: number, p: Partial<JointCalcMember>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...p } : m)));

  function load() {
    const t = bidNo.trim().toUpperCase();
    const bid = (bids ?? []).find((x) => x.bidNtceNo === t || x.id === t);
    if (!bid) { setLoaded(`지금 진행 중인 공고에서 ${t || "공고번호"}를 찾지 못했습니다.`); return; }
    setB((x) => ({ ...x, est: bid.baseAmount, estAmt: 0, base: 0, bidRate: bid.lowerLimitRate ? Math.ceil(bid.lowerLimitRate * 1000) / 1000 : x.bidRate }));
    setLoaded(`${bid.title} · ${bid.demandAgency}${bid.jointContract ? "" : " · 이 공고는 공동도급 허용 표시가 없습니다. 공고서를 확인하세요."}`);
  }

  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <section className="card p-4 sm:p-5">
          <h2 className="font-bold">1. 공고 조건</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className="input min-w-0 flex-1" placeholder="공고번호로 불러오기 (예: R26BK01838374)" value={bidNo} onChange={(e) => setBidNo(e.target.value)} />
            <button type="button" className="btn-ghost btn-sm" onClick={load}>불러오기</button>
          </div>
          {loaded && <p className="mt-1.5 text-xs text-ink-500">{loaded}</p>}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0"><span className="label">추정가격 (원)</span><MoneyInput value={b.est} onChange={(v) => set("est", v)} /></label>
            <label className="min-w-0"><span className="label">추정금액 (원, 시평 비교용)</span><MoneyInput value={b.estAmt} onChange={(v) => set("estAmt", v)} placeholder={b.est ? `비우면 ${fmt(Math.round(b.est * 1.1))}` : "비우면 추정가격 × 1.1"} /></label>
            <label className="min-w-0"><span className="label">기초금액 (원)</span><MoneyInput value={b.base} onChange={(v) => set("base", v)} placeholder="비우면 추정금액" /></label>
            <label className="min-w-0"><span className="label">예상 투찰률 (%)</span><input className="input tabular-nums" inputMode="decimal" value={b.bidRate || ""} onChange={(e) => set("bidRate", num(e.target.value))} /></label>
            <label className="min-w-0"><span className="label">최소 필요 실적 (원, 없으면 비움)</span><MoneyInput value={b.perfNeed} onChange={(v) => set("perfNeed", v)} /></label>
            <label className="min-w-0"><span className="label">구성원 최소 지분율 (%)</span><input className="input tabular-nums" inputMode="decimal" value={b.minShare || ""} onChange={(e) => set("minShare", num(e.target.value))} /></label>
            <label className="min-w-0"><span className="label">지역의무 공동도급 비율 (%, 없으면 0)</span><input className="input tabular-nums" inputMode="decimal" value={b.regionDuty || ""} placeholder="0" onChange={(e) => set("regionDuty", num(e.target.value))} /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={b.capLimit} onChange={(e) => set("capLimit", e.target.checked)} />시공능력평가액 제한 공고</label>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">2. 구성원</h2>
            <span className="text-xs text-ink-400">첫 줄이 대표사입니다</span>
            <div className="ml-auto flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setMembers((ms) => { const s = suggestShares(b, ms); return ms.map((m, i) => ({ ...m, share: s[i] })); })}>지분 자동 배분</button>
              {members.length < 5 && <button type="button" className="btn-ghost btn-sm" onClick={() => setMembers((ms) => [...ms, { ...MEMBER(ms.length), share: 0 }])}>구성원 추가</button>}
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {members.map((m, i) => {
              const mr = r.members[i];
              return (
                <li key={i} className="rounded-xl border border-ink-100 p-3">
                  <div className="flex items-center gap-2">
                    <input className="input min-w-0 flex-1 font-semibold" value={m.name} onChange={(e) => setM(i, { name: e.target.value })} aria-label="업체명" />
                    {i > 0 && members.length > 2 && <button type="button" className="btn-ghost btn-sm" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}>빼기</button>}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px]">
                    <label className="min-w-0"><span className="label">시공능력평가액 (원)</span><MoneyInput value={m.cap} onChange={(v) => setM(i, { cap: v })} /></label>
                    <label className="min-w-0"><span className="label">해당 공종 실적 (원)</span><MoneyInput value={m.perf} onChange={(v) => setM(i, { perf: v })} /></label>
                    <label className="min-w-0"><span className="label">지분율 (%)</span><input className="input tabular-nums" inputMode="decimal" value={m.share || ""} onChange={(e) => setM(i, { share: num(e.target.value) })} /></label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={m.local} onChange={(e) => setM(i, { local: e.target.checked })} />지역업체</label>
                    {b.capLimit && <span>최대 참여비율 <b className="text-ink">{mr.maxShare}%</b></span>}
                    <span>지분 금액 <b className="text-ink">{wonFull(mr.amount)}</b></span>
                  </div>
                  {mr.issues.map((t) => <p key={t} className="mt-1 text-xs text-coral">{t}</p>)}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="min-w-0 space-y-4">
        <section className="card p-4 sm:p-5">
          <h2 className="font-bold">판정</h2>
          <div className={`mt-3 rounded-xl border px-3 py-2.5 text-sm ${r.solo.ok ? badge.ok : "border-ink-100 bg-paper"}`}>
            <p className="font-semibold">{r.solo.ok ? "대표사 단독 참가 가능" : "대표사 단독으로는 부족"}</p>
            {r.solo.reasons.map((t) => <p key={t} className="mt-0.5 text-xs text-ink-500">{t}</p>)}
          </div>
          <ul className="mt-3 divide-y divide-ink-100 text-sm">
            {r.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 py-2">
                <span className={`chip shrink-0 ${badge[c.verdict]}`}>{label[c.verdict]}</span>
                <div className="min-w-0"><p className="font-semibold">{c.label}</p><p className="text-xs text-ink-500">{c.detail}</p></div>
              </li>
            ))}
          </ul>
          <p className={`mt-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${r.ok ? "bg-mint-50 text-mint-700" : "bg-coral-100/60 text-coral"}`}>
            {r.ok ? "이 구성으로 공동수급 조건을 모두 채웁니다" : "채우지 못한 조건이 있습니다"}
          </p>
        </section>
        <section className="card p-4 text-sm sm:p-5">
          <h2 className="font-bold">금액</h2>
          <dl className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-2"><dt className="text-ink-500">추정금액</dt><dd className="tabular-nums">{wonFull(estAmountOf(b))}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-500">예상 계약 금액</dt><dd className="tabular-nums">{wonFull(r.contract)}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ink-500">구성원 실적 합</dt><dd className="tabular-nums">{wonFull(r.totalPerf)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-ink-400">예상 계약 금액 = 기초금액 × 예상 투찰률. 지분 금액은 이 금액에 지분율을 곱한 값입니다.</p>
        </section>
        <p className="text-xs leading-relaxed text-ink-400">
          공동이행 방식 기준의 참고 계산입니다.<br />시공능력평가액은 구성원마다 추정금액 × 지분율 이내, 실적은 구성원 합산으로 봅니다.
          분담이행 방식, 주계약자 방식, 대표사 단독 실적을 요구하는 공고, 경영상태 등 다른 제한은 공고서를 따르세요.
          적격심사 점수의 공동수급 반영은 입찰점수 예측 화면에서 계산합니다.
        </p>
      </aside>
    </div>
  );
}
