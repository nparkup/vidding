"use client";

/**
 * 공고 예측 1건 사용. 로그인했으면 중계 서버가 센다 (유료 이용권은 한 달 건수, 아니면 무료 체험 건수, account.ts ?account=use).
 * 로그인하지 않았으면 예전처럼 이 브라우저 + 사업자번호 기준 무료 체험(src/lib/trial.ts)으로 센다.
 * 돌려주는 값은 TrialState 모양에 유료 정보를 더한 것이라 화면(TrialGate)이 같은 자리에서 쓴다.
 */
import { useEffect, useState } from "react";
import { ACCOUNT_API, accountCall, refreshAccount, useAccount, type Usage, type UseEntry } from "./account";
import { useTrial, type TrialState } from "./trial";
import { TRIAL_LIMIT_ENABLED } from "./trialLimit";
import type { PaidPlanId } from "./usagePeriod";

export type UsageState = TrialState & {
  /** 로그인 회원 (서버가 센 값) */
  server?: boolean;
  /** 유료 이용권 회원이면 이용권과 이번 기간 */
  paid?: { plan: PaidPlanId; quota: number | null; to: string };
  suspended?: boolean;
  /** 서버에 확인하지 못했을 때 */
  error?: string;
  /** 무료 체험 제한을 꺼 둔 상태 (TRIAL_LIMIT_ENABLED=false): 세지 않고 연다 */
  off?: boolean;
};

const OPEN: UsageState = { status: "ok", used: [], left: Number.POSITIVE_INFINITY, fresh: false, off: true };

type UseResp = Usage & { ok: boolean; fresh: boolean; suspended?: boolean };

function toState(r: UseResp): UsageState {
  const used: UseEntry[] = [...r.used].sort((a, b) => a.t - b.t);
  const paid = r.mode === "paid" ? { plan: r.plan, quota: r.quota, to: r.period.to } : undefined;
  const extra = { server: true, paid, ...(r.suspended ? { suspended: true } : {}) };
  if (!r.ok) return { status: "locked", used, ...extra };
  const left = r.quota === null ? Number.POSITIVE_INFINITY : Math.max(0, r.quota - used.length);
  return { status: "ok", used, left, fresh: r.fresh, ...extra };
}

export function useUsage(key: string | null, title?: string): UsageState | null {
  const acc = useAccount();
  // 무료 체험 제한을 꺼 두면 유료 이용권 회원만 센다
  const off = !TRIAL_LIMIT_ENABLED && !(acc.status === "in" && acc.usage?.mode === "paid");
  if (off) key = null;
  const server = acc.status === "in" && !!ACCOUNT_API;
  // 로그인하지 않았을 때만 브라우저 기준으로 센다 (로그인 상태를 알기 전에는 세지 않는다)
  const local = useTrial(acc.status === "out" || (acc.status === "in" && !ACCOUNT_API) ? key : null, title);
  const [srv, setSrv] = useState<{ key: string; st: UsageState } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!server || !key) return;
    let alive = true;
    accountCall<UseResp>("use", { k: key, title })
      .then((r) => { if (!alive) return; setSrv({ key, st: toState(r) }); if (r.fresh) refreshAccount(); })
      .catch((e: Error & { status?: number }) => {
        if (!alive || e.status === 401) return; // 로그아웃되면 브라우저 기준으로 넘어간다
        setSrv({ key, st: { status: "locked", used: [], server: true, error: e.message } });
      });
    return () => { alive = false; };
    // title 은 처음 쓸 때 저장할 이름이라 바뀌어도 다시 부르지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, key, retry]);
  useEffect(() => {
    // 확인 실패는 10초 뒤 한 번 더
    if (srv?.st.error) { const t = setTimeout(() => setRetry((n) => n + 1), 10_000); return () => clearTimeout(t); }
  }, [srv]);
  if (acc.status === "loading") return null;
  if (off) return OPEN;
  if (!server) return local;
  if (!key) return null;
  return srv?.key === key ? srv.st : null;
}
