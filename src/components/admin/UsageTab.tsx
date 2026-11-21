"use client";

import { useEffect, useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { bizFmt, downloadCsv, dt, type Member } from "./adminApi";
import { Stats, TrialBadge } from "./MembersTab";
import { DailyBars, lastDays, seriesOf, type HitRow } from "./Bars";
import { planName } from "@/lib/plans";

/** 마지막 활동: 무료 체험으로 공고를 연 때와 사업자번호를 넣은 조회 중 늦은 쪽 */
const lastActive = (m: Member) => Math.max(0, ...m.trial.map((t) => t.t), m.seen?.last ?? 0);

/** 회원 사용량: 무료 체험 n/한도, 분석한 공고, 사업자번호 조회 횟수, 마지막 활동 */
export function UsageTab({ call, guard, members, limit, busy, reload }: TabProps) {
  const [rows, setRows] = useState<HitRow[] | null>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<"active" | "trial" | "seen">("active");
  const days = useMemo(() => lastDays(30), []);

  useEffect(() => {
    guard(call<{ rows: HitRow[] }>("hits", { params: { days: "30", kinds: "req" } }))
      .then((r) => r && setRows(r.rows))
      .catch((e) => setErr((e as Error).message));
  }, [call, guard]);

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400_000;
    const used = members.filter((m) => m.trial.length > 0);
    const paid = members.filter((m) => m.billing?.status === "active");
    return {
      active7: members.filter((m) => lastActive(m) >= week).length,
      analyses: members.reduce((s, m) => s + m.trial.length, 0),
      used: used.length,
      full: members.filter((m) => m.trial.length >= limit).length,
      paid: paid.length,
      conv: used.length ? `${Math.round((paid.filter((m) => m.trial.length > 0).length / used.length) * 100)}%` : "-",
    };
  }, [members, limit]);

  const sorted = useMemo(() => [...members].sort((a, b) =>
    sort === "trial" ? b.trial.length - a.trial.length || lastActive(b) - lastActive(a)
      : sort === "seen" ? (b.seen?.n ?? 0) - (a.seen?.n ?? 0)
        : lastActive(b) - lastActive(a)), [members, sort]);

  function csv() {
    downloadCsv("회원사용량", ["회사명", "사업자등록번호", "체험 사용", "분석한 공고", "첫 분석", "마지막 분석", "사업자번호 조회 횟수", "마지막 활동", "결제"],
      sorted.map((m) => {
        const ts = m.trial.map((t) => t.t).sort((a, b) => a - b);
        return [m.company, bizFmt(m.bizno), `${m.trial.length}/${limit}`, m.trial.map((t) => t.k).join(" "), dt(ts[0]), dt(ts[ts.length - 1]), m.seen?.n ?? 0, dt(lastActive(m) || null), m.billing?.status === "active" ? planName(m.billing.plan) : ""];
      }));
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">회원 사용량</h1>
          <p className="mt-1 text-sm text-ink-500">무료 체험으로 분석한 공고와 사업자번호를 넣은 조회(기업 정보·유사 실적·낙찰·체험 확인)로 셉니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className="btn-ghost btn-sm" disabled={busy}>{busy ? "불러오는 중…" : "새로 불러오기"}</button>
          <button type="button" onClick={csv} className="btn-primary btn-sm" disabled={!members.length}>CSV 내려받기</button>
        </div>
      </div>

      <Stats items={[["최근 7일 활동 회원", stats.active7], ["체험 분석 공고", stats.analyses], ["체험 사용 회원", stats.used], [`${limit}건 모두 사용`, stats.full], ["결제 중", stats.paid], ["체험 후 결제 비율", stats.conv]]} />

      <div className="card mt-5 grid gap-6 p-5 md:grid-cols-2">
        {rows ? (
          <>
            <DailyBars days={days} label="무료 체험 확인 요청 (일별)" values={seriesOf(rows, days, (r) => r.kind === "req" && r.key === "trial")} />
            <DailyBars days={days} label="사업자번호 조회 (일별)" values={seriesOf(rows, days, (r) => r.kind === "req" && (r.key === "bizno" || r.key === "awards" || r.key === "perf"))} />
          </>
        ) : <p className="text-sm text-ink-400 md:col-span-2">{err || "불러오는 중…"}</p>}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-400">로그인 기능이 생기기 전이라 회원별 기록은 사업자번호 기준입니다. 조회 횟수는 지표 수집을 시작한 뒤부터 셉니다.</p>
        <select className="input w-auto shrink-0" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬">
          <option value="active">마지막 활동 순</option>
          <option value="trial">체험 사용 많은 순</option>
          <option value="seen">조회 많은 순</option>
        </select>
      </div>

      <div className="card mt-3 overflow-x-auto">
        <table className="table-x min-w-[760px]">
          <thead>
            <tr><th>회사명 · 사업자번호</th><th className="text-center">체험</th><th>분석한 공고</th><th className="text-right">조회</th><th>마지막 활동</th><th>결제</th></tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const la = lastActive(m);
              return (
                <tr key={m.bizno}>
                  <td className="leading-snug"><span className="font-semibold">{m.company}</span><span className="block text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)}</span></td>
                  <td className="text-center"><TrialBadge n={m.trial.length} limit={limit} /></td>
                  <td className="max-w-[16rem] text-xs text-ink-500">{m.trial.length ? m.trial.map((t) => t.k.replace(/^(nara|apt):/, (x) => (x === "apt:" ? "아파트 " : ""))).join(", ") : "-"}</td>
                  <td className="text-right tabular-nums">{(m.seen?.n ?? 0).toLocaleString()}</td>
                  <td className="whitespace-nowrap text-sm tabular-nums">{la ? dt(la) : <span className="text-ink-300">-</span>}</td>
                  <td className="text-sm">{m.billing?.status === "active" ? planName(m.billing.plan) : <span className="text-ink-300">-</span>}</td>
                </tr>
              );
            })}
            {!sorted.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-ink-400">아직 회원이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
