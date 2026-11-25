"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { allowedTrial, readTrial, type TrialEntry } from "@/lib/trial";
import { useSiteConfig } from "@/lib/siteConfig";
import { useAccount } from "@/lib/account";
import { planName } from "@/lib/plans";
import type { UsageState } from "@/lib/usage";
import { TRIAL_LIMIT_ENABLED } from "@/lib/trialLimit";

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** 고른 공고 아래: 무료 체험(또는 이용권) 사용 건수 */
export function TrialNote({ state }: { state: UsageState | null }) {
  const TRIAL_LIMIT = useSiteConfig().trialLimit;
  if (!state || state.status !== "ok" || state.off) return null;
  if (state.paid) {
    const n = state.used.length;
    const q = state.paid.quota;
    return (
      <p className="mt-3 rounded-xl bg-mint-50 px-3 py-2 text-xs text-ink-700">
        <b className="text-mint-700">{planName(state.paid.plan)} 이용권 이번 달 {q === null ? `${n.toLocaleString()}건 분석` : `${n.toLocaleString()}/${q.toLocaleString()}건 사용`}</b>
        {q !== null && ` · 남은 공고 ${Math.max(0, q - n).toLocaleString()}건`}
        <span className="text-ink-500"> · {md(state.paid.to)}에 새로 시작 · 이미 분석한 공고는 다시 열어도 차감되지 않습니다.</span>
      </p>
    );
  }
  const n = state.used.length || TRIAL_LIMIT - state.left;
  return (
    <p className="mt-3 rounded-xl bg-mint-50 px-3 py-2 text-xs text-ink-700">
      <b className="text-mint-700">무료 체험 {n}/{TRIAL_LIMIT}건 사용</b>
      {state.left > 0 ? ` · 남은 공고 ${state.left}건` : " · 남은 공고 없음"}
      <span className="text-ink-500"> · 이미 분석한 공고는 다시 열어도 차감되지 않습니다.</span>
    </p>
  );
}

/** 공고를 고르기 전 안내 */
export function TrialIntro() {
  const TRIAL_LIMIT = useSiteConfig().trialLimit;
  const acc = useAccount();
  const [local, setLocal] = useState<TrialEntry[]>([]);
  useEffect(() => { setLocal(allowedTrial(readTrial())); }, [TRIAL_LIMIT]);
  const u = acc.status === "in" ? acc.usage : undefined;
  if (u?.mode === "paid") {
    return (
      <p className="mt-3 text-xs text-ink-500">
        {planName(u.plan)} 이용권으로 분석합니다.<br />이번 달 {u.used.length.toLocaleString()}건{u.quota !== null ? ` 사용, ${Math.max(0, u.quota - u.used.length).toLocaleString()}건 남았습니다` : " 분석했습니다"}. 나라장터·공동주택 입찰공고를 합쳐 세고, {md(u.period.to)}에 새로 시작합니다.
      </p>
    );
  }
  // 무료 체험 제한을 꺼 둔 동안에는 건수 안내를 하지 않는다
  if (!TRIAL_LIMIT_ENABLED) return null;
  const used = u ? u.used : local;
  const left = Math.max(0, TRIAL_LIMIT - used.length);
  return (
    <p className="mt-3 text-xs text-ink-500">
      무료 체험으로 입찰공고 {TRIAL_LIMIT}건까지 분석할 수 있습니다.<br />나라장터·공동주택 입찰공고를 합쳐 셉니다.{used.length ? ` 지금 ${used.length}건 사용, ${left}건 남았습니다.` : ""}
    </p>
  );
}

/** 무료 체험 3건(또는 이용권 한 달 건수)을 다 쓴 뒤 새 공고를 고르면 분석 대신 보여 준다 */
export function TrialLocked({ used, onPick, state }: { used: TrialEntry[]; onPick: (e: TrialEntry) => void; state?: UsageState | null }) {
  const TRIAL_LIMIT = useSiteConfig().trialLimit;
  const acc = useAccount();
  const paid = state?.paid;
  // 이용권은 한 달에 수백 건이라 최근 공고만 보여 준다
  const shown = paid ? [...used].sort((a, b) => b.t - a.t).slice(0, 10) : used;
  return (
    <aside className="card min-w-0 p-6">
      {state?.error ? (
        <>
          <p className="font-bold">사용 건수를 확인하지 못했습니다</p>
          <p className="mt-2 text-sm text-ink-700">{state.error} 잠시 뒤 자동으로 다시 확인합니다.</p>
        </>
      ) : state?.suspended ? (
        <>
          <p className="font-bold">이용이 정지된 계정입니다</p>
          <p className="mt-2 text-sm text-ink-700">새 공고를 분석할 수 없습니다.<br />고객센터로 문의해 주세요.</p>
        </>
      ) : paid ? (
        <>
          <p className="font-bold">이번 달 공고 예측 {paid.quota?.toLocaleString()}건을 모두 사용했습니다</p>
          <p className="mt-2 text-sm text-ink-700">
            {planName(paid.plan)} 이용권은 {md(paid.to)}에 다시 {paid.quota?.toLocaleString()}건으로 시작합니다.<br />그전에 더 분석하려면 건수가 많은 이용권으로 바꿔 주세요.
          </p>
        </>
      ) : (
        <>
          <p className="font-bold">무료 체험 {TRIAL_LIMIT}건을 모두 사용했습니다</p>
          <p className="mt-2 text-sm text-ink-700">
            무료 체험은 입찰공고 {TRIAL_LIMIT}건까지 평가점수 예측·배점표 판독·낙찰 결과로 본 예측을 제공합니다.
            다른 공고를 분석하려면 요금제를 신청해 주세요.
          </p>
        </>
      )}
      {shown.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-500">{paid ? "이번 달 분석한 공고 (최근 10건, 다시 열 수 있습니다)" : "체험으로 분석한 공고 (다시 열 수 있습니다)"}</p>
          <ul className="mt-2 space-y-1">
            {shown.map((e) => {
              const label = e.title || e.k.replace(/^(nara|apt|nuri):/, "공고 ");
              return (
                <li key={e.k}>
                  <button type="button" onClick={() => onPick(e)} className="w-full rounded-xl bg-paper px-3 py-2 text-left text-sm font-semibold hover:bg-ink-100/60">
                    <span className="mr-1.5 text-xs font-medium text-ink-400">{e.k.startsWith("apt:") ? "공동주택" : e.k.startsWith("nuri:") ? "민간" : "나라장터"}</span>{label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!state?.error && !state?.suspended && <Link href="/pricing" className="btn-primary mt-5 inline-flex">요금제 보기</Link>}
      {acc.status !== "in" && (
        <p className="mt-3 text-xs text-ink-400">
          이용권을 쓰고 계시면 <Link href="/login" className="font-semibold text-mint-600 underline">로그인</Link>해 주세요.<br />로그인하지 않으면 사용 건수는 가입·조회한 사업자등록번호와 이 브라우저를 기준으로 셉니다.
        </p>
      )}
    </aside>
  );
}
