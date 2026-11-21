"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { bidHref } from "@/lib/links";
import { dateTime, won } from "@/lib/format";
import { KEY_FIELDS, changeSummary, type NoticeChange } from "@/lib/noticeChanges";
import { useMyBoxNos, useNoticeChanges } from "@/lib/useSiteJson";
import { useMyboxOn } from "@/lib/useMyboxOn";

type Kind = "" | "정정" | "취소";
type Scope = "all" | "key" | "mine";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 정정·취소 공고 목록 (필터는 브라우저에서) */
export function NoticeChangesList() {
  const { data, error } = useNoticeChanges();
  const mine = useMyBoxNos();
  const myboxOn = useMyboxOn();
  const [kind, setKind] = useState<Kind>("");
  const [scope, setScope] = useState<Scope>("all");
  const [biz, setBiz] = useState("");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(30);

  const list = useMemo(() => {
    const words = q.split(/\s+/).map(norm).filter(Boolean);
    return (data?.items ?? []).filter((c) =>
      (!kind || c.kind === kind)
      && (!biz || (c.bizType ?? "용역") === biz)
      && (scope !== "key" || c.kind === "취소" || c.fields.some((f) => KEY_FIELDS.includes(f.field)))
      && (scope !== "mine" || mine.has(c.no))
      && words.every((w) => norm(`${c.title} ${c.agency} ${c.demandAgency} ${c.no}`).includes(w)));
  }, [data, kind, scope, biz, q, mine]);

  if (error) return <div className="card mt-6 p-10 text-center text-ink-500">정정·취소 공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</div>;
  if (!data) return <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink-100/60" />)}</div>;

  const counts = { 정정: data.items.filter((c) => c.kind === "정정").length, 취소: data.items.filter((c) => c.kind === "취소").length };
  const btn = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`;
  return (
    <div className="mt-6">
      <div className="card grid min-w-0 grid-cols-1 gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {([["", `전체 ${data.items.length}`], ["정정", `정정 ${counts.정정}`], ["취소", `취소 ${counts.취소}`]] as [Kind, string][]).map(([k, l]) => (
            <button key={l} type="button" onClick={() => { setKind(k); setShown(30); }} className={btn(kind === k)}>{l}</button>
          ))}
          <span className="mx-1 hidden w-px bg-ink-100 sm:block" />
          {([["all", "모든 정정"], ["key", "금액·마감·자격 변경만"], ["mine", `관심공고만${mine.size ? ` (${mine.size})` : ""}`]] as [Scope, string][]).filter(([k]) => myboxOn || k !== "mine").map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setScope(k); setShown(30); }} className={btn(scope === k)}>{l}</button>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_160px]">
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(30); }} placeholder="공고명, 기관, 공고번호 검색" className="input" />
          <select value={biz} onChange={(e) => { setBiz(e.target.value); setShown(30); }} className="input">
            <option value="">업무 전체</option>
            {["용역", "공사", "물품", "외자"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-500">{list.length.toLocaleString()}건 · 갱신 {dateTime(data.builtAt)}</p>
      {scope === "mine" && mine.size === 0 && (
        <p className="mt-3 rounded-xl bg-paper p-4 text-sm text-ink-500">관심공고 서류함에 담은 공고가 없습니다. 공고 상세에서 관심공고로 담으면 정정·취소가 여기에 모입니다.</p>
      )}
      <ul className="mt-3 space-y-3">
        {list.slice(0, shown).map((c) => <ChangeCard key={`${c.no}-${c.ord}`} c={c} mine={mine.has(c.no)} />)}
      </ul>
      {list.length > shown && <button type="button" onClick={() => setShown((n) => n + 30)} className="btn-ghost mt-4 w-full">30건 더 보기</button>}
      {list.length === 0 && <p className="card mt-3 p-8 text-center text-sm text-ink-500">조건에 맞는 정정·취소 공고가 없습니다.</p>}
    </div>
  );
}

export function ChangeCard({ c, mine }: { c: NoticeChange; mine?: boolean }) {
  const title = <span className="[overflow-wrap:anywhere]">{c.title}</span>;
  return (
    <li className="min-w-0 rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip font-bold ${c.kind === "취소" ? "border-coral/30 bg-coral-100/60 text-coral" : "border-amber/40 bg-amber-100/60 text-ink"}`}>{c.kind === "취소" ? "취소" : `정정 ${Number(c.ord)}차`}</span>
        <span className="chip">{c.bizType ?? "용역"}{c.category ? ` · ${c.category}` : ""}</span>
        {mine && <span className="chip border-mint-100 bg-mint-50 text-mint-600">관심공고</span>}
        <span className="text-xs text-ink-300">게시 {dateTime(c.at)}</span>
      </div>
      <p className="mt-2 text-[16px] font-semibold leading-snug">
        {c.bidId ? <Link href={bidHref(c.bidId)} className="hover:text-mint-600">{title}</Link> : <a href={c.detailUrl} target="_blank" rel="noreferrer" className="hover:text-mint-600">{title}</a>}
      </p>
      <p className="mt-1 text-sm text-ink-500">{c.demandAgency || c.agency} · 공고번호 {c.no}-{c.ord}{c.baseAmount ? ` · ${won(c.baseAmount)}` : ""}</p>
      {c.fields.length > 0 ? (
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-3 gap-y-1.5 rounded-xl bg-paper p-3 text-sm sm:grid-cols-[110px_1fr]">
          {c.fields.map((f) => (
            <div key={f.field} className="contents">
              <dt className={`font-semibold ${KEY_FIELDS.includes(f.field) ? "text-ink" : "text-ink-500"}`}>{f.field}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]"><span className="text-ink-300 line-through">{f.before}</span> <span className="text-ink-300">→</span> <b>{f.after}</b></dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink-500">{changeSummary(c)}</p>
      )}
    </li>
  );
}
