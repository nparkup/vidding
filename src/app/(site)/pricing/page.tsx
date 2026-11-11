import type { Metadata } from "next";
import Link from "next/link";
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

const cell = (v: boolean | string) => (v === true ? <span className="font-bold text-mint">●</span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <div className="container-x py-14 sm:py-20">
      <div className="text-center">
        <p className="eyebrow">요금제</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">입찰 담당자 채용보다 가볍게</h1>
        <p className="mt-4 text-ink-500">모든 요금제 2주 무료 체험 · 약정 없음 · VAT 별도</p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`relative flex flex-col rounded-3xl border p-7 ${p.highlight ? "border-ink bg-ink text-white shadow-card" : "border-ink-100 bg-white"}`}>
            {p.highlight && <span className="absolute -top-3 left-7 rounded-full bg-mint px-3 py-1 text-xs font-bold text-white">가장 많이 선택</span>}
            <p className="text-lg font-bold">{p.name}</p>
            <p className={`mt-1 text-sm ${p.highlight ? "text-ink-300" : "text-ink-500"}`}>{p.tagline}</p>
            <p className="mt-6 text-4xl font-extrabold tabular-nums">
              {(p.price / 10000).toFixed(1).replace(/\.0$/, "")}
              <span className="text-lg font-bold">만원</span>
              <span className={`ml-1 text-sm font-medium ${p.highlight ? "text-ink-300" : "text-ink-300"}`}>/ 월</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><span className="text-mint">✓</span>{f}</li>
              ))}
            </ul>
            <Link href={`/apply?plan=${p.id}`} className={`mt-8 ${p.highlight ? "btn-mint" : "btn-ghost"}`}>2주 무료로 시작</Link>
          </div>
        ))}
      </div>

      <div className="card mt-12 overflow-x-auto">
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
        <div className="card p-6">
          <p className="font-bold">낙찰 성공보수 없음</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">월 정액 외에 낙찰 금액에 비례한 수수료를 받지 않습니다. 많이 낙찰받을수록 이득입니다.</p>
        </div>
        <div className="card p-6">
          <p className="font-bold">여러 사업장·면허 운영 중이신가요?</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">법인 여러 개나 지사별 조건을 따로 관리해야 한다면 맞춤 견적을 안내해 드립니다. <Link href="/apply" className="font-semibold text-mint-600">문의하기 →</Link></p>
        </div>
      </div>
    </div>
  );
}
