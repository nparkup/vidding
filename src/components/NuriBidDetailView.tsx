"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CloseDdayBadge } from "@/components/Badges";
import { LicenseLaws } from "@/components/LicenseLaws";
import { agencyKey, type NuriBid, type NuriBidsFile, type NuriContract, type NuriResult } from "@/lib/nuri";
import { dateTime, won } from "@/lib/format";

interface Cell { k: string; v: ReactNode; sub?: string; wide?: boolean }

const amountCell = (k: string, n: number, sub?: string): Cell => ({ k, v: <span className="tabular-nums">{won(n)}</span>, sub, wide: n >= 100_000_000 });
const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");
const pct = (n: number) => `${n.toFixed(3).replace(/\.?0+$/, "")}%`;
const NURI_HOME = "https://nuri.g2b.go.kr";

/** 낙찰방법 → 낙찰자를 정하는 방식 (누리장터 공고는 발주자가 정한 기준을 따른다) */
function howDecided(award?: string): string {
  if (!award) return "공고서의 낙찰 방법 확인";
  if (award.startsWith("적격심사")) return "발주자가 정한 적격심사 기준(실적·경영상태·가격 등) 점수로 정합니다. 기준은 공고서에 있습니다.";
  if (award.startsWith("최저가")) return "자격을 갖춘 업체 가운데 가장 낮은 금액을 써낸 업체";
  if (award.includes("제안서")) return "제안서 평가(기술)와 가격을 합한 점수로 정합니다. 평가 기준은 공고서·제안요청서에 있습니다.";
  return award;
}

export function NuriBidDetailView({ bid: b, data }: { bid: NuriBid; data: NuriBidsFile }) {
  const key = agencyKey(b.agency);
  const past = data.results.filter((r) => agencyKey(r.agency) === key && !(r.no === b.no && r.ord === b.ord)).sort((x, y) => y.openedAt.localeCompare(x.openedAt));
  const deals = data.contracts.filter((c) => agencyKey(c.agency) === key).sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
  const rate = b.award ? data.rates.find((r) => r.biz === b.biz && r.award === b.award) : undefined;
  const amount = b.refAmount ?? b.budget;

  const cells: (Cell | undefined | false | "" | 0)[] = [
    b.refAmount ? amountCell("기준금액", b.refAmount, "개찰 때 투찰금액의 기준") : b.budget ? amountCell("배정예산", b.budget) : { k: "금액", v: "공개 안 함", sub: "공고서 확인" },
    b.refAmount && b.budget && b.budget !== b.refAmount && amountCell("배정예산", b.budget),
    { k: "업무", v: b.biz, sub: b.kind },
    b.category && b.category !== b.biz && { k: "업종 분류", v: b.category },
    b.contract && { k: "계약방법", v: b.contract },
    b.award && { k: "낙찰방법", v: b.award.replace("에의한낙찰자결정", "") },
    b.method && { k: "입찰방식", v: b.method === "직찰" ? "직접 제출" : b.method },
    { k: "참가 지역", v: b.regions.length ? `${b.regions.join("·")} 제한` : b.regionLimit === "투찰제한" ? "지역 제한" : "공고서 확인", sub: b.regions.length ? undefined : b.regionLimit },
    { k: "필요 면허", v: b.licenseGroups.length ? b.licenseGroups.map((g) => g.map((r) => r.name).join("+")).join(" 또는 ") : "공고서 확인", wide: b.licenseGroups.flat().length > 2 },
    b.vat && { k: "부가세", v: b.vat },
    b.rebid && { k: "재입찰", v: b.rebid },
    b.detail?.until && { k: "사업 기한", v: ymd(b.detail.until) },
    b.detail?.place && { k: "사업 장소", v: b.detail.place, wide: b.detail.place.length > 14 },
    b.apt && { k: "아파트 단지", v: b.apt.name, sub: [b.apt.households && `${b.apt.households.toLocaleString()}세대`, b.apt.buildings && `${b.apt.buildings}개 동`, b.apt.heating].filter(Boolean).join(" · ") || undefined },
  ];
  const shown = cells.filter((c): c is Cell => !!c);

  const points = [
    b.state === "재공고" && "재공고입니다. 앞선 공고가 유찰됐을 수 있으니 바뀐 조건을 공고서에서 확인하세요.",
    b.state === "변경공고" && "변경공고입니다. 바뀐 일정·자격·서류를 공고서에서 다시 확인하세요.",
    b.qualification && /공고서/.test(b.qualification) && "입찰 자격은 공고서에 적혀 있습니다. 첨부 공고서의 참가자격을 먼저 확인하세요.",
    b.method === "직찰" && "직접 제출(직찰) 공고입니다. 정해진 장소·시간에 입찰서를 직접 냅니다.",
    b.briefingAt && `현장설명이 ${dateTime(b.briefingAt)}${b.briefingPlace ? ` ${b.briefingPlace}` : ""}에서 열립니다. 참석이 입찰 조건인지 공고서에서 확인하세요.`,
    b.method !== "직찰" && "누리장터 전자입찰은 누리장터 이용자 등록과 공동인증서가 필요합니다. 나라장터 등록과 별개입니다.",
  ].filter((x): x is string => !!x);

  const timeline = [
    { label: "공고 게시", at: b.postedAt },
    ...(b.beginAt ? [{ label: "입찰 시작", at: b.beginAt }] : []),
    ...(b.briefingAt ? [{ label: "현장설명", at: b.briefingAt, note: b.briefingPlace }] : []),
    { label: b.method === "직찰" ? "개찰" : "입찰 마감", at: b.closeAt, strong: true },
    ...(b.openAt && b.openAt !== b.closeAt ? [{ label: "개찰", at: b.openAt, note: b.openPlace }] : []),
  ].sort((x, y) => +new Date(x.at) - +new Date(y.at)) as { label: string; at: string; strong?: boolean; note?: string }[];

  return (
    <div className="container-x py-6 sm:py-8">
      <Link href="/nuri-bids" className="text-sm text-ink-500 hover:text-ink">민간 공고 목록으로</Link>

      <header className="mt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <CloseDdayBadge iso={b.closeAt} />
            <span className="chip">누리장터 · {b.biz}</span>
            {b.award && <span className="chip">{b.award.replace("에의한낙찰자결정", "")}</span>}
            {b.state !== "등록공고" && <span className="chip border-amber/40 bg-amber-100/60 text-ink">{b.state}</span>}
            <span className="chip">공고번호 {b.no}-{b.ord}</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{b.title}</h1>
          <p className="mt-2 text-ink-500 [overflow-wrap:anywhere]">{b.agency}{b.refNo ? ` · ${b.refNo}` : ""}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={NURI_HOME} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">누리장터에서 보기</a>
          <Link href="/apply" className="btn-mint btn-sm">이 공고 준비 도움받기</Link>
        </div>
        <p className="mt-2 text-xs text-ink-400">누리장터에서 공고번호 {b.no}로 찾을 수 있습니다.</p>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-4">
          <section className="card p-5">
            <h2 className="text-lg font-bold">핵심 요약</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
              {shown.map((c) => (
                <div key={c.k} className={`min-w-0 rounded-xl bg-paper p-3${c.wide ? " col-span-2" : ""}`}>
                  <dt className="text-xs text-ink-500">{c.k}</dt>
                  <dd className="mt-1 break-words font-bold">{c.v}</dd>
                  {c.sub && <dd className="mt-0.5 text-xs text-ink-500">{c.sub}</dd>}
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl bg-paper p-4 text-sm">
              <p className="text-xs text-ink-500">계약방법 {b.contract ?? "-"} · 낙찰방법 {b.award ?? "-"}</p>
              <p className="mt-1"><span className="text-ink-500">낙찰자 결정 </span>{howDecided(b.award)}</p>
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

          {b.sheet ? <SheetCard sheet={b.sheet} predictHref={`/premium/nuri?bid=${encodeURIComponent(`${b.no}-${b.ord}`)}#predict`} /> : b.aiSheet ? (
            <section className="card p-5">
              <h2 className="text-lg font-bold">평가 배점표</h2>
              <p className="mt-1 text-sm text-ink-500">첨부에 배점표가 있지만 표 모양이 복잡해 바로 읽지 못했습니다. 평가점수 예측에서 이 공고를 고르면 배점표를 판독해 계산합니다.</p>
              <Link href={`/premium/nuri?bid=${encodeURIComponent(`${b.no}-${b.ord}`)}#predict`} className="btn-primary mt-4 w-full">배점표 판독하고 평가점수 예측하기</Link>
            </section>
          ) : null}

          <LicenseLaws groups={b.licenseGroups} />

          <section className="card p-5">
            <h2 className="text-lg font-bold">일정</h2>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {timeline.map((t) => (
                <li key={t.label} className={`min-w-0 rounded-xl border p-3 ${t.strong ? "border-coral bg-coral-100/50" : "border-ink-100"}`}>
                  <p className={`text-xs font-semibold ${t.strong ? "text-coral" : "text-ink-500"}`}>{t.label}</p>
                  <p className="mt-1 text-sm font-bold">{dateTime(t.at)}</p>
                  {t.note && <p className="mt-0.5 break-words text-xs text-ink-500">{t.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          <PastResults rows={past} agency={b.agency} from={data.from} />
          <PastContracts rows={deals} agency={b.agency} from={data.from} />

          {b.files.length > 0 && (
            <section className="card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">첨부파일</h2>
                <span className="chip">{b.files.length}건 · 누리장터</span>
              </div>
              <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {b.files.map((f) => (
                  <li key={f.url} className="min-w-0">
                    <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm hover:bg-ink-100/60">
                      <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{f.name}</span>
                      <span className="shrink-0 text-xs text-ink-300">내려받기</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <section className="card p-5">
            <h2 className="text-lg font-bold">지난 개찰로 본 투찰률</h2>
            <p className="mt-1 text-sm text-ink-500">누리장터 {b.biz} · {b.award?.replace("에의한낙찰자결정", "") ?? "낙찰방법"} 공고의 개찰 1순위</p>
            {rate ? (
              <>
                <div className="mt-4 rounded-xl bg-ink p-4 text-white">
                  <p className="text-xs text-ink-300">1순위 투찰률 가운데값</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">{pct(rate.p50)}</p>
                  {amount ? <p className="mt-1 text-sm tabular-nums text-ink-200">{b.refAmount ? "기준금액" : "배정예산"} 기준 {won(Math.round((amount * rate.p50) / 100 / 1000) * 1000)}</p> : null}
                  <p className="mt-2 text-xs text-ink-300">절반이 {pct(rate.p25)} ~ {pct(rate.p75)} 사이 · 평균 {rate.bidders}개사 참가</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-500">{data.from ? `${data.from}부터 쌓은` : "최근"} 누리장터 개찰완료 {rate.n.toLocaleString()}건의 1순위 투찰률입니다. 누리장터가 투찰률을 공개하지 않아, 1순위 투찰금액을 그 공고의 기준금액(공개하지 않았으면 배정예산)으로 나눈 값입니다.</p>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink-500">같은 업무·낙찰방법의 지난 개찰 결과가 5건이 안 돼 투찰률을 보여 주지 않습니다.</p>
            )}
            {past.length > 0 && (
              <p className="mt-3 text-sm text-ink-700">같은 기관의 지난 개찰 {past.length}건, 평균 {avgBidders(past)}개사 참가</p>
            )}
          </section>

          <section className="rounded-3xl bg-gradient-to-br from-mint to-mint-700 p-5 text-white shadow-glow">
            <p className="font-bold">이 공고, 함께 준비할까요?</p>
            <p className="mt-2 text-sm opacity-90">요금제를 이용하시면 같은 조건의 새 공고를 매일 아침 메일로 받고, 평가점수 예측을 쓰실 수 있습니다.</p>
            <Link href="/pricing" className="btn mt-4 w-full bg-white text-ink hover:bg-paper">요금제 보기</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, "")}점`;

/** 첨부에서 읽은 평가 배점표: 묶음별 항목과 배점 */
function SheetCard({ sheet: s, predictHref }: { sheet: NonNullable<NuriBid["sheet"]>; predictHref: string }) {
  const groups: { name: string; items: typeof s.items }[] = [];
  for (const i of s.items) {
    const g = groups.find((x) => x.name === i.group);
    if (g) g.items.push(i); else groups.push({ name: i.group, items: [i] });
  }
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">평가 배점표</h2>
        <span className="chip">총 배점 합계 {pts(s.total)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">첨부 {s.file}에서 읽은 항목과 배점입니다.</p>
      <div className="mt-4 space-y-3">
        {groups.map((g) => (
          <div key={g.name} className="rounded-xl bg-paper p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold">{g.name}</p>
              <p className="shrink-0 text-sm font-bold tabular-nums">{pts(g.items.reduce((a, i) => a + i.max, 0))}</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((i, n) => (
                <li key={`${i.label}-${n}`} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-ink-700 [overflow-wrap:anywhere]">{i.label}</span>
                  <span className="shrink-0 tabular-nums text-ink-500">{pts(i.max)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {s.pass ? <p className="mt-3 text-sm text-ink-700">통과 기준: 총점 {pts(s.pass)} 이상</p> : null}
      <p className="mt-3 text-xs leading-relaxed text-ink-400">세부 평가 기준과 서류 인정 범위는 공고서 원문에서 확인하세요. 항목 이름은 원문 표를 줄여 보여 줄 수 있습니다.</p>
      <Link href={predictHref} className="btn-primary mt-4 w-full">이 배점표로 평가점수 예측하기</Link>
    </section>
  );
}

const avgBidders = (xs: NuriResult[]) => (xs.reduce((a, r) => a + r.bidders, 0) / xs.length).toFixed(1).replace(/\.0$/, "");

function PastResults({ rows, agency, from }: { rows: NuriResult[]; agency: string; from?: string }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">같은 기관 지난 개찰 결과</h2>
        <span className="chip">누리장터 민간낙찰정보</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink-500">{from ? `${from}부터` : "최근"} {agency}의 누리장터 개찰 결과가 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.slice(0, 8).map((r) => (
            <li key={`${r.no}-${r.ord}-${r.openedAt}`} className="min-w-0 rounded-xl bg-paper p-3 text-sm sm:p-4">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                <span>{ymd(r.openedAt)} 개찰</span>
                <span className={`chip ${r.state === "유찰" ? "border-coral/30 bg-coral-100/60 text-coral" : ""}`}>{r.state || "개찰"}</span>
                <span>{r.bidders}개사 참가</span>
              </div>
              <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{r.title}</p>
              {r.ranks.length > 0 && (
                <ol className="mt-2 space-y-1">
                  {r.ranks.slice(0, 3).map((x) => (
                    <li key={x.rank} className="grid min-w-0 grid-cols-[2.5rem_1fr_auto] gap-2">
                      <span className="text-ink-500">{x.rank}위</span>
                      <span className="min-w-0 truncate">{x.name}</span>
                      <span className="text-right tabular-nums">{x.amount ? won(x.amount) : "-"}{x.rate ? <span className="ml-1 text-xs text-ink-500">({pct(x.rate)})</span> : null}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PastContracts({ rows, agency, from }: { rows: NuriContract[]; agency: string; from?: string }) {
  if (!rows.length) return null;
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">같은 기관 최근 계약</h2>
        <span className="chip">누리장터 민간계약정보</span>
      </div>
      <ul className="mt-4 divide-y divide-ink-100/70 text-sm">
        {rows.slice(0, 8).map((c) => (
          <li key={c.no} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
            <div className="min-w-0">
              <p className="font-semibold [overflow-wrap:anywhere]">{c.link ? <a href={c.link} target="_blank" rel="noreferrer" className="hover:text-mint-600">{c.name}</a> : c.name}</p>
              <p className="mt-0.5 text-xs text-ink-500 [overflow-wrap:anywhere]">{[c.date && ymd(c.date), c.biz, c.corps.join(", "), c.joint && "공동계약"].filter(Boolean).join(" · ")}</p>
            </div>
            <p className="font-bold tabular-nums sm:text-right">{c.amount ? won(c.amount) : "-"}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-300">{agency}가 누리장터로 맺은 계약입니다{from ? ` (${ymd(from)}부터)` : ""}. 계약 자료에는 입찰공고번호가 없어 기관 이름으로 찾습니다.</p>
    </section>
  );
}
