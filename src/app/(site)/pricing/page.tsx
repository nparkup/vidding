import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgePercent, Building2, Check } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "요금제" };

const ROWS: [string, boolean | string, boolean | string, boolean | string][] = [
  ["맞춤 공고 요약 이메일 (영업일)", true, true, true],
  ["면허·지역·금액 1차 선별", true, true, true],
  ["참가조건·마감일 정리", true, true, true],
  ["제출서류 체크리스트", "월 3건", "무제한", "무제한"],
  ["입찰 가능성 점수·투찰 가이드", false, true, true],
  ["주간 분석보고서", false, true, true],
  ["전담 매니저 상담", false, true, true],
  ["협상계약 제안서 가이드", false, false, true],
  ["적격심사 점수 시뮬레이션", false, false, true],
  ["사전규격 선제 알림", false, false, true],
];

const cell = (v: boolean | string) => (v === true ? <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-mint-50 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <>
    <PageHero center eyebrow="요금제" title="입찰 담당자 채용보다 가볍게" lead="모든 요금제 2주 무료 체험 · 약정 없음 · VAT 별도" />
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
              <span className={`ml-1 text-sm font-medium ${p.highlight ? "text-ink-300" : "text-ink-300"}`}>/ 월</span>
            </p>
            <ul className={`relative mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${p.highlight ? "border-white/10" : "border-ink-100"}`}>
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />{f}</li>
              ))}
            </ul>
            <Link href={`/apply?plan=${p.id}`} className={`relative mt-8 ${p.highlight ? "btn-mint" : "btn-ghost"}`}>2주 무료로 시작</Link>
          </div>
        ))}
      </div>

      <h2 className="mt-20 text-2xl font-extrabold tracking-tight">기능 한눈에 비교</h2>
      <div className="card mt-6 overflow-x-auto">
        <table className="table-x min-w-[640px]">
          <thead><tr><th>기능</th>{PLANS.map((p) => <th key={p.id} className="text-center">{p.name}</th>)}</tr></thead>
          <tbody>
            {ROWS.map(([k, ...v]) => (
              <tr key={k}><td className="font-medium">{k}</td>{v.map((x, i) => <td key={i} className="text-center">{cell(x)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-7">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mint-50 text-mint-600"><BadgePercent className="h-5 w-5" /></span>
          <p className="mt-4 text-lg font-bold">낙찰 성공보수 없음</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">월 정액 외에 낙찰 금액에 비례한 수수료를 받지 않습니다. 많이 낙찰받을수록 이득입니다.</p>
        </div>
        <div className="card p-7">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky"><Building2 className="h-5 w-5" /></span>
          <p className="mt-4 text-lg font-bold">여러 사업장·면허 운영 중이신가요?</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">법인 여러 개나 지사별 조건을 따로 관리해야 한다면 맞춤 견적을 안내해 드립니다. <Link href="/apply" className="inline-flex items-center gap-0.5 font-semibold text-mint-600">문의하기 <ArrowRight className="h-3.5 w-3.5" /></Link></p>
        </div>
      </div>
    </div>
    </>
  );
}
