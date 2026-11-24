"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { dt, won } from "./adminApi";
import { Stats } from "./MembersTab";
import { DailyBars, lastDays, RankBars } from "./Bars";
import { dataGoKrName } from "./dataGoKrNames";

interface ApiRow { day: string; source: string; key: string; n: number; err: number }
interface AiHit { day: string; kind: string; key: string; n: number }
interface Usage { rows: ApiRow[]; ai: AiHit[]; runs: { day: string; source: string; run: string; at: string; total: number }[] }
interface Ops { quotas?: Record<string, number>; krwPerUsd?: number }
interface StorageInfo {
  measured: { bytes: number; at: string } | null;
  approved: number;
  groups: { name: string; files: number; bytes: number }[];
  folders: { prefix: string; label: string; files: number; bytes: number; truncated: boolean }[];
  at: string;
}

/** 모델별 100만 토큰당 달러 (입력, 출력, 캐시 쓰기, 캐시 읽기). 2026-11 Anthropic 정가 */
const PRICE: Record<string, [number, number, number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5, 0.125, 0.01],
  "claude-sonnet-5-5": [2, 10, 2.5, 0.1],
  "claude-opus-5-5": [4, 20, 5, 0.2],
};
const SOURCE: Record<string, string> = { worker: "중계 서버", "pages-build": "사이트 빌드", "awards-collect": "낙찰 수집", "awards-rank": "개찰 순위 수집", "awards-apt": "아파트 수집", "awards-raw": "낙찰 원자료", "awards-index": "낙찰 색인" };
const srcName = (s: string) => SOURCE[s] ?? s;
const svcOf = (key: string) => key.split("/")[0] || key;
const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)}GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)}MB` : `${Math.round(b / 1e3).toLocaleString()}KB`);
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** API 사용량: 공공데이터포털(서비스별 일일 한도 대비), Anthropic 배점표 판독 호출·비용, R2 저장 용량 */
export function ApiTab({ call, guard }: TabProps) {
  const [days, setDays] = useState(30);
  const [u, setU] = useState<Usage | null>(null);
  const [ops, setOps] = useState<Ops>({});
  const [st, setSt] = useState<StorageInfo | null>(null);
  const [err, setErr] = useState("");
  const [editQ, setEditQ] = useState<Record<string, string> | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setErr("");
    guard(call<Usage>("apiusage", { params: { days: String(days) } })).then((r) => r && setU(r)).catch((e) => setErr((e as Error).message));
    guard(call<{ ops: Ops }>("opsconfig")).then((r) => r && setOps(r.ops ?? {})).catch(() => undefined);
  }, [call, guard, days]);
  useEffect(load, [load]);
  const loadStorage = useCallback((fresh = false) => {
    guard(call<StorageInfo>("storage", { params: fresh ? { fresh: "1" } : {} })).then((r) => r && setSt(r)).catch((e) => setErr((e as Error).message));
  }, [call, guard]);
  useEffect(() => loadStorage(), [loadStorage]);

  const dayList = useMemo(() => lastDays(days), [days]);
  const rate = ops.krwPerUsd ?? 1400;

  const svc = useMemo(() => {
    const m = new Map<string, { today: number; total: number; err: number; worker: number; build: number; ops: Map<string, number> }>();
    for (const r of u?.rows ?? []) {
      const k = svcOf(r.key);
      const x = m.get(k) ?? { today: 0, total: 0, err: 0, worker: 0, build: 0, ops: new Map() };
      x.total += r.n;
      x.err += r.err;
      if (r.day === today()) { x.today += r.n; if (r.source === "worker") x.worker += r.n; else x.build += r.n; }
      x.ops.set(r.key, (x.ops.get(r.key) ?? 0) + r.n);
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => b[1].today - a[1].today || b[1].total - a[1].total);
  }, [u]);

  const ai = useMemo(() => {
    const byModel = new Map<string, { calls: number; in: number; out: number; cw: number; cr: number }>();
    const perDay = new Map<string, number>();
    const costDay = new Map<string, number>();
    let errors = 0;
    for (const h of u?.ai ?? []) {
      if (h.kind === "aierr") { errors += h.n; continue; }
      const x = byModel.get(h.key) ?? { calls: 0, in: 0, out: 0, cw: 0, cr: 0 };
      const p = PRICE[h.key];
      if (h.kind === "ai") { x.calls += h.n; perDay.set(h.day, (perDay.get(h.day) ?? 0) + h.n); }
      if (h.kind === "ai_in") x.in += h.n;
      if (h.kind === "ai_out") x.out += h.n;
      if (h.kind === "ai_cache_w") x.cw += h.n;
      if (h.kind === "ai_cache_r") x.cr += h.n;
      if (p) {
        const usd = h.kind === "ai_in" ? (h.n * p[0]) / 1e6 : h.kind === "ai_out" ? (h.n * p[1]) / 1e6 : h.kind === "ai_cache_w" ? (h.n * p[2]) / 1e6 : h.kind === "ai_cache_r" ? (h.n * p[3]) / 1e6 : 0;
        costDay.set(h.day, (costDay.get(h.day) ?? 0) + usd * rate);
      }
      byModel.set(h.key, x);
    }
    const models = [...byModel.entries()].map(([model, x]) => {
      const p = PRICE[model];
      const usd = p ? (x.in * p[0] + x.out * p[1] + x.cw * p[2] + x.cr * p[3]) / 1e6 : null;
      return { model, ...x, krw: usd === null ? null : usd * rate };
    });
    const calls = models.reduce((s, m) => s + m.calls, 0);
    const krw = models.reduce((s, m) => s + (m.krw ?? 0), 0);
    return { models, calls, krw, errors, perDay, costDay };
  }, [u, rate]);

  async function saveOps(next: Ops) {
    try {
      const r = await guard(call<{ ops: Ops }>("opsconfig", { body: next }));
      if (r) { setOps(r.ops); setNote("저장했습니다."); setEditQ(null); }
    } catch (e) { setErr((e as Error).message); }
  }

  const totalToday = svc.reduce((s, [, x]) => s + x.today, 0);
  const errTotal = svc.reduce((s, [, x]) => s + x.err, 0);
  const used = st?.measured?.bytes ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">API 사용량</h1>
          <p className="mt-1 text-sm text-ink-500">공공데이터포털 호출(중계 서버 + 사이트 빌드·낙찰 수집), 배점표 판독 모델 호출과 비용, 저장 용량.</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="기간">
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
          </select>
          <button type="button" className="btn-ghost btn-sm" onClick={load}>새로 불러오기</button>
        </div>
      </div>
      {err && <p className="mt-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p>}
      {note && <p className="mt-3 text-sm text-mint-700">{note}</p>}

      <Stats items={[
        ["오늘 공공데이터 호출", totalToday],
        [`${days}일 호출 실패`, errTotal],
        [`${days}일 판독 호출`, ai.calls],
        [`${days}일 판독 비용`, won(ai.krw)],
        ["판독 1건당", ai.calls ? won(ai.krw / ai.calls) : "-"],
        ["저장 용량", st?.measured ? `${gb(used)} / ${gb(st.approved)}` : "-"],
      ]} />

      <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">공공데이터포털</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditQ(editQ ? null : Object.fromEntries(svc.map(([k]) => [k, String(ops.quotas?.[k] ?? "")])))}>{editQ ? "한도 입력 닫기" : "일일 한도 입력"}</button>
        </div>
        <p className="mt-1 text-sm text-ink-500">서비스별 오늘(한국 시간) 호출 수입니다. 한도는 공공데이터포털 마이페이지의 활용신청별 &lsquo;일일 트래픽&rsquo;을 적어 두면 사용률을 보여 줍니다. 같은 서비스키를 쓰는 모든 호출을 합칩니다.</p>
        {u ? (
          <>
            <div className="mt-4">
              <DailyBars days={dayList} label="날짜별 호출 (전체)" values={dayList.map((d) => (u.rows ?? []).filter((r) => r.day === d).reduce((s, r) => s + r.n, 0))} unit="회" />
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="table-x min-w-[720px]">
                <thead><tr><th>서비스</th><th className="text-right">오늘</th><th className="text-right">중계 서버</th><th className="text-right">빌드·수집</th><th className="w-48">일일 한도 대비</th><th className="text-right">{days}일 합계</th><th className="text-right">실패</th></tr></thead>
                <tbody>
                  {svc.map(([k, x]) => {
                    const q = ops.quotas?.[k];
                    const pct = q ? Math.round((x.today / q) * 100) : null;
                    return (
                      <tr key={k}>
                        <td className="min-w-[13rem] max-w-[18rem]">
                          {dataGoKrName(k) && <span className="block break-keep font-semibold">{dataGoKrName(k)}</span>}
                          <span className={`block break-all ${dataGoKrName(k) ? "text-xs text-ink-500" : "font-semibold"}`}>{k}</span>
                          <span className="block break-all text-xs font-normal text-ink-400">{[...x.ops.keys()].map((o) => o.split("/")[1]).slice(0, 3).join(", ")}{x.ops.size > 3 ? ` 외 ${x.ops.size - 3}개` : ""}</span></td>
                        <td className="text-right tabular-nums">{x.today.toLocaleString()}</td>
                        <td className="text-right tabular-nums text-ink-500">{x.worker.toLocaleString()}</td>
                        <td className="text-right tabular-nums text-ink-500">{x.build.toLocaleString()}</td>
                        <td>
                          {editQ ? (
                            <input className="input py-1.5 text-right" inputMode="numeric" placeholder="예: 10000" value={editQ[k] ?? ""} onChange={(e) => setEditQ({ ...editQ, [k]: e.target.value.replace(/\D/g, "") })} aria-label={`${dataGoKrName(k) ?? k} 일일 한도`} />
                          ) : pct === null ? <span className="text-xs text-ink-300">한도 미입력</span> : (
                            <div>
                              <div className="h-2 overflow-hidden rounded-full bg-ink-50"><div className={`h-full ${pct >= 90 ? "bg-coral" : pct >= 70 ? "bg-amber" : "bg-mint"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                              <p className="mt-0.5 text-xs tabular-nums text-ink-500">{pct}% · 한도 {q!.toLocaleString()}</p>
                            </div>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{x.total.toLocaleString()}</td>
                        <td className={`text-right tabular-nums ${x.err ? "text-coral" : "text-ink-300"}`}>{x.err.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {!svc.length && <tr><td colSpan={7} className="py-8 text-center text-sm text-ink-400">아직 기록이 없습니다. 중계 서버는 이번 배포부터, 빌드·수집은 다음 실행부터 셉니다.</td></tr>}
                </tbody>
              </table>
            </div>
            {editQ && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="btn-primary btn-sm" onClick={() => saveOps({ ...ops, quotas: Object.fromEntries(Object.entries(editQ).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) })}>한도 저장</button>
                <span className="text-xs text-ink-400">개발계정은 보통 서비스마다 하루 1,000~10,000회, 운영계정은 신청한 만큼입니다.</span>
              </div>
            )}
            {u.runs.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold">빌드·수집 실행별 호출 ({u.runs.length})</summary>
                <ul className="mt-2 divide-y divide-ink-100 text-sm">
                  {u.runs.slice(0, 30).map((r) => (
                    <li key={`${r.source}-${r.run}`} className="flex justify-between gap-3 py-1.5">
                      <span>{srcName(r.source)} <span className="text-xs text-ink-400">{dt(r.at)}</span></span>
                      <span className="tabular-nums">{r.total.toLocaleString()}회</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : <p className="mt-4 text-sm text-ink-400">불러오는 중…</p>}
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-bold">배점표 판독 (Anthropic)</h2>
        <p className="mt-1 text-sm text-ink-500">공고를 고를 때 중계 서버가 부르는 배점표 판독·같은 사업 판정입니다. 같은 공고는 저장해 두어 한 번만 부릅니다. 비용은 정가 기준 추정이며 실제 청구는 Anthropic 콘솔에서 확인하세요.</p>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <DailyBars days={dayList} label="날짜별 호출" values={dayList.map((d) => ai.perDay.get(d) ?? 0)} unit="회" />
          <DailyBars days={dayList} label="날짜별 추정 비용" values={dayList.map((d) => Math.round(ai.costDay.get(d) ?? 0))} unit="원" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="table-x min-w-[640px]">
            <thead><tr><th>모델</th><th className="text-right">호출</th><th className="text-right">입력 토큰</th><th className="text-right">출력 토큰</th><th className="text-right">캐시 읽기</th><th className="text-right">추정 비용</th></tr></thead>
            <tbody>
              {ai.models.map((m) => (
                <tr key={m.model}>
                  <td className="font-semibold">{m.model}</td>
                  <td className="text-right tabular-nums">{m.calls.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{m.in.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{m.out.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{m.cr.toLocaleString()}</td>
                  <td className="text-right tabular-nums">{m.krw === null ? "단가 모름" : won(m.krw)}</td>
                </tr>
              ))}
              {!ai.models.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-ink-400">아직 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-500">환율 1달러 =</span>
          <input className="input w-24 py-1.5 text-right" inputMode="numeric" defaultValue={rate} key={rate} onBlur={(e) => { const v = Number(e.target.value.replace(/\D/g, "")); if (v && v !== rate) saveOps({ ...ops, krwPerUsd: v }); }} aria-label="환율" />
          <span className="text-ink-500">원 {ai.errors ? `· 실패 ${ai.errors}회` : ""}</span>
        </div>
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">저장 용량 (Cloudflare R2)</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={() => loadStorage(true)}>다시 재기</button>
        </div>
        {st ? (
          <>
            {st.measured ? (
              <div className="mt-3">
                <div className="h-3 overflow-hidden rounded-full bg-ink-50"><div className="h-full bg-mint" style={{ width: `${Math.min(100, (used / st.approved) * 100)}%` }} /></div>
                <p className="mt-1 text-sm tabular-nums">{gb(used)} 사용 / 승인 용량 {gb(st.approved)} ({((used / st.approved) * 100).toFixed(1)}%) <span className="text-xs text-ink-400">· 낙찰 수집이 {dt(st.measured.at)}에 잼</span></p>
              </div>
            ) : <p className="mt-3 text-sm text-ink-400">전체 사용량은 다음 낙찰 수집 실행 때부터 보입니다.</p>}
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">낙찰 저장소</p>
                <RankBars rows={st.groups.slice(0, 10).map((g) => [`${g.name} (${g.files.toLocaleString()}개)`, Math.round(g.bytes / 1e6)])} unit="MB" />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">서비스 운영 자료</p>
                <ul className="divide-y divide-ink-100 text-sm">
                  {st.folders.map((f) => (
                    <li key={f.prefix} className="flex justify-between gap-3 py-1.5">
                      <span>{f.label} <span className="text-xs text-ink-400">{f.prefix}</span></span>
                      <span className="tabular-nums">{f.files.toLocaleString()}{f.truncated ? "+" : ""}개 · {gb(f.bytes)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-400">{dt(st.at)} 기준 (1시간마다 새로 잼)</p>
          </>
        ) : <p className="mt-3 text-sm text-ink-400">불러오는 중…</p>}
      </section>
    </>
  );
}
