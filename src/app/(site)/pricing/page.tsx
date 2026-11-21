import type { Metadata } from "next";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { PricingCards } from "@/components/PricingCards";
import { Price, TrialN } from "@/components/Cfg";

export const metadata: Metadata = { title: "요금제" };

const CONTACT = "hello@ipchalmatelab.kr";

type Cell = boolean | string | React.ReactNode;
interface Row { k: string; d?: string; v: [Cell, Cell] }

/** 비교표: 무료 체험과 요금제(연간·월간 기능 같음). 수량이 다른 항목은 수량을 그대로 적는다 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "공고 수집·선별",
    rows: [
      { k: "참가 가능 공고 목록", d: "조건을 넣으면 바로 확인", v: [true, true] },
      { k: "맞춤 공고 요약 이메일", d: "영업일 매일 아침", v: [false, true] },
      { k: "면허·지역·금액 1차 선별", d: "필수 조건이 안 맞는 공고는 미리 제외", v: [true, true] },
      { k: "사전규격·발주계획 선제 알림", d: "본공고 전 단계부터", v: [false, true] },
    ],
  },
  {
    title: "공고 분석",
    rows: [
      { k: "평가점수 예측", d: "적격심사·협상계약. 첨부 공고서·규격서 판독, 기업정보와 낙찰 10년치 유사 실적으로 항목별 예상 점수", v: [<>공고 <TrialN />건</>, "무제한"] },
      { k: "배점표 판독·낙찰 결과로 본 예측", v: [<>공고 <TrialN />건</>, "무제한"] },
      { k: "제출서류 체크리스트", d: "관심 공고 기준", v: [false, "무제한"] },
      { k: "입찰 가능성 점수·투찰 가이드", d: "6개 항목 100점 채점, S~C 등급", v: [false, true] },
    ],
  },
  {
    title: "보고서",
    rows: [
      { k: "주요 공고 분석보고서", v: [false, "주 1회"] },
    ],
  },
];

/** 분석에 쓰는 데이터 (낙찰 저장소 실측치, 2026-11 기준) */
const DATA = [
  { n: "305만 건", t: "낙찰 결과", d: "최근 10년치 용역·공사·물품" },
  { n: "436만 건", t: "입찰공고", d: "같은 기간 나라장터 공고" },
  { n: "하루 3회", t: "공고 갱신", d: "영업일 06:40 · 11:40 · 16:40" },
];

const FAQ = [
  { q: "연간 결제는 실제로 얼마가 결제되나요?", a: <>연간 결제는 월 <Price k="annualMonthly" />원으로 1년 치 <Price k="annualCharge" />원이 결제됩니다. 월간 결제로 1년을 쓰실 때(<Price k="monthly12" />원)보다 <Price k="saving" />원(약 <Price k="savingPct" />%) 적습니다.</> },
  { q: "표시된 가격은 VAT 포함인가요?", a: <>네. 월간 <Price k="monthly" />원, 연간 <Price k="annualCharge" />원 모두 VAT 포함 금액이며 사업자 1곳 기준입니다. 낙찰 금액에 비례한 성공보수 등 이용료 외 추가 수수료는 없습니다.</> },
  { q: "연간 결제 후 중간에 해지하면 어떻게 환불되나요?", a: <>쓰신 기간을 결제하신 가격(월 <Price k="annualMonthly" />원) 기준으로 일할 계산하고, 나머지를 돌려 드립니다. 정가(월 <Price k="monthly" />원)로 다시 계산해 할인분을 빼는 위약금은 없습니다. 예를 들어 정확히 3개월을 쓰고 해지하시면 <Price k="used3" />원을 뺀 <Price k="refund3" />원을 환불합니다.</> },
  { q: "월간 결제는 약정이 있나요?", a: "약정이 없습니다. 해지하시면 다음 달부터 결제되지 않고, 이미 결제한 달은 그달 끝까지 이용하실 수 있습니다. 연간과 월간은 기능이 같고 결제 주기만 다릅니다." },
  { q: "무료 체험은 어떻게 진행되나요?", a: <>입찰공고 <TrialN />건을 골라 평가점수 예측(나라장터·아파트), 배점표 판독, 낙찰 결과로 본 예측을 요금 없이 써 보실 수 있습니다. 나라장터와 아파트 공고를 합쳐 <TrialN />건이며, 이미 분석한 공고는 다시 열어도 차감되지 않습니다. 회원가입 때 넣은 사업자등록번호 하나에 한 번 드리며, 로그인 기능이 생기기 전까지는 사업자등록번호와 이용하신 브라우저를 기준으로 셉니다. 카드를 등록하지 않으므로 체험 뒤 자동으로 결제되지 않으며, 계속 이용할지는 그때 정하시면 됩니다.</> },
];

const cell = (v: Cell) => (v === true ? <span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-mint-50 text-mint-600"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span> : v === false ? <span className="text-ink-100">—</span> : <span className="text-sm font-semibold">{v}</span>);

export default function Pricing() {
  return (
    <>
    <PageHero center eyebrow="요금제" title="입찰 담당자 채용보다 가볍게" lead={<>연간 월 <Price k="annualMonthly" />원 · 월간 월 <Price k="monthly" />원 · VAT 포함 · 무료 체험 입찰공고 <TrialN />건</>} />
    <div className="container-x">
      <div className="relative z-10 -mt-6 mx-auto max-w-4xl">
        <PricingCards />
        <p className="mt-3 text-center text-xs text-ink-400">연간과 월간은 기능이 같고 결제 주기만 다릅니다. 연간 결제 중간 해지 시 쓴 기간은 결제한 가격 기준으로 일할 계산해 환불합니다.</p>
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
      <p className="mt-2 text-xs text-ink-400">분석은 모두 같은 데이터를 씁니다. 조달청 나라장터(공공데이터포털) 기준이며 매일 늘어납니다.</p>

      <h2 className="mt-20 text-2xl font-extrabold tracking-tight">기능 한눈에 비교</h2>
      <div className="card mt-6 overflow-x-auto">
        <table className="table-x sm:min-w-[560px]">
          <thead>
            <tr>
              <th>기능</th>
              <th className="w-[24%] text-center sm:w-auto">
                무료 체험
                <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400">공고 <TrialN />건</span>
              </th>
              <th className="w-[24%] text-center sm:w-auto">
                요금제
                <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-ink-400 tabular-nums">월 <Price k="annualMonthly" />원~</span>
              </th>
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr><td colSpan={3} className="bg-paper py-2 text-xs font-bold text-ink-500">{g.title}</td></tr>
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
              <td className="text-center"><Link href="/apply?plan=annual" className="inline-block rounded-full bg-mint px-2.5 py-1.5 text-xs font-bold text-white sm:px-4">시작</Link></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-7">
          <p className="text-lg font-bold">낙찰 성공보수 없음</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">이용료 외에 낙찰 금액에 비례한 수수료를 받지 않습니다. 많이 낙찰받을수록 이득입니다.</p>
        </div>
        <div className="card p-7">
          <p className="text-lg font-bold">중간 해지도 결제한 가격 기준 환불</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">연간 결제 후 해지하면 쓴 기간을 월 <Price k="annualMonthly" />원 기준으로 일할 계산하고 나머지를 돌려 드립니다. 정가로 다시 계산해 할인분을 빼지 않습니다.</p>
        </div>
        <div className="card p-7 md:col-span-2">
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
