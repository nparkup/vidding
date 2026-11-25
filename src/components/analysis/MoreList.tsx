"use client";

import { useEffect, useMemo, useState } from "react";
import { HBarList, type HBar } from "@/components/charts/HBarList";

/**
 * 입찰 분석 화면의 '상위 N곳' 목록 공용 도구: 처음엔 step개만 보이고, 이름으로 찾기와 더 보기로 나머지를 본다.
 * 순위 번호는 찾기로 거른 뒤에도 전체 목록 안의 순위를 그대로 쓴다.
 */
export function useMoreList<T>(rows: T[], name: (t: T) => string, step = 20, resetKey?: unknown) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(step);
  useEffect(() => { setLimit(step); }, [step, resetKey]);
  const t = q.replace(/\s+/g, "").toLowerCase();
  const ranked = useMemo(() => rows.map((row, i) => ({ row, rank: i + 1 })), [rows]);
  const matched = useMemo(() => (t ? ranked.filter((x) => name(x.row).replace(/\s+/g, "").toLowerCase().includes(t)) : ranked), [ranked, t, name]);
  return {
    q, setQ, searching: !!t,
    visible: matched.slice(0, limit),
    matched: matched.length,
    left: Math.max(0, matched.length - limit),
    more: () => setLimit((l) => l + step),
    step,
  };
}

/** 목록 위 이름 찾기 칸 */
export function ListFind({ id, q, setQ, placeholder, onFocus }: { id: string; q: string; setQ: (v: string) => void; placeholder: string; onFocus?: () => void }) {
  return (
    <div className="mt-3 min-w-0">
      <label className="sr-only" htmlFor={id}>{placeholder}</label>
      <input id={id} className="input py-2 text-sm" placeholder={placeholder} value={q} onFocus={onFocus} onChange={(e) => { onFocus?.(); setQ(e.target.value); }} />
    </div>
  );
}

/** 목록 아래 더 보기 버튼 (남은 수가 없으면 숨김). loading이면 불러오는 중 표시 */
export function MoreButton({ left, step, unit = "곳", onClick, loading }: { left: number; step: number; unit?: string; onClick: () => void; loading?: boolean }) {
  if (loading) return <p className="mt-3 text-center text-xs text-ink-500">목록을 불러오는 중…</p>;
  if (left <= 0) return null;
  return (
    <button type="button" onClick={onClick} className="btn-ghost btn-sm mt-3 w-full">
      더 보기 ({Math.min(step, left).toLocaleString()}{unit} 더, {left.toLocaleString()}{unit} 남음)
    </button>
  );
}

/**
 * 막대 목록(HBarList) + 이름 찾기 + 더 보기. rows는 순서대로 전부 넘기고, 처음엔 step개만 보인다.
 * numbered: 이름 앞에 전체 순위 번호를 붙인다
 */
export function MoreBars({ rows, step = 8, findId, findPlaceholder, numbered }: { rows: HBar[]; step?: number; findId: string; findPlaceholder: string; numbered?: boolean }) {
  const m = useMoreList(rows, (r) => r.label, step);
  return (
    <>
      {rows.length > step && <ListFind id={findId} q={m.q} setQ={m.setQ} placeholder={findPlaceholder} />}
      <HBarList rows={m.visible.map(({ row, rank }) => (numbered ? { ...row, label: `${rank}. ${row.label}` } : row))} />
      {m.searching && !m.matched && <p className="mt-3 text-sm text-ink-500">찾는 이름이 목록에 없습니다.</p>}
      <MoreButton left={m.left} step={m.step} onClick={m.more} />
    </>
  );
}

/** 이름·횟수 한 줄 글 (예: 개찰 1~5위에 함께 든 업체): 앞 show곳, 나머지는 펼쳐 본다 */
export function NameCountLine({ label, items, unit = "회", show = 6 }: { label: string; items: [string, number][]; unit?: string; show?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, show);
  return (
    <p className="mt-3 text-xs leading-relaxed text-ink-500">
      {label}: {shown.map(([n, c]) => `${n} ${c}${unit}`).join(", ")}
      {items.length > show && (
        <button type="button" onClick={() => setAll(!all)} className="ml-1.5 font-semibold text-mint-700 underline-offset-2 hover:underline">{all ? "접기" : `나머지 ${(items.length - show).toLocaleString()}곳 보기`}</button>
      )}
    </p>
  );
}
