"use client";

import { useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { bizFmt, downloadCsv, won, type Billing, type Member, type Payment } from "./adminApi";
import { Field, Stats } from "./MembersTab";
import { PLANS, planName } from "@/lib/plans";
import { plansOf, useSiteConfig } from "@/lib/siteConfig";
import { calcRefund, planEnd } from "@/lib/refund";

const STATUS: Record<Billing["status"], string> = { none: "결제 없음", active: "이용 중", cancelled: "해지", expired: "기간 만료", refunded: "환불 완료" };
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const empty = (): Billing => ({ plan: "", status: "none", start: "", end: "", memo: "", payments: [] });
const net = (b?: Billing | null) => (b?.payments ?? []).reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0);
const paidSum = (b?: Billing | null) => (b?.payments ?? []).filter((p) => p.kind === "pay").reduce((s, p) => s + p.amount, 0);

/** 회원 결제정보: 결제 대행사 연동 전이라 결제·환불을 손으로 적고, 중도 해지는 요금 정책대로 다음 결제만 멈춘다(환불 없음) */
export function BillingTab({ call, guard, members, busy, reload, updateMember }: TabProps) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const stats = useMemo(() => {
    const month = today().slice(0, 7);
    const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    let monthSum = 0, total = 0, refunds = 0;
    for (const m of members) for (const p of m.billing?.payments ?? []) {
      if (p.kind === "refund") refunds += p.amount; else total += p.amount;
      if (p.date.startsWith(month)) monthSum += p.kind === "refund" ? -p.amount : p.amount;
    }
    return {
      active: members.filter((m) => m.billing?.status === "active").length,
      unlimited: members.filter((m) => m.billing?.status === "active" && m.billing.plan === "unlimited").length,
      monthSum, total, refunds,
      expiring: members.filter((m) => m.billing?.status === "active" && m.billing.end && m.billing.end <= soon).length,
    };
  }, [members]);

  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return members
      .filter((m) => (!only || (m.billing && m.billing.status !== "none")) && (!w || `${m.company} ${m.bizno} ${bizFmt(m.bizno)}`.toLowerCase().includes(w)))
      .sort((a, b) => (b.billing?.start ?? "").localeCompare(a.billing?.start ?? "") || a.company.localeCompare(b.company));
  }, [members, q, only]);

  function csv() {
    const rows: (string | number)[][] = [];
    for (const m of members) for (const p of m.billing?.payments ?? []) rows.push([p.date, m.company, bizFmt(m.bizno), p.kind === "refund" ? "환불" : "결제", p.kind === "refund" ? -p.amount : p.amount, p.method, (m.billing!.plan ? planName(m.billing!.plan) : ""), p.memo]);
    rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    downloadCsv("결제내역", ["날짜", "회사명", "사업자등록번호", "구분", "금액", "결제 수단", "이용권", "메모"], rows);
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">결제정보</h1>
          <p className="mt-1 text-sm text-ink-500">회원별 이용권·이용 기간·결제 내역과 중도 해지 처리(일할 환불 없음).</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className="btn-ghost btn-sm" disabled={busy}>{busy ? "불러오는 중…" : "새로 불러오기"}</button>
          <button type="button" onClick={csv} className="btn-primary btn-sm">결제 내역 CSV</button>
        </div>
      </div>
      <p className="mt-4 rounded-xl border border-amber/40 bg-amber-100/60 p-3 text-sm text-ink-700">
        결제 대행사(PG) 연동 전입니다. 계좌이체 등으로 받은 결제와 환불을 여기에 직접 적어 주세요. 연동하면 결제 내역이 자동으로 들어오고, 이 기록은 그대로 남습니다.
      </p>

      <Stats items={[["이용 중", stats.active], ["그중 무제한", stats.unlimited], ["이번 달 순결제", won(stats.monthSum)], ["누적 결제", won(stats.total)], ["누적 환불", won(stats.refunds)], ["30일 안 만료", stats.expiring]]} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input className="input sm:max-w-xs" placeholder="회사명·사업자번호" value={q} onChange={(e) => setQ(e.target.value)} aria-label="결제 회원 검색" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />결제 기록이 있는 회원만</label>
      </div>
      {note && <p className="mt-3 text-sm text-mint-700">{note}</p>}

      <ul className="mt-4 space-y-3">
        {shown.map((m) => {
          const b = m.billing;
          return (
            <li key={m.bizno} className="card p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">{m.company}</p>
                  <p className="text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span>{b?.plan ? planName(b.plan) : "-"}</span>
                  <span className="tabular-nums text-ink-500">{b?.start ? `${b.start} ~ ${b.end || ""}` : ""}</span>
                  <StatusBadge s={b?.status ?? "none"} />
                  <span className="font-semibold tabular-nums">{won(net(b))}</span>
                  <button type="button" onClick={() => setOpen(open === m.bizno ? null : m.bizno)} className="btn-ghost btn-sm">{open === m.bizno ? "닫기" : b ? "관리" : "결제 등록"}</button>
                </div>
              </div>
              {open === m.bizno && (
                <div className="mt-4 border-t border-ink-100 pt-4">
                  <BillingEditor m={m} call={call} guard={guard} onSaved={(nb) => { updateMember({ ...m, billing: nb }); setNote(`${m.company} 결제 정보를 저장했습니다.`); }} />
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="card p-6 text-center text-sm text-ink-400">{only ? "결제 기록이 있는 회원이 없습니다. 체크를 풀면 모든 회원에게 결제를 등록할 수 있습니다." : "회원이 없습니다."}</li>}
      </ul>
    </>
  );
}

function StatusBadge({ s }: { s: Billing["status"] }) {
  const tone = s === "active" ? "bg-mint-50 text-mint-700" : s === "refunded" || s === "cancelled" ? "bg-coral-100 text-coral" : "bg-ink-50 text-ink-500";
  return <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${tone}`}>{STATUS[s]}</span>;
}

function BillingEditor({ m, call, guard, onSaved }: { m: Member; call: TabProps["call"]; guard: TabProps["guard"]; onSaved: (b: Billing) => void }) {
  const [b, setB] = useState<Billing>(() => ({ ...empty(), ...(m.billing ?? {}), payments: [...(m.billing?.payments ?? [])] }));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancel, setCancel] = useState(today());
  const set = <K extends keyof Billing>(k: K, v: Billing[K]) => setB((x) => ({ ...x, [k]: v }));
  const setPay = (i: number, p: Partial<Payment>) => setB((x) => ({ ...x, payments: x.payments.map((y, j) => (j === i ? { ...y, ...p } : y)) }));
  const prices = plansOf(useSiteConfig());
  const priceFor = (plan: string) => prices.find((p) => p.id === plan)?.price ?? prices[0].price;
  const addPay = (p: Partial<Payment> = {}) => setB((x) => ({ ...x, payments: [...x.payments, { id: "", date: today(), kind: "pay", amount: priceFor(x.plan), method: "계좌이체", memo: "", ...p }] }));

  /** 환불 계산은 이 이용 기간(시작일 이후)에 결제한 금액 기준 */
  const periodPaid = b.payments.filter((p) => p.kind === "pay" && (!b.start || p.date >= b.start)).reduce((s, p) => s + p.amount, 0);
  const refund = b.plan ? calcRefund(b.plan, periodPaid, b.start, cancel) : null;

  function newPeriod(plan: Billing["plan"]) {
    const start = today();
    setB((x) => ({ ...x, plan, status: "active", start, end: planEnd(plan, start) }));
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const r = await guard(call<{ billing: Billing }>("billing", { params: { bizno: m.bizno }, body: b }));
      if (r) { setB(r.billing); onSaved(r.billing); }
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="이용권">
          <select className="input" value={b.plan} onChange={(e) => set("plan", e.target.value as Billing["plan"])}>
            <option value="">없음</option>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name} ({won(priceFor(p.id))})</option>)}
            {(b.plan === "monthly" || b.plan === "annual") && <option value={b.plan}>{planName(b.plan)}</option>}
          </select>
        </Field>
        <Field label="상태">
          <select className="input" value={b.status} onChange={(e) => set("status", e.target.value as Billing["status"])}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="이용 시작일"><input className="input" type="date" value={b.start} onChange={(e) => set("start", e.target.value)} /></Field>
        <Field label="이용 종료일">
          <div className="flex gap-1">
            <input className="input min-w-0" type="date" value={b.end} onChange={(e) => set("end", e.target.value)} />
            <button type="button" className="btn-ghost btn-sm shrink-0" disabled={!b.plan || !b.start} onClick={() => b.plan && set("end", planEnd(b.plan, b.start))} title="시작일에서 결제 주기만큼">자동</button>
          </div>
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="self-center text-xs text-ink-500">오늘부터 새 이용 기간:</span>
        {PLANS.map((p) => <button key={p.id} type="button" className="btn-ghost btn-sm" onClick={() => newPeriod(p.id)}>{p.name} 1개월</button>)}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">결제 내역</p>
          <button type="button" className="btn-ghost btn-sm" onClick={() => addPay()}>결제 추가</button>
        </div>
        <div className="mt-2 space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-semibold text-ink-400 lg:grid lg:grid-cols-[10.5rem_6rem_8rem_8rem_minmax(0,1fr)_3rem]">
            <span>날짜</span><span>구분</span><span className="text-right">금액</span><span>결제 수단</span><span>메모</span><span />
          </div>
          {b.payments.map((p, i) => (
            <div key={p.id || `n${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 lg:grid-cols-[10.5rem_6rem_8rem_8rem_minmax(0,1fr)_3rem] lg:items-center lg:border-0 lg:p-0">
              <input className="input min-w-0 py-1.5" type="date" value={p.date} onChange={(e) => setPay(i, { date: e.target.value })} aria-label="날짜" />
              <select className="input min-w-0 py-1.5" value={p.kind} onChange={(e) => setPay(i, { kind: e.target.value as Payment["kind"] })} aria-label="구분">
                <option value="pay">결제</option><option value="refund">환불</option>
              </select>
              <input className="input min-w-0 py-1.5 text-right tabular-nums" inputMode="numeric" value={p.amount ? p.amount.toLocaleString() : ""} onChange={(e) => setPay(i, { amount: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-label="금액" />
              <input className="input min-w-0 py-1.5" value={p.method} onChange={(e) => setPay(i, { method: e.target.value })} aria-label="결제 수단" list="pay-methods" />
              <input className="input col-span-2 min-w-0 py-1.5 lg:col-span-1" value={p.memo} onChange={(e) => setPay(i, { memo: e.target.value })} aria-label="메모" placeholder="입금자명·세금계산서 등" />
              <button type="button" className="col-span-2 text-right text-sm text-coral lg:col-span-1" onClick={() => setB((x) => ({ ...x, payments: x.payments.filter((_, j) => j !== i) }))}>삭제</button>
            </div>
          ))}
          {!b.payments.length && <p className="py-6 text-center text-sm text-ink-400">결제 내역이 없습니다.</p>}
          <datalist id="pay-methods"><option value="계좌이체" /><option value="카드" /><option value="가상계좌" /><option value="기타" /></datalist>
        </div>
        <p className="mt-2 text-right text-sm">결제 {won(paidSum(b))} · 순결제 <b>{won(net(b))}</b></p>
      </div>

      <div className="rounded-2xl border border-ink-100 bg-paper p-4">
        <p className="text-sm font-bold">중도 해지 처리</p>
        <p className="mt-1 text-xs text-ink-500">모든 이용권: 결제한 기간은 끝까지 이용하고 다음 결제부터 청구하지 않음. 일할 환불 없음.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="해지일"><input className="input sm:w-44" type="date" value={cancel} onChange={(e) => setCancel(e.target.value)} /></Field>
          {refund ? (
            <div className="text-sm">
              <p>이 기간 결제 {won(refund.paid)} · 사용 {won(refund.used)} · <b className="text-mint-700">환불 {won(refund.refund)}</b></p>
              <p className="text-xs text-ink-500">{refund.note}</p>
            </div>
          ) : <p className="text-sm text-ink-400">이용권·시작일·결제 금액이 있어야 계산합니다.</p>}
        </div>
        {refund && refund.refund > 0 && (
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => { addPay({ kind: "refund", amount: refund.refund, date: today(), memo: `중도 해지 환불 (해지일 ${cancel})` }); setB((x) => ({ ...x, status: "refunded", end: cancel })); }}>
            이 금액으로 환불 기록 추가
          </button>
        )}
      </div>

      <Field label="결제 메모"><textarea className="input min-h-[4rem]" value={b.memo} onChange={(e) => set("memo", e.target.value)} /></Field>
      {err && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p>}
      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? "저장 중…" : "결제 정보 저장"}</button>
        <span className="text-xs text-ink-400">저장하기 전에는 바뀌지 않습니다.</span>
      </div>
    </div>
  );
}
