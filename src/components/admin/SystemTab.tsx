"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { dt } from "./adminApi";
import { Stats } from "./MembersTab";
import { DailyBars, lastDays, RankBars, seriesOf, totalsOf, type HitRow } from "./Bars";

interface LogRow { ts: number; route: string; status: number; ms: number; ip: string; country: string; msg: string }
interface AuditRow { ts: number; action: string; detail: string; ip: string }
interface Run { id: number; name: string; title: string; event: string; status: string; conclusion: string | null; branch: string; url: string; created: string; updated: string; started: string }

const ROUTE: Record<string, string> = {
  bizno: "기업 정보 조회", perf: "유사 실적 조회", ntce: "공고 분류 조회", awards: "낙찰 이력", awardmeta: "낙찰 저장소 상태", aisheet: "배점표 판독", relate: "같은 사업 판정",
  trial: "무료 체험 확인", signup: "회원가입", pv: "페이지 조회 신호", config: "사이트 설정 읽기", presence: "이용자 수(사용 안 함)", other: "기타",
};
const routeName = (r: string) => (r.startsWith("admin:") ? `관리자 ${r.slice(6)}` : ROUTE[r] ?? r);
const AUDIT: Record<string, string> = { login: "로그인", "login-fail": "로그인 실패", "member-edit": "회원 수정", "member-delete": "탈퇴 처리", "withdraw-cancel": "탈퇴 예약 취소", "trial-reset": "체험 초기화", "member-limit": "이용 한도", "usage-reset": "이용권 사용 초기화", billing: "결제 기록", settings: "페이지 설정", opsconfig: "API 한도·환율", "login-locked": "잠긴 상태 로그인 시도", "totp-on": "2단계 인증 켬", "totp-off": "2단계 인증 끔", "password-temp": "임시 비밀번호", "member-create": "회원 등록" };
const EVENT: Record<string, string> = { push: "머지", schedule: "예약", workflow_dispatch: "수동", pull_request: "PR 검사" };
const SUB = [["incident", "장애"], ["traffic", "트래픽"], ["access", "접속·로그"]] as const;
type Sub = (typeof SUB)[number][0];

/** 시스템 정보: 장애(배포·수집 실패, 중계 서버 오류), 트래픽(요청·페이지 조회), 접속 정보(관리자 로그인, 최근 요청 기록) */
export function SystemTab({ call, guard }: TabProps) {
  const [sub, setSub] = useState<Sub>("incident");
  const [hits, setHits] = useState<HitRow[] | null>(null);
  const [errs, setErrs] = useState<LogRow[] | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [runs, setRuns] = useState<{ runs: Run[]; authed: boolean; at: string } | null>(null);
  const [runErr, setRunErr] = useState("");
  const [err, setErr] = useState("");
  const days = useMemo(() => lastDays(30), []);

  const load = useCallback(() => {
    setErr("");
    const fail = (e: unknown) => setErr((e as Error).message);
    guard(call<{ rows: HitRow[] }>("hits", { params: { days: "30", kinds: "req,status,ms,pv,uv,ref,country,device" } })).then((r) => r && setHits(r.rows)).catch(fail);
    guard(call<{ rows: LogRow[] }>("logs", { params: { errors: "1", limit: "200" } })).then((r) => r && setErrs(r.rows)).catch(fail);
    guard(call<{ rows: LogRow[] }>("logs", { params: { limit: "500" } })).then((r) => r && setLogs(r.rows)).catch(fail);
    guard(call<{ rows: AuditRow[] }>("audit")).then((r) => r && setAudit(r.rows)).catch(fail);
    setRunErr("");
    guard(call<{ runs: Run[]; authed: boolean; at: string }>("actions")).then((r) => r && setRuns(r)).catch((e) => setRunErr((e as Error).message));
  }, [call, guard]);
  useEffect(load, [load]);

  const week = Date.now() - 7 * 86400_000;
  const failedRuns = (runs?.runs ?? []).filter((r) => r.conclusion === "failure" || r.conclusion === "timed_out");
  const todayKey = days[days.length - 1];
  const reqToday = (hits ?? []).filter((h) => h.kind === "req" && h.day === todayKey).reduce((s, h) => s + h.n, 0);
  const err5 = (hits ?? []).filter((h) => h.kind === "status" && h.key.endsWith(":5xx")).reduce((s, h) => s + h.n, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">시스템 정보</h1>
          <p className="mt-1 text-sm text-ink-500">배포·수집 실행, 중계 서버 오류, 요청·페이지 조회, 관리자 접속 기록. IP는 앞 세 자리만 남깁니다.</p>
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={load}>새로 불러오기</button>
      </div>
      {err && <p className="mt-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p>}

      <Stats items={[
        ["최근 7일 실행 실패", failedRuns.filter((r) => new Date(r.created).getTime() >= week).length],
        ["진행 중 실행", (runs?.runs ?? []).filter((r) => r.status !== "completed").length],
        ["30일 서버 오류(5xx)", err5],
        ["오늘 서버 요청", reqToday],
        ["오늘 페이지 조회", seriesOf(hits ?? [], [todayKey], (h) => h.kind === "pv")[0]],
        ["오늘 방문 브라우저", seriesOf(hits ?? [], [todayKey], (h) => h.kind === "uv")[0]],
      ]} />

      <div className="mt-5 flex gap-2" role="tablist">
        {SUB.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${sub === k ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500"}`}>{l}</button>
        ))}
      </div>

      {sub === "incident" && (
        <>
          <section className="card mt-4 p-5 sm:p-6">
            <h2 className="text-lg font-bold">배포·수집 실행 (GitHub Actions)</h2>
            {runErr && <p className="mt-2 rounded-xl bg-amber-100/60 p-3 text-sm">{runErr}</p>}
            {runs ? (
              <>
                <ul className="mt-3 divide-y divide-ink-100">
                  {runs.runs.slice(0, 30).map((r) => {
                    const bad = r.conclusion === "failure" || r.conclusion === "timed_out";
                    const label = r.status !== "completed" ? "진행 중" : r.conclusion === "success" ? "성공" : r.conclusion === "cancelled" ? "취소" : r.conclusion === "skipped" ? "건너뜀" : bad ? "실패" : r.conclusion ?? "";
                    return (
                      <li key={r.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline [overflow-wrap:anywhere]">{r.name}</a>
                          <p className="truncate text-xs text-ink-400" title={r.title}>{EVENT[r.event] ?? r.event} · {r.branch} · {r.title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-sm">
                          <span className="text-xs tabular-nums text-ink-400">{dt(r.started || r.created)}</span>
                          <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${bad ? "bg-coral-100 text-coral" : r.conclusion === "success" ? "bg-mint-50 text-mint-700" : "bg-ink-50 text-ink-500"}`}>{label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-ink-400">{dt(runs.at)} 기준 · {runs.authed ? "읽기 토큰 사용" : "공개 API(시간당 60회)로 읽음"}</p>
              </>
            ) : !runErr && <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
          </section>

          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="text-lg font-bold">중계 서버 오류</h2>
            <p className="mt-1 text-sm text-ink-500">응답 500번대이거나 처리 중 예외가 난 요청 (최근 30일, 200건까지).</p>
            <LogTable rows={errs} empty="오류가 없습니다." showMsg />
          </section>
        </>
      )}

      {sub === "traffic" && (
        <>
          <section className="card mt-4 grid gap-6 p-5 sm:p-6 md:grid-cols-3">
            {hits ? (
              <>
                <DailyBars days={days} label="중계 서버 요청" values={seriesOf(hits, days, (h) => h.kind === "req" && h.key !== "pv")} />
                <DailyBars days={days} label="페이지 조회" values={seriesOf(hits, days, (h) => h.kind === "pv")} />
                <DailyBars days={days} label="방문 브라우저" values={seriesOf(hits, days, (h) => h.kind === "uv")} />
              </>
            ) : <p className="text-sm text-ink-400">불러오는 중…</p>}
          </section>
          {hits && (
            <>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <section className="card p-5"><h2 className="mb-3 font-bold">많이 본 화면 (30일)</h2><RankBars rows={totalsOf(hits, (h) => h.kind === "pv").slice(0, 15)} /></section>
                <section className="card p-5"><h2 className="mb-3 font-bold">유입 사이트</h2><RankBars rows={totalsOf(hits, (h) => h.kind === "ref").slice(0, 12)} /></section>
                <section className="card p-5"><h2 className="mb-3 font-bold">기기</h2><RankBars rows={totalsOf(hits, (h) => h.kind === "device")} /></section>
                <section className="card p-5"><h2 className="mb-3 font-bold">나라</h2><RankBars rows={totalsOf(hits, (h) => h.kind === "country").slice(0, 10)} /></section>
              </div>
              <section className="card mt-5 p-5 sm:p-6">
                <h2 className="text-lg font-bold">중계 서버 기능별 요청 (30일)</h2>
                <RouteTable hits={hits} />
              </section>
            </>
          )}
          <p className="mt-3 text-xs text-ink-400">페이지 조회는 화면을 옮길 때마다 경로만 보내고, 방문 브라우저는 그날만 쓰는 값으로 섞은 해시로 셉니다(다른 날과 이어지지 않음). 검색 로봇은 세지 않습니다.</p>
        </>
      )}

      {sub === "access" && (
        <>
          <section className="card mt-4 p-5 sm:p-6">
            <h2 className="text-lg font-bold">관리자 접속·변경 기록</h2>
            {audit ? (
              <ul className="mt-3 divide-y divide-ink-100 text-sm">
                {audit.slice(0, 100).map((a, i) => (
                  <li key={`${a.ts}-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 py-1.5 sm:grid-cols-[10rem_7rem_minmax(0,1fr)_7rem]">
                    <span className="tabular-nums text-ink-500">{dt(a.ts)}</span>
                    <span className={`font-semibold ${a.action === "login-fail" ? "text-coral" : ""}`}>{AUDIT[a.action] ?? a.action}</span>
                    <span className="col-span-2 text-ink-500 [overflow-wrap:anywhere] sm:col-span-1">{a.detail}</span>
                    <span className="col-span-2 text-xs tabular-nums text-ink-400 sm:col-span-1 sm:text-right">{a.ip}</span>
                  </li>
                ))}
                {!audit.length && <li className="py-6 text-center text-ink-400">기록이 없습니다.</li>}
              </ul>
            ) : <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
          </section>
          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="text-lg font-bold">최근 요청 기록</h2>
            <p className="mt-1 text-sm text-ink-500">중계 서버가 받은 요청 500건 (페이지 조회 신호 제외). 30일 또는 3,000건이 지나면 지웁니다.</p>
            <LogTable rows={logs} empty="기록이 없습니다." filter />
          </section>
        </>
      )}
    </>
  );
}

function RouteTable({ hits }: { hits: HitRow[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { n: number; ms: number; e4: number; e5: number }>();
    for (const h of hits) {
      if (h.kind === "req" || h.kind === "ms") {
        const x = m.get(h.key) ?? { n: 0, ms: 0, e4: 0, e5: 0 };
        if (h.kind === "req") x.n += h.n; else x.ms += h.n;
        m.set(h.key, x);
      } else if (h.kind === "status") {
        const [route, cls] = [h.key.slice(0, h.key.lastIndexOf(":")), h.key.slice(h.key.lastIndexOf(":") + 1)];
        const x = m.get(route) ?? { n: 0, ms: 0, e4: 0, e5: 0 };
        if (cls === "4xx") x.e4 += h.n;
        if (cls === "5xx") x.e5 += h.n;
        m.set(route, x);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [hits]);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="table-x min-w-[560px]">
        <thead><tr><th>기능</th><th className="text-right">요청</th><th className="text-right">평균 처리</th><th className="text-right">4xx</th><th className="text-right">5xx</th></tr></thead>
        <tbody>
          {rows.map(([k, x]) => (
            <tr key={k}>
              <td>{routeName(k)}</td>
              <td className="text-right tabular-nums">{x.n.toLocaleString()}</td>
              <td className="text-right tabular-nums">{x.n ? `${Math.round(x.ms / x.n).toLocaleString()}ms` : "-"}</td>
              <td className="text-right tabular-nums text-ink-500">{x.e4.toLocaleString()}</td>
              <td className={`text-right tabular-nums ${x.e5 ? "text-coral" : "text-ink-300"}`}>{x.e5.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogTable({ rows, empty, showMsg, filter }: { rows: LogRow[] | null; empty: string; showMsg?: boolean; filter?: boolean }) {
  const [q, setQ] = useState("");
  const [onlyErr, setOnlyErr] = useState(false);
  if (!rows) return <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>;
  const shown = rows.filter((r) => (!onlyErr || r.status >= 400) && (!q || `${r.route} ${routeName(r.route)} ${r.status} ${r.ip} ${r.country}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      {filter && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input className="input sm:max-w-xs" placeholder="기능·상태·IP·나라" value={q} onChange={(e) => setQ(e.target.value)} aria-label="요청 기록 검색" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} />400번대 이상만</label>
        </div>
      )}
      <div className="mt-3 max-h-[32rem] overflow-auto">
        <table className="table-x min-w-[640px]">
          <thead className="sticky top-0 bg-white"><tr><th>시각</th><th>기능</th><th className="text-right">상태</th><th className="text-right">처리</th><th>나라</th><th>IP</th>{showMsg && <th>내용</th>}</tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.ts}-${i}`}>
                <td className="whitespace-nowrap tabular-nums text-ink-500">{dt(r.ts)}</td>
                <td>{routeName(r.route)}</td>
                <td className={`text-right tabular-nums ${r.status >= 500 ? "font-bold text-coral" : r.status >= 400 ? "text-amber" : ""}`}>{r.status}</td>
                <td className="text-right tabular-nums">{r.ms}ms</td>
                <td>{r.country}</td>
                <td className="tabular-nums text-ink-500">{r.ip}</td>
                {showMsg && <td className="max-w-[20rem] text-xs text-ink-500 [overflow-wrap:anywhere]">{r.msg}</td>}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={showMsg ? 7 : 6} className="py-8 text-center text-sm text-ink-400">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
