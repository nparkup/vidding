import Link from "next/link";
import { EmailPreview } from "@/components/EmailPreview";
import { MatchDemo } from "@/components/MatchDemo";
import { GradeBadge, ScoreBar } from "@/components/Badges";
import { evaluate } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { won } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { SEED_CLIENTS } from "@/lib/mock/seed";
import { getBids } from "@/lib/store";

export const dynamic = "force-dynamic";

const SERVICES = [
  { t: "매일 아침 맞춤 공고 요약 이메일", d: "영업일 오전 7시, 오늘 볼 공고만 골라 메일로 보내 드립니다. 나라장터에 접속할 필요가 없습니다.", tag: "매일" },
  { t: "면허·지역·금액 1차 선별", d: "보유 면허, 참가 가능 지역, 수행 가능 규모가 안 맞는 공고는 처음부터 걸러냅니다.", tag: "자동" },
  { t: "참가조건·마감일 정리", d: "지역제한, 중소기업 제한, 공동도급, 현장설명회, 낙찰하한율까지 한 장으로 요약합니다.", tag: "공고별" },
  { t: "제출서류 체크리스트", d: "계약방법별로 필요한 서류와 발급처, 유효기간 주의사항을 체크리스트로 드립니다.", tag: "관심 공고" },
  { t: "주 1회 주요 공고 분석보고서", d: "이번 주 꼭 볼 공고, 발주 동향, 입찰 가능성 순위를 정리한 보고서를 매주 보내 드립니다.", tag: "매주" },
];

const COMPARE = [
  ["공고 탐색", "직접 키워드 검색, 수백 건 확인", "조건에 맞는 공고만 매일 배달"],
  ["업종 범위", "공사·물품·용역 전 업종", "청소·시설관리·경비·방역 전문"],
  ["참가 가능 여부", "공고문을 열어 직접 판단", "면허·지역·규모 자동 판정"],
  ["준비 서류", "공고문·규정을 직접 해석", "계약방법별 체크리스트 제공"],
  ["입찰 판단", "투찰가 분석 위주", "가능성 점수 + 준비 기간 + 경쟁 강도"],
  ["담당 인력", "고객사 직원이 직접", "입찰파트너 전담 매니저"],
];

const FAQ = [
  { q: "프로그램을 설치하거나 매일 접속해야 하나요?", a: "아닙니다. 조건만 한 번 등록하시면 영업일마다 이메일로 받아 보시면 됩니다. 필요할 때만 웹에서 공고 분석을 열어보시면 됩니다." },
  { q: "공고 데이터는 어디서 오나요?", a: "조달청 나라장터가 공공데이터포털로 공개하는 입찰공고·낙찰·사전규격 정보를 매일 수집해 분석합니다." },
  { q: "입찰 가능성 점수는 어떻게 계산하나요?", a: "면허·지역·규모 적합 여부를 먼저 판정한 뒤, 과거 유사 공고의 참여업체 수, 귀사 실적 대비 규모, 남은 준비 기간을 반영해 100점 만점으로 산출합니다." },
  { q: "입찰 대리 투찰도 해주나요?", a: "투찰은 관련 법령상 귀사가 직접 하셔야 합니다. 입찰파트너는 공고 발굴, 조건 검토, 서류 준비 가이드를 대신해 드립니다." },
];

export default async function Home() {
  const bids = await getBids();
  const sampleClient = SEED_CLIENTS[0];
  const digest = buildDigest(sampleClient, bids);
  const featured = digest.recommended[0]?.bid ?? bids[0];
  const featuredEval = evaluate(featured, sampleClient);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-mint-100/70 blur-3xl" />
        <div className="container-x relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="chip border-mint-100 bg-mint-50 text-mint-600">청소 · 시설관리 · 경비 · 방역 업체 전용</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-[56px]">
              입찰 공고,
              <br />
              이제 <span className="text-mint">찾지 말고</span>
              <br />
              받아보세요.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-500">
              입찰파트너가 귀사의 입찰 담당자가 되어 드립니다. 면허·지역·규모에 맞는 나라장터 공고를 매일 골라
              <b className="text-ink"> 참가조건, 제출서류, 입찰 가능성</b>까지 정리해 아침마다 전달합니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/apply" className="btn-mint text-base">무료 맞춤 진단 받기</Link>
              <Link href="/bids" className="btn-ghost text-base">오늘의 공고 둘러보기</Link>
            </div>
            <p className="mt-4 text-sm text-ink-300">첫 2주 무료 · 카드 등록 없음 · 조건 등록 3분</p>
          </div>
          <div className="relative">
            <div className="absolute -left-6 top-10 hidden rotate-[-4deg] rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white shadow-card lg:block">
              매일 07:00 자동 발송
            </div>
            <EmailPreview digest={digest} compact />
          </div>
        </div>
      </section>

      {/* STRIP */}
      <section className="border-y border-ink-100 bg-white">
        <div className="container-x grid grid-cols-2 gap-6 py-8 text-center md:grid-cols-4">
          {[
            ["5단계", "면허·지역·규모·경쟁·기간 선별"],
            ["07:00", "영업일 아침 정시 발송"],
            ["17개", "시·도 지역제한 자동 판정"],
            ["4종", "나라장터 공공데이터 연동"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-2xl font-extrabold sm:text-3xl">{k}</p>
              <p className="mt-1 text-sm text-ink-500">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROBLEM */}
      <section className="container-x py-20">
        <p className="eyebrow">왜 입찰파트너인가요</p>
        <h2 className="h-section mt-2">입찰정보 사이트는 많은데,<br className="sm:hidden" /> 왜 여전히 힘들까요?</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["너무 많은 공고", "하루에도 수백 건의 용역 공고가 올라옵니다. 그중 우리 회사가 참가할 수 있는 건 몇 건 되지 않습니다."],
            ["읽기 어려운 공고문", "지역제한, 면허, 중소기업 제한, 적격심사 기준까지 공고문과 첨부파일을 하나하나 열어봐야 합니다."],
            ["담당자가 없는 현실", "현장 관리로 바쁜 중소업체는 입찰만 전담할 사람이 없어 좋은 공고를 놓치기 일쑤입니다."],
          ].map(([t, d], i) => (
            <div key={t} className="card p-6">
              <span className="text-sm font-bold text-coral">0{i + 1}</span>
              <p className="mt-3 text-lg font-bold">{t}</p>
              <p className="mt-2 leading-relaxed text-ink-500">{d}</p>
            </div>
          ))}
        </div>

        <div className="card mt-10 overflow-x-auto">
          <table className="table-x min-w-[640px]">
            <thead>
              <tr>
                <th className="w-40">비교 항목</th>
                <th>일반 입찰정보 포털</th>
                <th className="bg-mint-50 text-mint-600">입찰파트너</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([k, a, b]) => (
                <tr key={k}>
                  <td className="font-semibold">{k}</td>
                  <td className="text-ink-500">{a}</td>
                  <td className="bg-mint-50/60 font-semibold">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* DEMO */}
      <section className="bg-ink py-20 text-white">
        <div className="container-x">
          <p className="text-sm font-semibold text-mint">30초 체험</p>
          <h2 className="h-section mt-2">우리 회사 조건이면, 지금 몇 건이나 될까요?</h2>
          <p className="mt-3 max-w-2xl text-ink-300">면허와 지역, 규모를 골라 보세요. 입찰파트너가 매일 하는 1차 선별을 그대로 체험할 수 있습니다.</p>
          <div className="mt-10 text-ink">
            <MatchDemo bids={bids} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="container-x py-20">
        <p className="eyebrow">포함된 서비스</p>
        <h2 className="h-section mt-2">찾고, 거르고, 정리하는 일은<br />저희가 합니다.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <div key={s.t} className={`card p-6 ${i === 0 ? "lg:row-span-2 lg:flex lg:flex-col" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-sm font-bold text-white">{i + 1}</span>
                <span className="chip">{s.tag}</span>
              </div>
              <p className="mt-4 text-lg font-bold">{s.t}</p>
              <p className="mt-2 leading-relaxed text-ink-500">{s.d}</p>
              {i === 0 && (
                <div className="mt-6 hidden flex-1 rounded-xl bg-paper p-4 text-sm lg:block">
                  <p className="font-semibold">오늘 아침 받은 메일</p>
                  <ul className="mt-3 space-y-2 text-ink-500">
                    {digest.recommended.slice(0, 4).map((r) => (
                      <li key={r.bid.id} className="flex justify-between gap-2">
                        <span className="truncate">{r.bid.title}</span>
                        <span className="shrink-0 font-semibold text-mint-600">{r.grade}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <Link href="/service" className="card flex flex-col justify-between bg-mint p-6 text-white transition hover:bg-mint-600">
            <p className="text-lg font-bold">서비스 자세히 보기</p>
            <p className="mt-6 text-sm opacity-90">공고 하나가 어떻게 분석되는지 확인해 보세요 →</p>
          </Link>
        </div>
      </section>

      {/* ANALYSIS PREVIEW */}
      <section className="bg-white py-20">
        <div className="container-x grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow">공고 분석 미리보기</p>
            <h2 className="h-section mt-2">들어갈지 말지,<br />숫자로 먼저 보여드립니다.</h2>
            <p className="mt-4 leading-relaxed text-ink-500">
              모든 추천 공고에는 입찰 가능성 점수가 붙습니다. 왜 이 점수인지 항목별로 설명하기 때문에, 회의 없이도 참가 여부를 빠르게 결정할 수 있습니다.
            </p>
            <Link href={`/bids/${featured.id}`} className="btn-primary mt-8">이 공고 전체 분석 보기</Link>
          </div>
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-ink-300">{featured.demandAgency}</p>
                <p className="mt-1 font-bold">{featured.title}</p>
                <p className="mt-1 text-sm text-ink-500">기초금액 {won(featured.baseAmount)} · {featured.contractMethod}</p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-extrabold text-mint">{featuredEval.score}</p>
                <GradeBadge grade={featuredEval.grade} />
              </div>
            </div>
            <ul className="mt-6 space-y-4">
              {featuredEval.factors.map((f) => (
                <li key={f.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="font-semibold">{f.label}</span>
                    <span className="text-ink-500">{f.note}</span>
                  </div>
                  <ScoreBar value={f.score} max={f.max} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="container-x py-20">
        <p className="eyebrow">이용 방법</p>
        <h2 className="h-section mt-2">3분 등록, 다음 날 아침부터.</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["조건 등록", "보유 면허, 영업 지역, 수행 가능한 용역 규모, 최근 실적을 알려 주세요."],
            ["매일 선별·분석", "나라장터 신규 공고를 수집해 조건에 맞는 공고만 고르고 참가조건·서류를 정리합니다."],
            ["받아보고 결정", "아침 메일로 확인하고, 관심 공고만 표시하면 서류 준비를 함께 도와드립니다."],
          ].map(([t, d], i) => (
            <li key={t} className="relative card p-6">
              <p className="text-5xl font-extrabold text-ink-100">{i + 1}</p>
              <p className="mt-2 text-lg font-bold">{t}</p>
              <p className="mt-2 leading-relaxed text-ink-500">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* PRICING TEASER */}
      <section className="container-x">
        <div className="card grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="eyebrow">투명한 요금</p>
            <p className="mt-2 text-2xl font-bold">입찰 담당자 한 명 인건비의 일부로.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {PLANS.map((p) => (
                <span key={p.id} className={`rounded-xl border px-4 py-2 text-sm ${p.highlight ? "border-mint bg-mint-50" : "border-ink-100"}`}>
                  <b>{p.name}</b> 월 {(p.price / 10000).toFixed(1).replace(/\.0$/, "")}만원
                </span>
              ))}
            </div>
          </div>
          <Link href="/pricing" className="btn-primary">요금제 비교</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-x py-20">
        <h2 className="h-section">자주 묻는 질문</h2>
        <div className="mt-8 divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
          {FAQ.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {f.q}
                <span className="ml-4 text-ink-300 transition group-open:rotate-45">＋</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-500">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-x">
        <div className="relative overflow-hidden rounded-3xl bg-mint p-10 text-white sm:p-14">
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/10" />
          <h2 className="text-3xl font-extrabold sm:text-4xl">내일 아침, 첫 맞춤 공고를 받아보세요.</h2>
          <p className="mt-3 max-w-xl opacity-90">조건을 알려주시면 담당 매니저가 지금 참가 가능한 공고 목록과 함께 무료 진단 결과를 보내 드립니다.</p>
          <Link href="/apply" className="btn mt-8 bg-white text-ink hover:bg-paper">무료 진단 신청</Link>
        </div>
      </section>
    </>
  );
}
