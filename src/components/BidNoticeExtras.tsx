"use client";

import Link from "next/link";
import { bidSheet, basisKind, usableLwlt } from "@/lib/criteria";
import { perfMultiple } from "@/lib/criteria";
import type { BidQual } from "@/lib/eligibility";
import { dateTime } from "@/lib/format";
import { changesByNo, type NoticeChange } from "@/lib/noticeChanges";
import type { NoticeCriteria } from "@/lib/noticeCriteria";
import { rateRowFor } from "@/lib/rateTable";
import type { Bid } from "@/lib/types";
import { useNoticeChanges, useRateTable } from "@/lib/useSiteJson";

const pct = (n?: number) => (n === undefined ? "-" : `${n.toFixed(3).replace(/\.?0+$/, "")}%`);

/** 공고 상세 상단: 이 공고가 정정공고면 바로 앞 차수와 달라진 항목 */
export function BidChangeBanner({ bid }: { bid: Bid }) {
  const { data } = useNoticeChanges();
  const list = data ? changesByNo(data.items).get(bid.bidNtceNo) ?? [] : [];
  if (!list.length && !bid.amend) return null;
  const latest: NoticeChange | undefined = list[0];
  return (
    <section className="mt-6 rounded-2xl border border-amber/40 bg-amber-100/50 p-4 sm:p-5">
      <p className="text-sm font-bold">정정공고 {Number(bid.bidNtceOrd)}차{latest ? ` · 게시 ${dateTime(latest.at)}` : ""}</p>
      {latest?.fields.length ? (
        <dl className="mt-2 grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[110px_1fr]">
          {latest.fields.map((f) => (
            <div key={f.field} className="contents">
              <dt className="font-semibold">{f.field}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]"><span className="text-ink-500 line-through">{f.before}</span> <span className="text-ink-300">→</span> <b>{f.after}</b></dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-ink-500">공고 목록 항목(금액·일정·자격)은 그대로이고 공고서 내용이 정정되었습니다. 첨부파일의 정정 내용을 확인해 주세요.</p>
      )}
      {list.length > 1 && <p className="mt-2 text-xs text-ink-500">최근 14일 동안 {list.length}번 정정되었습니다.</p>}
      <Link href="/changes" className="mt-2 inline-block text-xs font-semibold text-ink-500 underline-offset-2 hover:underline">정정·취소 공고 전체 보기</Link>
    </section>
  );
}

/** 공고 상세: 이 공고에 맞는 하한율·통과점수·실적 기준 (기준표 화면의 해당 줄) */
export function BidCriteriaCard({ bid, qual, notice }: { bid: Bid; qual?: BidQual; notice?: NoticeCriteria }) {
  const { data: table } = useRateTable();
  if (bid.contractMethod !== "적격심사" && bid.contractMethod !== "제한적최저가") return null;
  const basis = qual?.basis;
  const sheet = bidSheet(bid, basis, { notice });
  const kind = notice?.standard?.issuer ?? basisKind(basis);
  const row = rateRowFor(table, bid.bizType, basis?.method, basis?.presmpt);
  const lwlt = notice?.lowerLimit?.value ?? usableLwlt(basis?.lwlt);
  const perf = sheet.items.find((i) => i.kind === "performance");
  const same = row && lwlt !== undefined ? Math.abs(row.rate - lwlt) < 0.0005 : undefined;
  const pass = sheet.pass?.kind === "total" ? sheet.pass.score : undefined;
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">하한율·실적 기준</h2>
        <Link href="/rates" className="text-xs font-semibold text-ink-500 hover:text-ink">기준표 전체</Link>
      </div>
      <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">
        {kind === "모름" ? "적용 기준" : `${kind} 기준`}{basis?.method ? ` · ${basis.method.replace(/^적격심사제\s*-\s*/, "")}` : ""}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-paper p-3">
          <dt className="text-xs text-ink-500">낙찰하한율</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums">{pct(lwlt ?? sheet.lowerLimit)}</dd>
          <dd className="text-[11px] text-ink-300">{notice?.lowerLimit ? "공고서" : lwlt !== undefined ? "나라장터 공고 값" : "기준표 값"}</dd>
        </div>
        {pass !== undefined && (
          <div className="rounded-xl bg-paper p-3">
            <dt className="text-xs text-ink-500">통과점수</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums">{pass}점</dd>
            <dd className="text-[11px] text-ink-300">{notice?.pass ? "공고서" : "기준표"}</dd>
          </div>
        )}
        {row && (
          <div className="col-span-2 rounded-xl bg-paper p-3 sm:col-span-1">
            <dt className="text-xs text-ink-500">같은 기준 공고</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums">{pct(row.rate)}</dd>
            <dd className="text-[11px] text-ink-300">{row.count.toLocaleString()}건 중 {Math.round(row.share * 100)}%</dd>
          </div>
        )}
      </dl>
      {same === false && (
        <p className="mt-3 rounded-xl bg-amber-100/60 p-3 text-xs leading-relaxed">이 공고의 하한율 {pct(lwlt)}는 같은 기준 공고에서 가장 많이 쓴 {pct(row!.rate)}와 다릅니다. 특례나 정정 여부를 공고서에서 확인해 주세요.</p>
      )}
      {perf ? (
        <div className="mt-4 text-sm">
          <p className="font-semibold">{perf.label} · {perf.max}점</p>
          <p className="mt-0.5 text-ink-500">{perfMultiple(perf)}</p>
          {sheet.recognition?.[0] && <p className="mt-1 text-xs text-ink-500 [overflow-wrap:anywhere]">공고서: {sheet.recognition[0]}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-500">{bid.contractMethod === "제한적최저가" ? "평가 없이 하한율 이상 최저가로 낙찰자를 정합니다." : "이 구간 기준표에는 실적 평가 항목이 없습니다."}</p>
      )}
      <p className="mt-3 text-xs text-ink-300">기준: {sheet.criteria?.name ?? sheet.title}{sheet.criteria?.status ? ` (${sheet.criteria.status})` : ""}</p>
    </section>
  );
}
