import type { Metadata } from "next";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PricingCards } from "@/components/PricingCards";
import { Price, TrialN } from "@/components/Cfg";

export const metadata: Metadata = { title: "요금제" };


type Cell = boolean | string | React.ReactNode;
interface Row { k: string; d?: string; v: [Cell, Cell, Cell, Cell] }

/** 비교표: 무료 체험과 월간 이용권 3종. 이용권끼리는 공고 예측 건수만 다르다 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "공고 분석",
    rows: [
      { k: "공고 예측", d: "공고 하나의 평가점수 예측·배점표 판독·낙찰 결과로 본 예측을 1건으로 셉니다. 나라장터·아파트 합산", v: [<>공고 <TrialN />건</>, <>월 <Price k="liteQuota" />건</>, <>월 <Price k="standardQuota" />건</>, "무제한"] },
      { k: "제출서류 체크리스트", d: "관심 공고 기준", v: [false, "무제한", "무제한", "무제한"] },
      { k: "입찰 가능성 점수·투찰 가이드", d: "6개 항목 100점 채점, S~C 등급", v: [false, true, true, true] },
    ],
  },
  {
    title: "공고 수집·선별",
    rows: [
      { k: "참가 가능 공고 목록", d: "조건을 넣으면 바로 확인", v: [true, true, true, true] },
      { k: "맞춤 공고 요약 이메일", d: "영업일 매일 아침", v: [false, true, true, true] },
      { k: "면허·지역·금액 1차 선별", d: "필수 조건이 안 맞는 공고는 미리 제외", v: [true, true, true, true] },
      { k: "사전규격·발주계획 선제 알림", d: "본공고 전 단계부터", v: [false, true, true, true] },
    ],
  },
  {
    title: "보고서",
    rows: [
      { k: "주요 공고 분석보고서", v: [false, "주 1회", "주 1회", "주 1회"] },
    ],
  },
];

const FAQ = [
  { q: "이용권은 무엇이 다른가요?", a: <>세 이용권 모두 기능은 같고, 한 달에 쓸 수 있는 공고 예측 건수만 다릅니다. 라이트는 월 <Price k="liteQuota" />건(월 <Price k="lite" />원), 스탠다드는 월 <Price k="standardQuota" />건(월 <Price k="standard" />원), 무제한은 건수 제한이 없습니다(월 <Price k="unlimited" />원).</> },
  { q: "공고 예측 건수는 어떻게 세나요?", a: "공고 하나를 골라 평가점수 예측·배점표 판독·낙찰 결과로 본 예측을 보면 1건입니다. 나라장터와 아파트 공고를 합쳐 세고, 이미 분석한 공고는 다시 열어도 차감되지 않습니다. 건수는 결제일마다 새로 채워지며, 남은 건수는 다음 달로 넘어가지 않습니다." },
  { q: "표시된 가격은 VAT 포함인가요?", a: "네. 모든 이용권 금액은 VAT 포함이며 사업자 1곳 기준입니다. 낙찰 금액에 비례한 성공보수 등 이용료 외 추가 수수료는 없습니다." },
  { q: "약정이나 해지 조건이 있나요?", a: "약정이 없습니다. 해지하시면 다음 달부터 결제되지 않고, 이미 결제한 달은 그달 끝까지 이용하실 수 있습니다. 남은 날짜만큼 나누어 돌려드리는 일할 환불은 하지 않습니다." },
  { q: "이용 중에 이용권을 바꿀 수 있나요?", a: "네. 바꾼 이용권은 다음 결제일부터 적용되고, 그때부터 바뀐 금액으로 결제됩니다. 이번 달 건수를 다 쓰셨다면 메일로 알려 주세요." },
  { q: "무료 체험은 어떻게 진행되나요?", a: <>입찰공고 <TrialN />건을 골라 평가점수 예측(나라장터·아파트), 배점표 판독, 낙찰 결과로 본 예측을 요금 없이 써 보실 수 있습니다. 나라장터와 아파트 공고를 합쳐 <TrialN />건이며, 이미 분석한 공고는 다시 열어도 차감되지 않습니다. 회원가입 때 넣은 사업자등록번호 하나에 한 번 드리며, 로그인 기능이 생기기 전까지는 사업자등록번호와 이용하신 브라우저를 기준으로 셉니다. 카드를 등록하지 않으므로 체험 뒤 자동으로 결제되지 않으며, 계속 이용할지는 그때 정하시면 됩니다.</> },
];

const cell = (v: Cell) => (v === true ? <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-mint-50 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <>
    <PageHero center eyebrow="요금제" title="입찰 담당자 채용보다 가볍게" lead={<>월간 이용권 월 <Price k="lite" />원부터 · VAT 포함 · 약정 없음 · 무료 체험 입찰공고 <TrialN />건</>} />
    <div className="container-x">
      <div className="relative z-10 -mt-6">
        <PricingCards />
        <p className="mt-3 text-center text-xs text-ink-400">세 이용권은 기능이 같고 한 달 공고 예측 건수만 다릅니다.<br />모두 매달 결제하는 월간 이용권입니다.</p>
      </div>

      <h2 className="mt-20 text-2xl font-extrabold tracking-tight">기능 한눈에 비교</h2>
      <div className="card mt-6 overflow-x-auto">
        <table className="table-x min-w-[560px]">
          <thead>
            <tr>
              <th>기능</th>
              <th className="w-[15%] text-center sm:w-auto">
                무료 체험
                <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400">공고 <TrialN />건</span>
              </th>
              {([["lite", "라이트"], ["standard", "스탠다드"], ["unlimited", "무제한"]] as const).map(([k, n]) => (
                <th key={k} className="w-[15%] text-center sm:w-auto">
                  {n}
                  <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400 tabular-nums"><Price k={k} />원</span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr><td colSpan={5} className="bg-paper py-2 text-xs font-bold text-ink-500">{g.title}</td></tr>
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
              {(["lite", "standard", "unlimited"] as const).map((k) => (
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

      <section className="mx-auto mt-20 max-w-3xl">
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
