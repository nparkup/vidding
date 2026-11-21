"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { allowedTrial, readTrial, TRIAL_LIMIT, type TrialEntry, type TrialState } from "@/lib/trial";

/** 고른 공고 아래: 무료 체험 사용 건수 */
export function TrialNote({ state }: { state: TrialState | null }) {
  if (!state || state.status !== "ok") return null;
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
  const [used, setUsed] = useState<TrialEntry[]>([]);
  useEffect(() => { setUsed(allowedTrial(readTrial())); }, []);
  const left = Math.max(0, TRIAL_LIMIT - used.length);
  return (
    <p className="mt-3 text-xs text-ink-500">
      무료 체험으로 입찰공고 {TRIAL_LIMIT}건까지 분석할 수 있습니다. 나라장터·아파트 공고를 합쳐 셉니다.{used.length ? ` 지금 ${used.length}건 사용, ${left}건 남았습니다.` : ""}
    </p>
  );
}

/** 무료 체험 3건을 다 쓴 뒤 새 공고를 고르면 분석 대신 보여 준다 */
export function TrialLocked({ used, onPick }: { used: TrialEntry[]; onPick: (e: TrialEntry) => void }) {
  return (
    <aside className="card min-w-0 p-6">
      <p className="font-bold">무료 체험 {TRIAL_LIMIT}건을 모두 사용했습니다</p>
      <p className="mt-2 text-sm text-ink-700">
        무료 체험은 입찰공고 {TRIAL_LIMIT}건까지 평가점수 예측·배점표 판독·낙찰 결과로 본 예측을 제공합니다.
        다른 공고를 분석하려면 요금제를 신청해 주세요.
      </p>
      {used.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-ink-500">체험으로 분석한 공고 (다시 열 수 있습니다)</p>
          <ul className="mt-2 space-y-1">
            {used.map((e) => {
              const label = e.title || e.k.replace(/^(nara|apt):/, "공고 ");
              return (
                <li key={e.k}>
                  <button type="button" onClick={() => onPick(e)} className="w-full rounded-xl bg-paper px-3 py-2 text-left text-sm font-semibold hover:bg-ink-100/60">
                    <span className="mr-1.5 text-xs font-medium text-ink-400">{e.k.startsWith("apt:") ? "아파트" : "나라장터"}</span>{label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Link href="/pricing" className="btn-primary mt-5 inline-flex">요금제 보기</Link>
      <p className="mt-3 text-xs text-ink-400">로그인 기능이 생기기 전까지 사용 건수는 이 브라우저와, 조회한 사업자번호를 기준으로 셉니다.</p>
    </aside>
  );
}
