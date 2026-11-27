"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CloseDdayBadge } from "@/components/Badges";
import { DocList } from "@/components/DocList";
import { PlanCtaButton } from "@/components/PlanCtaButton";
import { aptDetailUrl, aptFileUrl, type AptBid } from "@/lib/apt";
import { contractMonths, forecastAptPrice, type AptPriceModel } from "@/lib/aptPrice";
import { dateTime, won, wonFull } from "@/lib/format";

/** 직전 계약과 비교해 예측하는 분야 (AptBidsExplorer·AptPricePredictor 와 같은 기준) */
const COMPARABLE = new Set<string>(["청소", "경비", "소독", "승강기유지", "전기안전관리", "정화조·저수조", "주택관리(위탁)"]);

interface Cell {
  k: string;
  v: ReactNode;
  sub?: string;
  wide?: boolean;
}

/** 금액은 원 단위 전체로 쓰고, 1억 원 이상이면 한 줄에 들어가게 두 칸을 쓴다 (나라장터 핵심 요약과 같은 모양) */
function amountCell(k: string, n: number, sub?: string): Cell {
  return { k, v: <span className="tabular-nums">{won(n)}</span>, sub, wide: n >= 100_000_000 };
}

/** 입찰방법 → 참가할 수 있는 업체 */
function whoCanBid(kind?: string): string {
  if (kind === "제한경쟁") return "공고서의 참가자격(면허·실적·지역 등)을 갖춘 업체";
  if (kind === "지명경쟁") return "관리주체가 지명한 업체만 참가할 수 있습니다";
  if (kind === "일반경쟁") return "공고서의 기본 자격을 갖춘 업체 누구나";
  return "공고서의 참가자격 확인";
}

/** 낙찰방법 → 낙찰자를 정하는 방식 (주택관리업자 및 사업자 선정지침 기준) */
function howDecided(award?: string): string {
  if (!award) return "공고서의 낙찰 방법 확인";
  if (award.startsWith("적격심사")) {
    const tail = award.includes("최고") ? " 점수가 같으면 높은 금액" : award.includes("최저") ? " 점수가 같으면 낮은 금액" : "";
    return `적격심사 평가표(관리실적·기술능력·재무상태·입찰가격 등) 점수가 가장 높은 업체.${tail ? `${tail}을 써낸 업체` : ""}`;
  }
  if (award === "최고낙찰") return "가장 높은 금액을 써낸 업체 (수입이 생기는 계약)";
  if (award === "최저낙찰") return "자격을 갖춘 업체 가운데 가장 낮은 금액을 써낸 업체";
  return "가장 낮은(수입 계약은 높은) 금액을 써낸 업체";
}

/** 구비서류 원문을 항목으로 나눈다 ("1. 사업자등록증 2. 법인등기부등본" / 쉼표 / 줄바꿈) */
function docItems(docs?: string): string[] {
  if (!docs) return [];
  const parts = docs
    .split(/\s*(?:\n|,|·|;|(?:^|\s)(?:\d{1,2}|[가-하])[.)]\s+|(?:^|\s)[①-⑳]\s*)\s*/)
    .map((x) => x.replace(/^[-*]\s*/, "").trim())
    .filter((x) => x.length > 1);
  return [...new Set(parts)].slice(0, 30);
}

const ymd = (d: string) => d.replace(/-/g, ".");

/** 아파트(K-apt) 공고 상세: 나라장터 공고 분석 화면(BidDetailView)과 같은 배치. K-apt 자료에 있는 항목만 보여 준다 */
export function AptBidDetailView({ bid: b, pricing }: { bid: AptBid; pricing?: AptPriceModel }) {
  const comparable = COMPARABLE.has(b.category);
  const forecast = pricing && b.prior && comparable ? forecastAptPrice(pricing, b.category, b.award, b.prior) : undefined;
  const priorMonths = b.prior ? contractMonths(b.prior.start, b.prior.end) : undefined;
  const priorLabel = b.prior?.via === "수의계약" ? "직전 수의계약" : "직전 낙찰";
  const round = (x: number) => Math.round(x / 1000) * 1000;

  const cells: (Cell | undefined | false | "")[] = [
    b.prior ? amountCell(`${priorLabel} 금액`, b.prior.amount, `같은 단지 ${b.category}${priorMonths ? ` · ${priorMonths}개월 계약` : ""}`) : comparable && { k: "직전 계약금액", v: "자료 없음", sub: "최근 3개 연도 같은 단지·업종" },
    forecast && amountCell("예상 낙찰금액", round(forecast.mid), `직전 계약과 규모가 같을 때 · 구간 ${won(round(forecast.low))} ~ ${won(round(forecast.high))}`),
    { k: "업종", v: b.category, sub: b.classLabel },
    { k: "지역", v: b.region || "-" },
    b.kind && { k: "입찰방법", v: b.kind },
    b.award && { k: "낙찰방법", v: b.award },
    (b.way || b.system) && { k: "입찰방식", v: b.way ?? "-", sub: b.system ? `${b.system} 입찰` : undefined },
    { k: "공고 상태", v: b.state, sub: b.urgent ? "긴급 공고" : undefined },
    b.guarantee && { k: "입찰보증금", v: "제출", sub: "입찰가격의 5% 이상" },
    b.prior?.start && b.prior.end && { k: "직전 계약기간", v: `${ymd(b.prior.start)} ~ ${ymd(b.prior.end)}`, wide: true },
    b.payTerms && { k: "지급조건", v: b.payTerms, wide: b.payTerms.length > 14 },
    { k: "첨부파일", v: b.files?.length ? `${b.files.length}건` : "없음", sub: b.files?.length ? "K-apt에서 내려받기" : undefined },
  ];
  const shown = cells.filter((c): c is Cell => !!c);

  // 확인할 점: 자료에서 바로 나오는 것만
  const points = [
    b.state === "재공고" && "재공고입니다. 앞선 공고가 유찰됐거나 취소됐을 수 있으니 바뀐 조건을 공고서에서 확인하세요.",
    b.state === "수정공고" && "수정공고입니다. 바뀐 일정·자격·서류를 공고서에서 다시 확인하세요.",
    b.urgent && "긴급 공고라 공고 기간이 짧습니다. 서류를 미리 준비하세요.",
    b.briefingAt && `현장설명이 ${dateTime(b.briefingAt)}${b.briefingPlace ? ` ${b.briefingPlace}` : ""}에서 열립니다. 참석이 입찰 조건인지 공고서에서 확인하세요.`,
    b.way === "직접입찰" && "직접입찰입니다. 정해진 장소·시간에 입찰서와 서류를 직접 제출합니다.",
    b.docsBy && b.docsBy !== b.closeAt && `서류 마감(${dateTime(b.docsBy)})이 입찰 마감과 다릅니다.`,
    b.guarantee && "입찰보증금(입찰가격의 5% 이상) 납부 또는 보증보험증권 제출이 필요합니다.",
    b.prior && `같은 단지의 ${priorLabel}은 ${wonFull(b.prior.amount)}${b.prior.closedAt ? `(${ymd(b.prior.closedAt)})` : ""}입니다.`,
  ].filter((x): x is string => !!x);

  const timeline = [
    { label: "공고 게시", at: `${b.postedAt}T00:00:00+09:00`, dateOnly: true },
    ...(b.briefingAt ? [{ label: "현장설명", at: b.briefingAt, note: b.briefingPlace }] : []),
    ...(b.docsBy && b.docsBy !== b.closeAt ? [{ label: "서류 마감", at: b.docsBy }] : []),
    { label: "입찰 마감", at: b.closeAt, strong: true },
  ].sort((x, y) => +new Date(x.at) - +new Date(y.at)) as { label: string; at: string; strong?: boolean; note?: string; dateOnly?: boolean }[];

  const docs = docItems(b.docs);
  const groups = [
    ...(docs.length ? [{ group: "공고서 구비서류", items: docs.map((name) => ({ name, required: true })) }] : []),
    {
      group: "제출 전 확인",
      items: [
        { name: "공고서·첨부 원문의 참가자격 확인", required: true },
        ...(b.briefingAt ? [{ name: "현장설명 참석", note: b.briefingPlace, required: false }] : []),
        ...(b.guarantee ? [{ name: "입찰보증금 또는 보증보험증권", note: "입찰가격의 5% 이상", required: true }] : []),
        { name: b.way === "직접입찰" ? "입찰서 직접 제출 장소·시간 확인" : `${b.system ?? "전자입찰"} 시스템 회원가입·인증서 준비`, required: true },
      ],
    },
  ];

  return (
    <div className="container-x py-6 sm:py-8">
      <Link href="/apt-bids" className="text-sm text-ink-500 hover:text-ink">공동주택 입찰공고 목록으로</Link>

      <header className="mt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <CloseDdayBadge iso={b.closeAt} />
            <span className="chip">공동주택 · {b.category}</span>
            {b.award && <span className="chip">{b.award}</span>}
            {b.kind && b.kind !== "일반경쟁" && <span className="chip">{b.kind}</span>}
            {b.state !== "신규공고" && <span className="chip border-amber/40 bg-amber-100/60 text-ink">{b.state}</span>}
            {b.urgent && <span className="chip border-coral/30 bg-coral-100/60 text-coral">긴급</span>}
            <span className="chip">입찰번호 {b.no}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{b.title}</h1>
          <p className="mt-2 text-ink-500 [overflow-wrap:anywhere]">{b.apt}{b.region ? ` · ${b.region}` : ""}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href={aptDetailUrl(b.no)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">K-apt 원문</a>
          {b.link && <a href={b.link} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">{b.system ?? "입찰 시스템"}에서 보기</a>}
          {forecast && <a href="#forecast" className="btn-ghost btn-sm">예상 낙찰금액 <span className="font-extrabold tabular-nums text-mint">{wonFull(round(forecast.mid))}</span></a>}
          <Link href={`/premium/apt?apt=${encodeURIComponent(b.no)}`} className="btn-primary btn-sm">입찰가격 예측</Link>
          <Link href="/apply" className="btn-mint btn-sm">이 공고 준비 도움받기</Link>
          <PlanCtaButton />
        </div>
      </header>

      <div className="mt-5 min-w-0 space-y-4">
          <section className="card p-5">
            <h2 className="text-lg font-bold">핵심 요약</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 [&>*]:min-w-0">
              {shown.map((c) => (
                <div key={c.k} className={`min-w-0 rounded-xl bg-paper p-3${c.wide ? " col-span-2" : ""}`}>
                  <dt className="text-xs text-ink-500">{c.k}</dt>
                  <dd className="mt-1 break-words font-bold">{c.v}</dd>
                  {c.sub && <dd className="mt-0.5 text-xs text-ink-500">{c.sub}</dd>}
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl bg-paper p-4 text-sm">
              <p className="text-xs text-ink-500">입찰분류 {b.classLabel || b.category} · 낙찰방법 {b.award ?? "-"}</p>
              <p className="mt-1"><span className="text-ink-500">참가 업체 </span>{whoCanBid(b.kind)}</p>
              <p className="mt-0.5"><span className="text-ink-500">낙찰자 결정 </span>{howDecided(b.award)}</p>
            </div>
            {points.length > 0 && (
              <ul className="mt-5 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {b.content && (
            <section className="card p-5">
              <h2 className="text-lg font-bold">공고 내용</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-700 [overflow-wrap:anywhere]">{b.content}</p>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-lg font-bold">일정</h2>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {timeline.map((t) => (
                <li key={t.label} className={`min-w-0 rounded-xl border p-3 ${t.strong ? "border-coral bg-coral-100/50" : "border-ink-100"}`}>
                  <p className={`text-xs font-semibold ${t.strong ? "text-coral" : "text-ink-500"}`}>{t.label}</p>
                  <p className="mt-1 text-sm font-bold">{t.dateOnly ? ymd(t.at.slice(0, 10)) : dateTime(t.at)}</p>
                  {t.note && <p className="mt-0.5 break-words text-xs text-ink-500">{t.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section id="forecast" className="card scroll-mt-24 p-5">
            <h2 className="text-lg font-bold">입찰가격 예측</h2>
            <p className="mt-1 text-sm text-ink-500">같은 단지 직전 계약 × 과거 낙찰 변화율</p>
            {forecast ? (
              <>
                <div className="mt-4 rounded-xl bg-ink p-4 text-white">
                  <p className="text-xs text-ink-300">예상 낙찰금액</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">{wonFull(round(forecast.mid))}</p>
                  <p className="mt-2 text-xs text-ink-300">예상 구간 {won(round(forecast.low))} ~ {won(round(forecast.high))}</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-500">
                  {forecast.basis} 낙찰 {forecast.stat.n.toLocaleString()}건에서 직전 계약 대비 가운데값 {forecast.stat.median >= 1 ? "+" : ""}{((forecast.stat.median - 1) * 100).toFixed(1)}% 달라졌습니다.
                  {forecast.check && forecast.check.n > 0 ? ` 올해 낙찰로 맞춰 보면 예상 금액과 10% 안이 ${(forecast.check.within10 * 100).toFixed(0)}%입니다.` : ""}
                </p>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink-500">
                {comparable ? "같은 단지 직전 계약 자료가 없어 예측하지 않습니다. 직전 계약금액을 알면 예측 화면에 직접 넣어 계산할 수 있습니다." : "공사·물품·기타 용역은 단지마다 과업이 달라 직전 계약과 비교하지 않습니다."}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-300">K-apt 입찰결과에는 예정가격·기초금액이 없어 투찰률 대신 직전 계약 대비 변화율로 계산합니다.<br />계약기간이 직전과 다르면 예측 화면에서 바꿔 보세요.</p>
            {comparable && <Link href={`/premium/apt?apt=${encodeURIComponent(b.no)}`} className="btn-primary mt-4 w-full">계약기간 바꿔 계산하기</Link>}
          </section>

          {b.prior && (
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">같은 단지 {priorLabel}</h2>
                <span className="chip">{b.prior.via === "수의계약" ? "수의계약 공지" : "입찰결과 공지"}</span>
              </div>
              <dl className="mt-4 divide-y divide-ink-100/70 text-sm">
                <Fact k={b.prior.via === "수의계약" ? "계약명" : "공고명"} v={b.prior.title} />
                <Fact k={b.prior.via === "수의계약" ? "계약금액" : "낙찰금액"} v={wonFull(b.prior.amount)} />
                <Fact k="계약업체" v={b.prior.company} />
                <Fact k="계약기간" v={b.prior.start && b.prior.end ? `${ymd(b.prior.start)} ~ ${ymd(b.prior.end)}${priorMonths ? ` (${priorMonths}개월)` : ""}` : undefined} />
                <Fact k={b.prior.via === "수의계약" ? "계약일" : "입찰 마감"} v={b.prior.closedAt ? ymd(b.prior.closedAt) : undefined} />
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-ink-300">같은 단지·같은 업종의 최근 3개 연도 낙찰·수의계약 중 가장 최근 건입니다.</p>
            </section>
          )}

          {(b.files?.length ?? 0) > 0 && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">첨부파일</h2>
                <span className="chip">{b.files!.length}건 · K-apt</span>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {b.files!.map((f, i) => (
                  <li key={f} className="min-w-0">
                    <a href={aptFileUrl(f)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm hover:bg-ink-100/60">
                      <span className="min-w-0 font-medium">공고 첨부{b.files!.length > 1 ? ` ${i + 1}` : ""}</span>
                      <span className="shrink-0 text-xs text-ink-300">내려받기</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">제출 서류</h2>
              <span className="chip">{docs.length ? "공고 구비서류 기준" : "기본 확인 항목"}</span>
            </div>
            <p className="mt-1 mb-3 text-sm text-ink-500">최종 서류는 반드시 공고문 원문으로 확인하세요.</p>
            <DocList groups={groups} />
          </section>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_1fr] gap-2 py-2">
      <dt className="text-ink-500">{k}</dt>
      <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{v}</dd>
    </div>
  );
}
