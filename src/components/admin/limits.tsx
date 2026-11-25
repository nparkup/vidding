"use client";

/**
 * 회원별 이용 한도: 요금제(무료 체험·라이트·스탠다드)마다 기본 한도가 있고, 관리자가 회원마다 개별 한도를 정할 수 있다.
 * 계산은 중계 서버와 같은 src/lib/usagePeriod.ts limitOf. 서버가 보낸 값(m.quota)이 있으면 그것을 쓴다.
 */
import { useState } from "react";
import type { TabProps } from "./AdminConsole";
import { dt, type Member, type MemberQuota } from "./adminApi";
import { planName } from "@/lib/plans";
import { useSiteConfig } from "@/lib/siteConfig";
import { limitOf, MAX_QUOTA } from "@/lib/usagePeriod";

/** 회원 한 명의 지금 요금제·적용 한도·사용 건수 */
export function useMemberQuota() {
  const cfg = useSiteConfig();
  return (m: Member): MemberQuota => {
    if (m.quota) return m.quota;
    const lim = limitOf(m.billing ?? null, cfg.pricing, cfg.trialLimit, m.limit);
    return { ...lim, used: lim.tier === "trial" ? m.trial.length : 0 };
  };
}

export const tierName = (q: Pick<MemberQuota, "tier">) => (q.tier === "trial" ? "무료 체험" : planName(q.tier));
export const quotaText = (n: number | null) => (n === null ? "무제한" : `${n.toLocaleString()}건`);
/** 한도 단위: 유료 이용권은 한 달, 무료 체험은 누적 */
export const unitOf = (q: MemberQuota) => (q.tier === "trial" ? "누적" : "월");
export const leftOf = (q: MemberQuota) => (q.quota === null ? null : Math.max(0, q.quota - q.used));
export const fullOf = (q: MemberQuota) => q.quota !== null && q.used >= q.quota;

const dayBefore = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};
export const periodText = (q: MemberQuota) => (q.period ? `${q.period.from} ~ ${dayBefore(q.period.to)}` : "기간 없음 (누적)");

/** 사용 n / 한도 배지 */
export function QuotaBadge({ q }: { q: MemberQuota }) {
  const full = fullOf(q);
  return (
    <span className={`inline-block shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${full ? "bg-coral-100 text-coral" : q.used ? "bg-mint-50 text-mint-700" : "bg-ink-50 text-ink-400"}`}>
      {q.tier === "trial" ? "체험" : "이번 달"} {q.used.toLocaleString()}{q.quota !== null ? `/${q.quota.toLocaleString()}` : ""}건{q.custom ? " · 개별" : ""}
    </span>
  );
}

/** 사용률 막대 */
export function QuotaBar({ q }: { q: MemberQuota }) {
  if (q.quota === null) return <div className="h-1.5 rounded-full bg-mint-100" title="무제한" />;
  const pct = q.quota ? Math.min(100, Math.round((q.used / q.quota) * 100)) : 100;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={q.used} aria-valuemin={0} aria-valuemax={q.quota}>
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-coral" : pct >= 80 ? "bg-amber" : "bg-mint"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 회원정보 상세: 이용 한도 보기·개별 한도 정하기·이번 기간 사용 초기화 */
export function LimitEditor({ m, call, guard, onSaved }: {
  m: Member; call: TabProps["call"]; guard: TabProps["guard"]; onSaved: (m: Member, msg: string) => void;
}) {
  const q = useMemberQuota()(m);
  const [mode, setMode] = useState<"base" | "num" | "unlimited">(!m.limit ? "base" : m.limit.quota === null ? "unlimited" : "num");
  const [n, setN] = useState(m.limit?.quota != null ? String(m.limit.quota) : q.base !== null ? String(q.base) : "");
  const [memo, setMemo] = useState(m.limit?.memo ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function save() {
    setErr("");
    let body: Record<string, unknown>;
    if (mode === "base") body = { reset: true };
    else if (mode === "unlimited") body = { quota: null, memo };
    else {
      const v = Number(n.replace(/[^\d]/g, ""));
      if (!n.trim() || !Number.isFinite(v) || v < 0 || v > MAX_QUOTA) { setErr(`한도는 0 ~ ${MAX_QUOTA.toLocaleString()}건 사이 숫자로 적어 주세요.`); return; }
      body = { quota: v, memo };
    }
    setBusy(true);
    try {
      const r = await guard(call<{ member: Member; quota: MemberQuota }>("member-limit", { params: { bizno: m.bizno }, body }));
      if (r) onSaved({ ...m, limit: (r.member.limit as Member["limit"]) ?? null, quota: r.quota }, `${m.company} 이용 한도를 ${mode === "base" ? "요금제 기본으로 되돌렸습니다" : `${quotaText(r.quota.quota)}으로 정했습니다`}.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function resetUse() {
    setBusy(true);
    setErr("");
    try {
      if (await guard(call("usage-reset", { params: { bizno: m.bizno }, body: {} }))) onSaved({ ...m, quota: { ...q, used: 0 } }, `${m.company} 이번 달 공고 예측 사용 기록을 초기화했습니다.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); setConfirm(false); }
  }

  const left = leftOf(q);
  return (
    <div className="rounded-2xl border border-ink-100 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold">이용 한도</p>
        <p className="text-xs text-ink-400">{tierName(q)} · {periodText(q)}</p>
      </div>
      <p className="mt-2 flex items-baseline justify-between text-sm">
        <span className="text-ink-500">{q.tier === "trial" ? "공고 예측 (누적)" : "이번 달 공고 예측"}</span>
        <span className="tabular-nums"><b className="text-lg">{q.used.toLocaleString()}</b> / {quotaText(q.quota)}</span>
      </p>
      <div className="mt-1.5"><QuotaBar q={q} /></div>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-xs text-ink-500">요금제 기본</dt><dd className="tabular-nums">{q.tier === "trial" ? "" : "월 "}{quotaText(q.base)}</dd>
        <dt className="text-xs text-ink-500">적용 한도</dt><dd className="tabular-nums">{quotaText(q.quota)}{q.custom ? " (개별 한도)" : ""}</dd>
        <dt className="text-xs text-ink-500">남은 건수</dt><dd className="tabular-nums">{left === null ? "제한 없음" : `${left.toLocaleString()}건`}</dd>
        {m.limit?.at && <><dt className="text-xs text-ink-500">개별 한도 설정</dt><dd>{dt(m.limit.at)}{m.limit.memo ? ` · ${m.limit.memo}` : ""}</dd></>}
      </dl>

      <div className="mt-4 space-y-2 border-t border-ink-100 pt-3">
        <p className="text-xs font-semibold text-ink-500">이 회원의 한도</p>
        <div className="flex flex-col gap-1.5 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name={`lim-${m.bizno}`} checked={mode === "base"} onChange={() => setMode("base")} />요금제 기본 한도 ({quotaText(q.base)})</label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name={`lim-${m.bizno}`} checked={mode === "num"} onChange={() => setMode("num")} />개별 한도
            <input className="input w-24 py-1 text-right tabular-nums" inputMode="numeric" value={n} onFocus={() => setMode("num")} onChange={(e) => setN(e.target.value.replace(/[^\d]/g, ""))} aria-label="개별 한도 건수" />
            <span className="text-ink-500">건{q.tier === "trial" ? " (누적)" : " (월)"}</span>
          </label>
          <label className="flex items-center gap-2"><input type="radio" name={`lim-${m.bizno}`} checked={mode === "unlimited"} onChange={() => setMode("unlimited")} />무제한</label>
        </div>
        {mode !== "base" && <input className="input py-1.5 text-sm" placeholder="사유 메모 (예: 추가 결제 50건, 시범 이용)" value={memo} maxLength={200} onChange={(e) => setMemo(e.target.value)} aria-label="개별 한도 메모" />}
        {err && <p className="rounded-xl bg-coral-100 p-2.5 text-sm text-coral">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} className="btn-primary btn-sm" disabled={busy}>{busy ? "저장 중…" : "한도 저장"}</button>
          {q.tier !== "trial" && !confirm && <button type="button" onClick={() => setConfirm(true)} className="btn-ghost btn-sm" disabled={busy || !q.used}>이번 달 사용 초기화</button>}
        </div>
        {confirm && (
          <div className="rounded-xl bg-coral-100/60 p-3">
            <p className="text-sm text-coral">이번 달({periodText(q)}) 공고 예측 사용 기록 {q.used.toLocaleString()}건을 지웁니다. 되돌릴 수 없습니다.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={resetUse} disabled={busy} className="rounded-full bg-coral px-4 py-1.5 text-sm font-bold text-white">초기화</button>
              <button type="button" onClick={() => setConfirm(false)} className="btn-ghost btn-sm">취소</button>
            </div>
          </div>
        )}
        <p className="text-xs text-ink-400">개별 한도는 이 회원의 지금 요금제에 적용됩니다. 무료 체험이면 누적 건수, 이용권이면 한 달 건수입니다. 요금제 기본 한도는 페이지 설정에서 바꿉니다.</p>
      </div>
    </div>
  );
}
