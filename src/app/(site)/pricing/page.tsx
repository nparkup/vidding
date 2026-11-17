import type { Metadata } from "next";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "요금제" };

const CONTACT = "hello@ipchalmatelab.kr";
const won = (n: number) => n.toLocaleString("ko-KR");

type Cell = boolean | string;
interface Row { k: string; d?: string; v: [Cell, Cell, Cell] }

/** 비교표: 기능 묶음별로, 수량이 다른 항목은 수량을 그대로 적는다 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "공고 수집·선별",
    rows: [
      { k: "맞춤 공고 요약 이메일", d: "영업일 매일 아침", v: [true, true, true] },
      { k: "면허·지역·금액 1차 선별", d: "필수 조건이 안 맞는 공고는 미리 제외", v: [true, true, true] },
      { k: "참가조건·마감일 정리", v: [true, true, true] },
      { k: "사전규격 선제 알림", d: "본공고 전 사전규격 단계부터", v: [false, false, true] },
    ],
  },
  {
    title: "공고 분석",
    rows: [
      { k: "제출서류 체크리스트", d: "관심 공고 기준", v: ["월 3건", "무제한", "무제한"] },
      { k: "입찰 가능성 점수·투찰 가이드", d: "6개 항목 100점 채점, S~C 등급", v: [false, true, true] },
      { k: "평가점수 예측", d: "적격심사·협상계약. 첨부 공고서·규격서 판독, 기업정보와 낙찰 5년치 유사 실적으로 항목별 예상 점수", v: [false, false, true] },
      { k: "협상계약 제안서 가이드", d: "목차·작성 방향", v: [false, false, true] },
    ],
  },
  {
    title: "보고서",
    rows: [
      { k: "주요 공고 분석보고서", v: [false, "주 1회", "주 1회"] },
      { k: "발주처·경쟁사 동향 리포트", v: [false, false, "월 1회"] },
    ],
  },
];

/** 분석에 쓰는 데이터 (낙찰 저장소 실측치, 2026-11 기준) */
const DATA = [
  { n: "159만 건", t: "낙찰 결과", d: "최근 5년치 용역·공사·물품" },
  { n: "232만 건", t: "입찰공고", d: "같은 기간 나라장터 공고" },
  { n: "하루 3회", t: "공고 갱신", d: "영업일 06:40 · 11:40 · 16:40" },
];

const FAQ = [
  { q: "2주 무료 체험은 어떻게 진행되나요?", a: "무료 진단을 신청하고 면허·지역·금액 조건을 등록하면, 고르신 요금제 기능으로 14일 동안 이용하실 수 있습니다. 카드를 등록하지 않고 시작하므로 체험이 끝나도 자동으로 결제되지 않으며, 계속 이용할지는 그때 정하시면 됩니다." },
  { q: "표시된 가격은 무엇을 기준으로 하나요?", a: "사업자 1곳, 월 단위 이용료이며 VAT 별도 금액입니다. VAT 포함 금액은 요금제 카드에 함께 적었습니다. 낙찰 금액에 비례한 성공보수 등 월 이용료 외 추가 수수료는 없습니다." },
  { q: "약정이나 해지 조건이 있나요?", a: "약정이 없습니다. 월 단위로 이용하시고, 원하는 달까지만 쓰시면 됩니다." },
  { q: "입찰 가능성 점수와 평가점수 예측은 무엇이 다른가요?", a: "입찰 가능성 점수(프로부터)는 공고 데이터로 면허·지역·규모·경쟁 강도·실적·준비 기간 6개 항목을 채점해 참여할 공고를 고르는 기준입니다. 평가점수 예측(파트너)은 한 공고의 첨부 공고서와 규격서를 읽어 평가 기준을 뽑고, 귀사 기업정보와 낙찰 5년치 유사 실적을 대입해 적격심사·협상계약의 항목별 예상 점수를 계산합니다." },
];

const cell = (v: Cell) => (v === true ? <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-mint-50 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <>
    <PageHero center eyebrow="요금제" title="입찰 담당자 채용보다 가볍게" lead="모든 요금제 2주 무료 체험 · 카드 등록 없음 · 약정 없음 · VAT 별도" />
    <div className="container-x">
      <div className="relative z-10 -mt-6 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`relative flex flex-col overflow-hidden rounded-3xl border p-8 ${p.highlight ? "border-ink bg-ink-900 text-white shadow-lift" : "border-ink-100 bg-white shadow-card"}`}>
            {p.highlight && <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-mint/30 blur-3xl" />}
            <div className="relative flex items-center justify-between">
              <p className="text-lg font-bold">{p.name}</p>
              {p.highlight && <span className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-white">가장 많이 선택</span>}
            </div>
            <p className={`mt-1 text-sm ${p.highlight ? "text-ink-300" : "text-ink-500"}`}>{p.tagline}</p>
            <p className="relative mt-6 text-5xl font-extrabold tracking-tight tabular-nums">
              {(p.price / 10000).toFixed(1).replace(/\.0$/, "")}
              <span className="text-lg font-bold">만원</span>
              <span className="ml-1 text-sm font-medium text-ink-300">/ 월</span>
            </p>
            <p className={`relative mt-2 text-xs tabular-nums ${p.highlight ? "text-ink-300" : "text-ink-400"}`}>VAT 별도 · VAT 포함 월 {won(Math.round(p.price * 1.1))}원</p>
            <ul className={`relative mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${p.highlight ? "border-white/10" : "border-ink-100"}`}>
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />{f}</li>
              ))}
            </ul>
            <Link href={`/apply?plan=${p.id}`} className={`relative mt-8 ${p.highlight ? "btn-mint" : "btn-ghost"}`}>2주 무료로 시작</Link>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-3xl border border-ink-100 bg-ink-100 sm:grid-cols-3">
        {DATA.map((x) => (
          <div key={x.t} className="bg-white px-6 py-5">
            <p className="text-xs font-semibold text-ink-400">{x.t}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{x.n}</p>
            <p className="mt-1 text-xs text-ink-400">{x.d}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-400">모든 요금제의 분석은 같은 데이터를 씁니다. 조달청 나라장터(공공데이터포털) 기준이며 매일 늘어납니다.</p>

      <h2 className="mt-20 text-2xl font-extrabold tracking-tight">기능 한눈에 비교</h2>
      <div className="card mt-6 overflow-x-auto">
        <table className="table-x sm:min-w-[640px]">
          <thead>
            <tr>
              <th>기능</th>
              {PLANS.map((p) => (
                <th key={p.id} className="w-[19%] text-center sm:w-auto">
                  {p.name}
                  <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400 tabular-nums">{(p.price / 10000).toFixed(1).replace(/\.0$/, "")}만원</span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr><td colSpan={4} className="bg-paper py-2 text-xs font-bold text-ink-500">{g.title}</td></tr>
              {g.rows.map((r) => (
                <tr key={r.k}>
                  <td className="leading-snug">
                    <span className="font-medium">{r.k}</span>
                    {r.d && <span className="mt-0.5 block text-xs text-ink-400">{r.d}</span>}
                  </td>
                  {r.v.map((x, i) => <td key={i} className="text-center">{cell(x)}</td>)}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td className="text-xs text-ink-400">2주 무료 · 카드 등록 없음</td>
              {PLANS.map((p) => (
                <td key={p.id} className="text-center">
                  <Link href={`/apply?plan=${p.id}`} className={`inline-block rounded-full px-2.5 py-1.5 text-xs font-bold sm:px-4 ${p.highlight ? "bg-mint text-white" : "border border-ink-100 text-ink"}`}>시작</Link>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-7">
          <p className="text-lg font-bold">낙찰 성공보수 없음</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">월 정액 외에 낙찰 금액에 비례한 수수료를 받지 않습니다. 많이 낙찰받을수록 이득입니다.</p>
        </div>
        <div className="card p-7">
          <p className="text-lg font-bold">여러 사업장·면허 운영 중이신가요?</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">법인 여러 개나 지사별 조건을 따로 관리해야 한다면 맞춤 견적을 안내해 드립니다. <Link href="/apply" className="font-semibold text-mint-600">문의하기</Link></p>
        </div>
      </div>

      <section className="mt-20 grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">요금 관련 질문</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">더 궁금한 점은 메일로 보내 주세요.<br />평일 09:00–18:00 · <a href={`mailto:${CONTACT}`} className="font-semibold text-mint-600">{CONTACT}</a></p>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group rounded-2xl bg-paper px-6 py-5 open:bg-white open:shadow-card open:ring-1 open:ring-ink-100" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-ink-400 transition group-open:rotate-45 group-open:bg-mint group-open:text-white"><Plus className="h-4 w-4" /></span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
