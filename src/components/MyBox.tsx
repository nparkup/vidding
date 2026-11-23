"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bidHref } from "@/lib/links";
import { loadMyBox, MYBOX_EVENT, removeFromMyBox, updateMyBox, type MyBoxItem } from "@/lib/mybox";
import { useBids } from "@/lib/useBids";
import { changesByNo, changeSummary } from "@/lib/noticeChanges";
import { useNoticeChanges } from "@/lib/useSiteJson";

const DAY = 86400e3;
/** KST 날짜 YYYY-MM-DD */
const kday = (iso: string | number) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const hm = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(11, 16);
const dday = (iso: string) => {
  const d = Math.round((Date.parse(`${kday(iso)}T00:00:00Z`) - Date.parse(`${kday(Date.now())}T00:00:00Z`)) / DAY);
  return d < 0 ? "마감" : d === 0 ? "D-day" : `D-${d}`;
};

/** 관심공고 서류함: 담은 공고 목록(라벨·메모·서류 준비 진행), 달력, 캘린더 파일 */
export function MyBox() {
  const [items, setItems] = useState<MyBoxItem[]>([]);
  const [ready, setReady] = useState(false);
  const [label, setLabel] = useState("");
  const [view, setView] = useState<"list" | "cal">("list");
  const { bids } = useBids();
  useEffect(() => {
    const sync = () => { setItems(loadMyBox()); setReady(true); };
    sync();
    window.addEventListener(MYBOX_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(MYBOX_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  // 지금 목록의 최신 차수 (정정으로 차수가 바뀌었으면 그 공고로 연결하고 마감일도 새 값)
  const latest = useMemo(() => new Map((bids ?? []).map((b) => [b.bidNtceNo, b])), [bids]);
  const rows = useMemo(() => items.map((x) => {
    const b = latest.get(x.no);
    return { ...x, savedId: x.id, id: b?.id ?? x.id, closeAt: b?.closeAt ?? x.closeAt, openAt: b?.openAt ?? x.openAt, changed: !!b && b.id !== x.id };
  }).sort((a, b) => a.closeAt.localeCompare(b.closeAt)), [items, latest]);
  const labels = [...new Set(items.map((x) => x.label).filter(Boolean) as string[])];
  const shown = rows.filter((x) => !label || x.label === label);
  const now = Date.now();
  const open = shown.filter((x) => Date.parse(x.closeAt) >= now);
  const past = shown.filter((x) => Date.parse(x.closeAt) < now);

  if (!ready) return <div className="container-x py-10 text-sm text-ink-400">불러오는 중…</div>;
  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-ink-100 bg-white p-1">
          {(["list", "cal"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "text-ink-500"}`}>{v === "list" ? "목록" : "달력"}</button>
          ))}
        </div>
        <button type="button" onClick={() => setLabel("")} className={`chip ${!label ? "border-ink text-ink" : ""}`}>전체 {items.length}</button>
        {labels.map((l) => <button key={l} type="button" onClick={() => setLabel(l)} className={`chip ${label === l ? "border-ink text-ink" : ""}`}>{l} {items.filter((x) => x.label === l).length}</button>)}
        {items.length > 0 && <button type="button" onClick={() => downloadIcs(open)} className="btn-ghost btn-sm ml-auto">캘린더 파일(.ics) 받기</button>}
      </div>

      {!items.length && (
        <div className="card mt-6 p-6 text-sm leading-relaxed text-ink-500">
          아직 담은 공고가 없습니다. 공고 상세의 <b className="text-ink">서류함에 담기</b>를 누르면 여기에 모이고, 마감·개찰 일정을 달력으로 볼 수 있습니다.
          <Link href="/bids" className="btn-primary btn-sm mt-4 flex w-fit">공고 검색으로</Link>
        </div>
      )}

      {items.length > 0 && view === "list" && (
        <>
          <ul className="mt-5 space-y-3">{open.map((x) => <Row key={x.no} x={x} labels={labels} />)}</ul>
          {past.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold text-ink-500">마감 지난 공고 {past.length}건</summary>
              <ul className="mt-3 space-y-3 opacity-80">{past.map((x) => <Row key={x.no} x={x} labels={labels} />)}</ul>
            </details>
          )}
        </>
      )}
      {items.length > 0 && view === "cal" && <Calendar rows={shown} />}
      <p className="mt-6 text-xs text-ink-400">서류함은 이 브라우저에만 저장됩니다.<br />다른 기기에서는 따로 담아야 합니다.</p>
    </div>
  );
}

type RowT = MyBoxItem & { changed: boolean; savedId: string };

function Row({ x, labels }: { x: RowT; labels: string[] }) {
  const [memo, setMemo] = useState(x.memo ?? "");
  const d = dday(x.closeAt);
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip ${d === "D-day" || /^D-[0-3]$/.test(d) ? "border-coral/30 bg-coral-100/60 text-coral" : ""}`}>{d}</span>
        {x.label && <span className="chip border-ink-300 text-ink">{x.label}</span>}
        {x.changed && <span className="chip border-amber bg-amber-100 text-ink">차수 바뀜</span>}
        <NoticeChangeBadge no={x.no} />
      </div>
      <Link href={bidHref(x.id)} className="mt-2 block font-bold leading-snug hover:underline">{x.title}</Link>
      <p className="mt-1 text-sm text-ink-500">{x.agency} · 마감 {kday(x.closeAt)} {hm(x.closeAt)}{x.openAt ? ` · 개찰 ${kday(x.openAt)} ${hm(x.openAt)}` : ""}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
        <input list={`labels-${x.no}`} className="input py-1.5 text-sm" placeholder="라벨 (예: 준비 중)" defaultValue={x.label ?? ""} onBlur={(e) => updateMyBox(x.no, { label: e.target.value.trim() || undefined })} />
        <datalist id={`labels-${x.no}`}>{["검토 중", "준비 중", "투찰 완료", "보류", ...labels].filter((v, i, a) => a.indexOf(v) === i).map((l) => <option key={l} value={l} />)}</datalist>
        <input className="input py-1.5 text-sm" placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} onBlur={() => updateMyBox(x.no, { memo: memo.trim() || undefined })} />
        <button type="button" onClick={() => removeFromMyBox(x.no)} className="text-sm text-ink-400 hover:text-coral">빼기</button>
      </div>
    </li>
  );
}

function Calendar({ rows }: { rows: RowT[] }) {
  const [month, setMonth] = useState(() => kday(Date.now()).slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * DAY);
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY).toISOString().slice(0, 10));
  const ev = new Map<string, { kind: "마감" | "개찰"; x: RowT }[]>();
  for (const x of rows) {
    (ev.get(kday(x.closeAt)) ?? ev.set(kday(x.closeAt), []).get(kday(x.closeAt))!).push({ kind: "마감", x });
    if (x.openAt) (ev.get(kday(x.openAt)) ?? ev.set(kday(x.openAt), []).get(kday(x.openAt))!).push({ kind: "개찰", x });
  }
  const move = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const today = kday(Date.now());
  return (
    <div className="card mt-5 p-3 sm:p-5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className="btn-ghost btn-sm">이전 달</button>
        <p className="font-bold">{y}년 {m}월</p>
        <button type="button" onClick={() => move(1)} className="btn-ghost btn-sm">다음 달</button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-ink-100 bg-ink-100 text-xs">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d} className="bg-paper py-1 text-center font-semibold text-ink-500">{d}</div>)}
        {days.map((d) => (
          <div key={d} className={`min-h-[64px] min-w-0 bg-white p-1 sm:min-h-[88px] ${d.slice(0, 7) !== month ? "opacity-40" : ""}`}>
            <p className={`tabular-nums ${d === today ? "font-extrabold text-mint-700" : "text-ink-500"}`}>{Number(d.slice(8))}</p>
            {(ev.get(d) ?? []).slice(0, 3).map(({ kind, x }) => (
              <Link key={kind + x.no} href={bidHref(x.id)} title={`${kind} ${x.title}`} className={`mt-0.5 block truncate rounded px-1 ${kind === "마감" ? "bg-coral-100 text-ink" : "bg-mint-50 text-mint-700"}`}>
                {kind} <span className="hidden sm:inline">{x.title}</span>
              </Link>
            ))}
            {(ev.get(d)?.length ?? 0) > 3 && <p className="text-ink-400">외 {ev.get(d)!.length - 3}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 마감·개찰 일정을 캘린더 파일(.ics)로 내려받는다 (휴대폰·아웃룩·구글 캘린더에서 열 수 있다) */
function downloadIcs(rows: RowT[]) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, " ");
  const ev = rows.flatMap((x) => [
    ["마감", x.closeAt] as const,
    ...(x.openAt ? [["개찰", x.openAt] as const] : []),
  ].map(([k, at]) => ["BEGIN:VEVENT", `UID:${x.no}-${k === "마감" ? "close" : "open"}@bidmate`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(at)}`, `DTEND:${stamp(new Date(Date.parse(at) + 30 * 60e3).toISOString())}`, `SUMMARY:${esc(`[입찰 ${k}] ${x.title}`)}`, `DESCRIPTION:${esc(x.agency)}`, "END:VEVENT"].join("\r\n")));
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bidmate//mybox//KO", ...ev, "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = "관심공고-일정.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 최근 14일 정정·취소가 있으면 배지 (최신 차수 기준, 바뀐 항목은 툴팁) */
function NoticeChangeBadge({ no }: { no: string }) {
  const { data } = useNoticeChanges();
  const byNo = useMemo(() => changesByNo(data?.items ?? []), [data]);
  const c = byNo.get(no)?.[0];
  if (!c) return null;
  return (
    <Link href="/changes" title={changeSummary(c)} className={`chip font-bold ${c.kind === "취소" ? "border-coral/30 bg-coral-100/60 text-coral" : "border-amber/40 bg-amber-100/60 text-ink"}`}>
      {c.kind === "취소" ? "취소됨" : `정정 ${Number(c.ord)}차${c.fields.length ? ` · ${c.fields.slice(0, 2).map((f) => f.field).join("·")}` : ""}`}
    </Link>
  );
}
