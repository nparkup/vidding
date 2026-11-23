"use client";

import Link from "next/link";
import { AgencyLogo } from "./AgencyLogo";
import { Suspense, useEffect, useState } from "react";
import { CloseDdayBadge } from "@/components/Badges";
import { ProfileScore } from "@/components/ProfileScore";
import { DocList } from "@/components/DocList";
import { bidPriceGuide, documentChecklist, keyPoints } from "@/lib/analysis";
import { loadBidExtra } from "@/lib/attachments";
import { BidContact, BidSummary, kstIso } from "@/components/BidSummary";
import type { BidQual } from "@/lib/eligibility";
import { dateTime, won, wonFull } from "@/lib/format";
import type { Bid, BidAttachment } from "@/lib/types";
import { methodProfile } from "@/lib/bidMethod";
import { BidChangeBanner, BidCriteriaCard } from "@/components/BidNoticeExtras";
import type { NoticeCriteria } from "@/lib/noticeCriteria";
import { BidPriceAnalysis } from "@/components/BidPriceAnalysis";
import { loadAwardAnalysis } from "@/components/premium/AwardAnalysis";
import type { AwardAnalysis } from "@/lib/awards/analysis";
import { usesAssess } from "@/lib/awards/assess";
import { agencyId } from "@/lib/awards/agency";
import { MyBoxButton } from "@/components/MyBoxButton";

/** 공고 분석 화면 (서버 배포의 /bids/[id] 와 정적 배포의 /bids/view 공용) */
export function BidDetailView({ bid }: { bid: Bid }) {
  const profile = methodProfile(bid);
  const [files, setFiles] = useState<BidAttachment[]>([]);
  const [qual, setQual] = useState<BidQual>();
  const [notice, setNotice] = useState<NoticeCriteria>();
  // 낙찰 결과 분석 파일 (사정율 표본). undefined = 불러오는 중, null = 없음
  const [award, setAward] = useState<AwardAnalysis | null>();
  const priceBid = usesAssess(bid.contractMethod) && profile.open;
  useEffect(() => {
    let alive = true;
    setAward(undefined);
    if (priceBid) loadAwardAnalysis(bid.id).then((a) => { if (alive) setAward(a); }).catch(() => { if (alive) setAward(null); });
    return () => { alive = false; };
  }, [bid.id, priceBid]);
  useEffect(() => {
    let alive = true;
    setFiles([]);
    setQual(undefined);
    setNotice(undefined);
    loadBidExtra(bid).then((x) => { if (alive) { setFiles(x.files); setQual(x.qual); setNotice(x.notice); } }).catch(() => {});
    return () => { alive = false; };
  }, [bid]);
  const info = qual?.info;

  // 기초금액이 공개됐으면 투찰 가이드도 그 금액으로 계산한다 (공고 목록 금액은 배정예산·추정가격)
  const guide = bidPriceGuide(info?.base ? { ...bid, baseAmount: info.base } : bid);
  const points = keyPoints(bid);
  const docs = documentChecklist(bid);

  // 일정: 공고 목록의 게시·마감·개찰에 입찰공고정보서비스의 제출 시작·자격 등록·공동수급협정·입찰보증 마감을 더해 시간순으로
  const briefing = bid.briefingAt ?? kstIso(info?.briefingAt);
  const timeline = [
    { label: "공고 게시", at: bid.postedAt },
    ...(briefing ? [{ label: "현장설명", at: briefing, note: info?.briefingPlace }] : []),
    ...(kstIso(info?.bidBegin) ? [{ label: "입찰서 제출 시작", at: kstIso(info?.bidBegin)! }] : []),
    ...(kstIso(info?.registerBy ?? qual?.registerBy) ? [{ label: "참가자격 등록 마감", at: kstIso(info?.registerBy ?? qual?.registerBy)! }] : []),
    ...(kstIso(info?.jointBy) ? [{ label: "공동수급협정 마감", at: kstIso(info?.jointBy)! }] : []),
    ...(kstIso(info?.guaranteeBy) ? [{ label: "입찰보증서 마감", at: kstIso(info?.guaranteeBy)! }] : []),
    { label: "입찰 마감", at: bid.closeAt, strong: true },
    { label: "개찰", at: bid.openAt, note: info?.openPlace && !/나라장터/.test(info.openPlace) ? info.openPlace : undefined },
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at)) as { label: string; at: string; strong?: boolean; note?: string }[];

  return (
    <div className="container-x py-6 sm:py-8">
      <Link href="/bids" className="text-sm text-ink-500 hover:text-ink">공고 목록으로</Link>

      <header className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CloseDdayBadge iso={bid.closeAt} />
            <span className="chip">{bid.bizType ?? "용역"} · {bid.category}</span>
            <span className="chip">{bid.contractMethod}</span>
            {!profile.open && <span className="chip border-coral/30 bg-coral-100/60 text-coral">참가 불가</span>}
            <span className="chip">공고번호 {bid.bidNtceNo}-{bid.bidNtceOrd}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{bid.title}</h1>
          <p className="mt-2 text-ink-500">
            <AgencyLogo name={bid.demandAgency} size={24} maxW={140} className="mr-2 -mt-1" />
            {bid.agency}{bid.demandAgency !== bid.agency && ` · 수요기관 ${bid.demandAgency}`}
            <Link href={`/analysis/agency?id=${agencyId(bid.demandAgency)}`} className="ml-2 text-sm font-semibold text-mint-700 underline-offset-2 hover:underline">발주처 분석</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap lg:justify-end">
          <MyBoxButton bid={bid} />
          <a href={bid.detailUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">나라장터 원문</a>
          <Link href="/apply" className="btn-mint btn-sm">이 공고 준비 도움받기</Link>
        </div>
      </header>

      <BidChangeBanner bid={bid} />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-4">
          {/* 요약 */}
          <section className="card p-5">
            <h2 className="text-lg font-bold">핵심 요약</h2>
            <BidSummary bid={bid} qual={qual} />
            {/* 입찰·낙찰 방식: 누가 참가하고 낙찰자를 어떻게 정하는지 */}
            <div className={`mt-4 rounded-xl p-4 text-sm ${profile.open ? "bg-paper" : "bg-coral-100/60"}`}>
              <p className="text-xs text-ink-500">계약방법 {bid.contractType ?? "-"} · 낙찰방법 {bid.awardRaw ?? bid.contractMethod}</p>
              {!profile.open && <p className="mt-1 font-bold text-coral">{profile.closedReason}</p>}
              <p className="mt-1"><span className="text-ink-500">참가 업체 </span>{profile.who}</p>
              <p className="mt-0.5"><span className="text-ink-500">낙찰자 결정 </span>{profile.decide}</p>
            </div>
            <BidContact info={info} />
            {points.length > 0 && (
              <ul className="mt-5 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <BidCriteriaCard bid={bid} qual={qual} notice={notice} />

          {/* 일정 */}
          <section className="card p-5">
            <h2 className="text-lg font-bold">일정</h2>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {timeline.map((t) => (
                <li key={t.label} className={`rounded-xl border p-3 ${t.strong ? "border-coral bg-coral-100/50" : "border-ink-100"}`}>
                  <p className={`text-xs font-semibold ${t.strong ? "text-coral" : "text-ink-500"}`}>{t.label}</p>
                  <p className="mt-1 text-sm font-bold">{dateTime(t.at)}</p>
                  {t.note && <p className="mt-0.5 break-words text-xs text-ink-500">{t.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          {priceBid && <BidPriceAnalysis bid={bid} info={info} analysis={award} />}

          {files.length > 0 && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">첨부파일</h2>
                <span className="chip">{files.length}건 · 나라장터</span>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.url} className="min-w-0">
                    <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm hover:bg-ink-100/60">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{f.name}</span>
                      <span className="shrink-0 text-xs text-ink-300">{f.kind}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 제출 서류 */}
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">제출 서류</h2>
              <span className="chip">{bid.contractMethod} 기준</span>
            </div>
            <p className="mt-1 mb-3 text-sm text-ink-500">최종 서류는 반드시 공고문 원문으로 확인하세요.</p>
            <DocList groups={docs} />
          </section>
        </div>

        <aside className="min-w-0 space-y-4">
          {/* 가능성 */}
          <section className="card p-5">
            <h2 className="text-lg font-bold">입찰 가능성</h2>
            <p className="mt-1 text-xs text-ink-400">알고리즘 분석 · 6개 항목 가중 채점</p>
            <Suspense fallback={<p className="mt-4 text-sm text-ink-300">계산 중…</p>}>
              <ProfileScore bid={bid} />
            </Suspense>
          </section>

          {/* 투찰 가이드: 가격 경쟁 공고는 왼쪽 사정율 분석·투찰금액이 대신한다 */}
          {!priceBid && <section className="card p-5">
            <h2 className="text-lg font-bold">투찰 금액 가이드</h2>
            <p className="mt-1 text-sm text-ink-500">기초금액 × 예정가격 범위(±2%) × 낙찰하한율 {guide.rate.toFixed(3)}%</p>
            <div className="mt-4 rounded-xl bg-ink p-4 text-white">
              <p className="text-xs text-ink-300">권장 중심 금액</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums">{wonFull(guide.center)}</p>
              <p className="mt-2 text-xs text-ink-300">예상 범위 {won(guide.low)} ~ {won(guide.high)}</p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-300">
              참고용 추정치입니다.<br />실제 예정가격은 복수예비가격 추첨으로 결정됩니다.
            </p>
          </section>}

          <section className="card p-5">
            <p className="text-xs font-semibold text-mint-600">프리미엄</p>
            <h2 className="mt-1 text-lg font-bold">평가점수 예측</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              이 공고의 첨부파일에서 평가항목과 배점을 읽고, 귀사의 실적·신용등급·인력으로 {bid.contractMethod === "협상에 의한 계약" ? "기술점수와 협상적격 여부" : bid.contractMethod === "적격심사" ? "적격심사 예상 점수와 통과 가능한 투찰률" : "예상 점수"}를 계산합니다.
            </p>
            <Link href={`/premium?bid=${encodeURIComponent(bid.id)}#predict`} className="btn-primary mt-4 w-full">이 공고 점수 예측하기</Link>
          </section>

          <section className="rounded-3xl bg-gradient-to-br from-mint to-mint-700 p-5 text-white shadow-glow">
            <p className="font-bold">이 공고, 함께 준비할까요?</p>
            <p className="mt-2 text-sm opacity-90">요금제를 이용하시면 이 공고 같은 조건의 새 공고를 매일 아침 메일로 받고, 평가점수 예측을 공고 수 제한 없이 쓰실 수 있습니다.</p>
            <Link href="/pricing" className="btn mt-4 w-full bg-white text-ink hover:bg-paper">요금제 보기</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
