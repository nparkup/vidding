"use client";

import { useEffect, useMemo, useState } from "react";
import { won } from "@/lib/format";
import {
  CHUNK_CONCURRENCY, CHUNK_WEEKS, NTCE_BATCH, PERF_YEARS, chunk, judgeSimilarity, perfBizOf, perfWindows, spanOf,
  type NtceClass, type PerfChunk, type PerfWin, type SimLevel,
} from "@/lib/perfLookup";
import type { Bid } from "@/lib/types";

/** 분류를 조회할 낙찰 건 수 상한. 넘는 건은 공고명 키워드로만 판정한다 */
const MAX_CLASSIFY = 60;

export interface PerfSummary { amount: number; count: number }

interface Row extends PerfWin { cls?: NtceClass; level: SimLevel | null; why: string }

const LEVEL_STYLE: Record<SimLevel, string> = {
  동일: "bg-mint-50 text-mint-700",
  유사: "bg-ink-100 text-ink",
  키워드: "bg-paper text-ink-500",
};

/**
 * 사업자번호를 조회하면 그때만 나라장터 낙찰 이력(최근 3년, 공고 업무구분 하나)을 7일 단위로 나눠 동시에 가져오고,
 * 선택 공고와 세부품명 → 중분류 → 공고명 키워드 순으로 비교해 유사 실적을 고른다. 사용자가 행마다 인정 여부를 바꿀 수 있다.
 */
export function PerfLookup({ api, bid, bizno, since, sheetYears, onChange }: {
  api: string;
  bid: Bid;
  bizno: string;
  /** 조달업체 등록일: 이 전 주는 조회하지 않는다 */
  since?: string;
  /** 평가표에 적힌 실적 인정 기간(년) */
  sheetYears?: number;
  onChange: (s: PerfSummary) => void;
}) {
  const biz = perfBizOf(bid.bizType);
  const years = Math.min(PERF_YEARS, sheetYears ?? PERF_YEARS);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<"wins" | "classes" | "done" | "error">("wins");
  const [rows, setRows] = useState<Row[]>([]);
  const [failed, setFailed] = useState(0);
  const [err, setErr] = useState("");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [on, setOn] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // 공고·번호가 바뀌거나 화면을 떠나면 남은 요청을 끊는다 (공공데이터포털 초당 요청제한을 아끼려고)
    const ac = new AbortController();
    const groups = chunk(perfWindows(since, years), CHUNK_WEEKS);
    setDone(0);
    setTotal(groups.length);
    setPhase("wins");
    setRows([]);
    setFailed(0);
    setErr("");
    setOff(new Set());
    setOn(new Set());

    (async () => {
      let miss = 0;
      const chunks = await pool(groups, CHUNK_CONCURRENCY, async (g) => {
        if (ac.signal.aborted) return [] as PerfWin[];
        const { from, to } = spanOf(g);
        try {
          const r = await fetch(`${api}?${new URLSearchParams({ perf: biz, bizno, from, to })}`, { signal: ac.signal });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          const c = j as PerfChunk;
          miss += c.failed;
          return c.wins;
        } catch {
          miss += g.length;
          return [] as PerfWin[];
        } finally {
          if (alive) setDone((d) => d + 1);
        }
      });
      if (!alive) return;
      const wins = chunks.flat().sort((a, b) => b.date.localeCompare(a.date));
      setFailed(miss);
      // 절반 넘게 못 불러왔으면 결과를 믿기 어렵다: 실적으로 쓰지 않고 다시 조회하게 한다 (공공데이터포털 초당 요청제한에 걸린 경우가 대부분)
      const weeks = groups.reduce((n, g) => n + g.length, 0);
      if (miss * 2 > weeks) {
        setPhase("error");
        setErr(`나라장터 낙찰 이력 ${weeks}주 중 ${miss}주를 불러오지 못했습니다. 공공데이터포털 요청이 몰린 상태일 수 있으니 잠시 후 다시 조회해 주세요.`);
        return;
      }

      // 선택 공고와 낙찰 건의 분류(세부품명·중분류)를 공고번호로 조회한다
      setPhase("classes");
      const nos = [bid.bidNtceNo, ...new Set(wins.map((w) => w.bidNtceNo))].slice(0, MAX_CLASSIFY + 1);
      const classes = new Map<string, NtceClass>();
      await Promise.all(chunk(nos, NTCE_BATCH).map(async (g) => {
        try {
          const r = await fetch(`${api}?${new URLSearchParams({ ntce: g.join(","), biz })}`, { signal: ac.signal });
          if (!r.ok) return;
          for (const c of (await r.json()) as NtceClass[]) classes.set(c.bidNtceNo, c);
        } catch {
          // 분류를 못 받으면 공고명 키워드로 판정한다
        }
      }));
      if (!alive) return;
      const target = { title: bid.title, cls: classes.get(bid.bidNtceNo) };
      setRows(wins
        .filter((w) => w.bidNtceNo !== bid.bidNtceNo)
        .map((w) => {
          const cls = classes.get(w.bidNtceNo);
          return { ...w, cls, ...judgeSimilarity(target, { title: w.title, cls }) };
        }));
      setPhase("done");
    })();
    return () => { alive = false; ac.abort(); };
  }, [api, bid.bidNtceNo, bid.title, biz, bizno, since, years, attempt]);

  const keyOf = (r: Row) => `${r.bidNtceNo}-${r.bidNtceOrd}-${r.date}-${r.amount}`;
  const included = (r: Row) => (r.level ? !off.has(keyOf(r)) : on.has(keyOf(r)));
  const summary = useMemo<PerfSummary>(() => {
    const inc = rows.filter(included);
    return { amount: inc.reduce((n, r) => n + r.amount, 0), count: inc.length };
  }, [rows, off, on]);
  useEffect(() => { onChange(phase === "done" ? summary : { amount: 0, count: 0 }); }, [summary, phase, onChange]);

  const toggle = (r: Row) => {
    const k = keyOf(r);
    const flip = (s: Set<string>) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
    if (r.level) setOff(flip); else setOn(flip);
  };

  const similar = rows.filter((r) => r.level);
  const others = rows.filter((r) => !r.level);
  const [showOthers, setShowOthers] = useState(false);

  return (
    <div className="mt-3 min-w-0 rounded-2xl border border-ink-100 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">나라장터 유사 실적 (최근 {years}년 {biz} 낙찰)</p>
        {phase === "done" && <p className="tabular-nums text-ink-500">인정 {summary.count}건 · {won(summary.amount)} <span className="text-ink-300">추정</span></p>}
      </div>

      {(phase === "wins" || phase === "classes") && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${phase === "classes" ? 100 : total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            {phase === "wins" ? `낙찰 이력 조회 중 ${done}/${total}구간 (7일 단위로 나눠 조회합니다)` : "낙찰 건의 세부품명·중분류를 확인하는 중"}
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-coral">{err}</p>
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setAttempt((n) => n + 1)}>다시 조회</button>
        </div>
      )}

      {phase === "done" && (
        <>
          {rows.length === 0 ? (
            <p className="mt-2 text-xs text-ink-500">최근 {years}년 나라장터 {biz} 낙찰 이력이 없습니다. 수의계약·민간 실적은 아래 직접 입력칸에 넣어 주세요.</p>
          ) : (
            <>
              <p className="mt-2 text-xs text-ink-500">
                낙찰 {rows.length}건 중 유사 {similar.length}건을 찾았습니다. 세부품명이 같으면 동일, 중분류가 같으면 유사, 공고명 핵심 낱말이 겹치면 키워드로 표시합니다. 체크를 바꿔 인정 여부를 조정할 수 있습니다.
              </p>
              {similar.length > 0 && <WinList rows={similar} included={included} toggle={toggle} />}
              {others.length > 0 && (
                <button type="button" className="mt-2 text-xs font-semibold text-ink-500 underline-offset-2 hover:underline" onClick={() => setShowOthers((v) => !v)}>
                  {showOthers ? "유사하지 않은 낙찰 접기" : `유사하지 않은 낙찰 ${others.length}건 보기`}
                </button>
              )}
              {showOthers && <WinList rows={others} included={included} toggle={toggle} />}
            </>
          )}
          <ul className="mt-3 space-y-0.5 text-xs text-ink-300">
            {sheetYears && sheetYears > PERF_YEARS && <li>평가표는 최근 {sheetYears}년 실적을 인정하지만, 자동 조회는 최근 {PERF_YEARS}년까지만 합니다. 그 이전 실적은 직접 입력해 주세요.</li>}
            <li>낙찰금액 기준 추정치입니다. 변경계약·공동수급 지분은 반영되지 않으니 실적증명서로 확인해 주세요.</li>
            {failed > 0 && <li className="text-coral">일부 기간({failed}주)을 불러오지 못해 실제보다 적게 잡혔을 수 있습니다.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    while (next < xs.length) { const i = next++; out[i] = await fn(xs[i]); }
  }));
  return out;
}

function WinList({ rows, included, toggle }: { rows: Row[]; included: (r: Row) => boolean; toggle: (r: Row) => void }) {
  return (
    <ul className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-xl bg-paper">
      {rows.map((r) => (
        <li key={`${r.bidNtceNo}-${r.bidNtceOrd}-${r.date}-${r.amount}`}>
          <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
            <input type="checkbox" className="mt-1 shrink-0" checked={included(r)} onChange={() => toggle(r)} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 font-semibold">{r.title}</span>
              <span className="block text-xs text-ink-500">{r.date} · {r.agency} · {r.why}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block tabular-nums">{won(r.amount)}</span>
              {r.level && <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[r.level]}`}>{r.level}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
