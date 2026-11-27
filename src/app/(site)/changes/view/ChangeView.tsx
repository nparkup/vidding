"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { dateTime, won } from "@/lib/format";
import { KEY_FIELDS, changeLabel, changeNo, changeSource, changeSummary, type ChangeSource, type NoticeChange } from "@/lib/noticeChanges";
import { useNoticeChanges } from "@/lib/useSiteJson";
import { BidViewFallback } from "../../bids/view/BidView";
import { changeHref, liveHref } from "@/components/NoticeChangesList";

const ORIGIN: Record<ChangeSource, string> = { 나라장터: "나라장터 원문 보기", 누리장터: "누리장터 원문 보기", 공동주택: "K-apt 원문 보기" };

/**
 * /changes/view?src=출처&no=공고번호&ord=차수 : 정정·취소 공고 한 건.
 * 진행 중인 공고는 목록에서 바로 공고 상세로 가고, 이 화면은 취소됐거나 마감된 공고처럼 공고 상세가 없는 정정·취소를 보여 준다.
 */
export function ChangeView() {
  const sp = useSearchParams();
  const src = (sp.get("src") ?? "나라장터") as ChangeSource;
  const no = sp.get("no") ?? "";
  const ord = sp.get("ord") ?? "";
  const { data, error } = useNoticeChanges();
  const history = (data?.items ?? []).filter((c) => c.no === no && changeSource(c) === src).sort((a, b) => b.at.localeCompare(a.at));
  const c = history.find((x) => x.ord === ord) ?? history[0];

  useEffect(() => {
    if (c) document.title = `${c.title} ${changeLabel(c)} | 비드매트릭스`;
  }, [c]);

  if (error) return <Message text="정정·취소 공고를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." />;
  if (!data) return <BidViewFallback />;
  if (!c) return <Message text={`최근 ${data.days}일 동안의 정정·취소 내역에 없는 공고입니다.`} />;

  const live = liveHref(c);
  const cells: [string, ReactNode][] = [
    ["출처", changeSource(c)],
    ["공고번호", changeNo(c)],
    ...(c.prevOrd ? [[c.source === "공동주택" ? "비교한 앞선 공고" : "비교한 이전 차수", c.source === "공동주택" ? c.prevOrd : `${c.no}-${c.prevOrd}`] as [string, ReactNode]] : []),
    [c.detected ? "변경 확인" : "게시", dateTime(c.at)],
    ...(c.closeAt ? [["입찰 마감", dateTime(c.closeAt)] as [string, ReactNode]] : []),
    ...(c.baseAmount ? [["금액", <span key="a" className="tabular-nums">{won(c.baseAmount)}</span>] as [string, ReactNode]] : []),
    ["업무", `${c.bizType ?? "용역"}${c.category && String(c.category) !== c.bizType ? ` · ${c.category}` : ""}`],
    [c.source === "공동주택" ? "단지" : "기관", c.demandAgency || c.agency],
  ];

  return (
    <div className="container-x py-6 sm:py-8">
      <Link href="/changes" className="text-sm font-semibold text-ink-500 hover:text-ink">정정·취소 공고 목록</Link>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className={`chip font-bold ${c.kind === "취소" ? "border-coral/30 bg-coral-100/60 text-coral" : "border-amber/40 bg-amber-100/60 text-ink"}`}>{changeLabel(c)}</span>
        <span className="chip">{changeSource(c)}</span>
      </div>
      <h1 className="mt-3 text-2xl font-extrabold leading-snug tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-3xl">{c.title}</h1>
      <p className="mt-2 text-ink-500">{c.demandAgency || c.agency}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {live && <Link href={live} className="btn-primary">진행 중인 공고 상세 보기</Link>}
        {c.detailUrl && <a href={c.detailUrl} target="_blank" rel="noreferrer" className="btn-ghost">{ORIGIN[changeSource(c)]}</a>}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="text-lg font-bold">{c.kind === "취소" ? "취소 내용" : "바뀐 항목"}</h2>
        {c.kind === "취소" ? (
          <p className="mt-2 text-ink-500">이 공고는 취소되었습니다. 다시 공고되면 새 공고로 올라옵니다.</p>
        ) : c.fields.length ? (
          <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
            {c.fields.map((f) => (
              <div key={f.field} className="contents">
                <dt className={`font-semibold ${KEY_FIELDS.includes(f.field) ? "text-ink" : "text-ink-500"}`}>{f.field}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]"><span className="text-ink-300 line-through">{f.before}</span> <span className="text-ink-300">→</span> <b>{f.after}</b></dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-ink-500">{changeSummary(c)}</p>
        )}
      </section>

      <section className="card mt-4 p-5">
        <h2 className="text-lg font-bold">공고 정보</h2>
        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
          {cells.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-500">{k}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {history.length > 1 && (
        <section className="card mt-4 p-5">
          <h2 className="text-lg font-bold">최근 {data.days}일 정정·취소 {history.length}건</h2>
          <ul className="mt-3 divide-y divide-ink-100 text-sm">
            {history.map((h: NoticeChange) => (
              <li key={`${h.no}-${h.ord}-${h.at}`} className="py-2.5">
                <Link href={changeHref(h)} className={`flex flex-wrap items-baseline gap-x-2 hover:text-mint-600 ${h === c ? "font-bold" : ""}`}>
                  <span>{changeLabel(h)}</span>
                  <span className="text-ink-300">{dateTime(h.at)}</span>
                </Link>
                <p className="mt-0.5 text-ink-500 [overflow-wrap:anywhere]">{changeSummary(h)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="container-x py-20 text-center">
      <p className="text-3xl font-extrabold tracking-tight">공고를 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">{text}</p>
      <Link href="/changes" className="btn-primary mt-8">정정·취소 공고 목록으로</Link>
    </div>
  );
}
