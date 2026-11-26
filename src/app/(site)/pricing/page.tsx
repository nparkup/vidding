import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PricingCards } from "@/components/PricingCards";
import { Price, TrialN } from "@/components/Cfg";

export const metadata: Metadata = { title: "요금제" };


type Cell = boolean | string | React.ReactNode;
interface Row { k: string; d?: string; v: [Cell, Cell, Cell] }

/** 비교표: 무료 체험과 월간 이용권 2종(라이트·스탠다드). 이용권끼리는 공고 예측 건수만 다르다 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "공고 분석",
    rows: [
      { k: "공고 예측", d: "공고 하나의 입찰점수 예측·배점표 판독·낙찰 결과로 본 예측을 1건으로 셉니다. 나라장터·공동주택 합산", v: [<>공고 <TrialN />건</>, <>월 <Price k="liteQuota" />건</>, <>월 <Price k="standardQuota" />건</>] },
      { k: "제출 서류 목록", d: "관심 공고 기준", v: [false, "제한 없음", "제한 없음"] },
      { k: "입찰 가능성 점수·투찰 가이드", d: "항목별 100점 평가, S~C 등급", v: [false, true, true] },
    ],
  },
  {
    title: "공고 수집·선별",
    rows: [
      { k: "참가 가능 공고 목록", d: "조건을 넣으면 바로 확인", v: [true, true, true] },
      { k: "맞춤 공고 요약 이메일", d: "영업일 매일 아침", v: [false, true, true] },
      { k: "면허·지역·금액 1차 선별", d: "필수 조건이 안 맞는 공고는 미리 제외", v: [true, true, true] },
      { k: "사전규격·발주계획 선제 알림", d: "본공고 전 단계부터", v: [false, true, true] },
    ],
  },
  {
    title: "보고서",
    rows: [
      { k: "주요 공고 분석보고서", v: [false, "주 1회", "주 1회"] },
    ],
  },
];


const cell = (v: Cell) => (v === true ? <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-mint-50 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <>
    <PageHero center title={<>비드매트릭스의 놀라운<br />입찰점수 예측을 경험해보세요!</>} lead={<>가입하면 바로 입찰공고 <TrialN />건을 무료로 분석해 볼 수 있습니다.<br />이후에는 필요한 공고 예측 건수에 맞춰 월간 이용권을 고르세요.<br />VAT 포함 · 약정 없음 · 언제든 해지</>} />
    <div className="container-x">
      <div className="relative z-10 -mt-6">
        <PricingCards />
        <p className="mt-3 text-center text-xs text-ink-400">두 이용권은 기능이 같고 한 달 공고 예측 건수만 다릅니다.<br />모두 매달 결제하는 월간 이용권입니다.</p>
      </div>

      <h2 className="mt-20 text-2xl font-extrabold tracking-tight">기능 한눈에 비교</h2>
      <div className="card mt-6 overflow-x-auto">
        <table className="table-x min-w-[340px]">
          <thead>
            <tr>
              <th>기능</th>
              <th className="w-[15%] text-center sm:w-auto">
                무료 체험
                <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400">공고 <TrialN />건</span>
              </th>
              {([["lite", "라이트"], ["standard", "스탠다드"]] as const).map(([k, n]) => (
                <th key={k} className="w-[15%] text-center sm:w-auto">
                  {n}
                  <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400 tabular-nums"><Price k={k} />원</span>
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
              <td className="text-xs text-ink-400">무료 체험 공고 <TrialN />건 · 카드 등록 없음</td>
              <td className="text-center"><Link href="/apply" className="inline-block rounded-full border border-ink-100 px-2.5 py-1.5 text-xs font-bold text-ink sm:px-4">체험</Link></td>
              {(["lite", "standard"] as const).map((k) => (
                <td key={k} className="text-center"><Link href={`/apply?plan=${k}`} className={`inline-block rounded-full px-2.5 py-1.5 text-xs font-bold sm:px-4 bg-mint text-white`}>시작</Link></td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-7">
          <p className="text-lg font-bold">낙찰 성공보수 없음</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">이용료 외에 낙찰 금액에 비례한 수수료를 받지 않습니다.<br />많이 낙찰받을수록 이득입니다.</p>
        </div>
        <div className="card p-7">
          <p className="text-lg font-bold">약정 없는 월간 이용권</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">원하는 달까지만 쓰시면 됩니다.<br />해지하면 다음 달부터 결제되지 않고, 이미 결제한 달은 그달 끝까지 이용하실 수 있습니다.</p>
        </div>
      </div>

    </div>
    </>
  );
}
