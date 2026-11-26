import { Brand } from "@/components/BrandText";
import Link from "next/link";
import { ConstructionArt, ITArt, SupplyArt } from "@/components/art/Sectors";

export type Biz = "용역" | "공사" | "물품";
export type SourceKey = "g2b" | "apt" | "nuri";

export interface BizSummary {
  biz: Biz;
  /** 세 출처를 합친 진행 중 공고 수 */
  n: number;
  /** 출처별 진행 중 공고 수 */
  by: Record<SourceKey, number>;
  /** 세 출처를 합친 업종별 공고 수 (많은 순) */
  cats: { c: string; n: number }[];
}

/** 출처 표기·색 (나라장터 진한 남색, 공동주택 민트, 누리장터 하늘색) */
export const SOURCES: { key: SourceKey; label: string; desc: string; href: string; dot: string }[] = [
  { key: "g2b", label: "나라장터 공고", desc: "관공서·공공기관", href: "/bids", dot: "bg-ink-700" },
  { key: "apt", label: "공동주택 입찰 공고 K-apt", desc: "아파트 관리주체·입주자대표회의", href: "/apt-bids", dot: "bg-mint" },
  { key: "nuri", label: "누리장터 공고", desc: "민간 기업·조합·법인", href: "/nuri-bids", dot: "bg-sky-400" },
];

const BIZ_INFO: Record<Biz, { d: string; tone: string; Art: typeof ITArt }> = {
  용역: { d: "청소·경비·시설관리, 아파트 위탁관리, IT, 설계·감리, 연구, 행사 등", tone: "from-mint-50", Art: ITArt },
  공사: { d: "건축·토목, 전기·통신, 소방·기계설비, 조경, 공동주택 보수 공사", tone: "from-sky-100", Art: ConstructionArt },
  물품: { d: "의료·의약품, 급식 식자재, 전산장비, 관급자재 등 구매", tone: "from-amber-100", Art: SupplyArt },
};

/** 출처별 비율 막대 */
function SplitBar({ by, total, className = "" }: { by: Record<SourceKey, number>; total: number; className?: string }) {
  return (
    <div className={`flex h-2 w-full overflow-hidden rounded-full bg-ink-100 ${className}`} role="img" aria-label={SOURCES.map((s) => `${s.label} ${by[s.key].toLocaleString()}건`).join(", ")}>
      {total > 0 && SOURCES.map((s) => by[s.key] > 0 && (
        <span key={s.key} className={`${s.dot} h-full`} style={{ width: `${(by[s.key] / total) * 100}%`, minWidth: 3 }} />
      ))}
    </div>
  );
}

/**
 * 메인 업종 섹션: 나라장터·공동주택 입찰 공고 K-apt·누리장터 공고를 한 덩어리로 묶어
 * 용역·공사·물품별 진행 중 공고 수와 업종을 보여 준다. 출처는 막대와 숫자로만 나눠 보인다.
 */
export function AllIndustries({ total, by, groups, aptWithPrior }: { total: number; by: Record<SourceKey, number>; groups: BizSummary[]; aptWithPrior: number }) {
  return (
    <section className="container-x pt-28">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h2 className="h-section">용역·공사·물품,<br /> 모든 업종을 한 화면에서 봅니다.</h2>
        <p className="max-w-md text-ink-500"><Brand tail="파인더" />가 나라장터, 공동주택 입찰 공고 K-apt, 누리장터 공고를 함께 받아 같은 업종 기준으로 나누고, 귀사가 참가할 수 있는 공고만 골라 드립니다.</p>
      </div>

      {/* 합계와 출처 구성 */}
      <div className="card mt-10 grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-500">지금 진행 중인 공고</p>
          <p className="mt-1 text-4xl font-extrabold tracking-[-0.03em] tabular-nums sm:text-5xl">{total.toLocaleString()}<span className="ml-1 text-lg font-bold text-ink-400">건</span></p>
        </div>
        <div className="min-w-0">
          <SplitBar by={by} total={total} className="h-3" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {SOURCES.map((s) => (
              <li key={s.key} className="min-w-0">
                <Link href={s.href} className="group block">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink-700 group-hover:text-mint-600">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
                    <span className="min-w-0">{s.label}</span>
                  </span>
                  <span className="mt-1 flex items-baseline justify-between gap-2 pl-[18px]">
                    <span className="text-xs text-ink-400">{s.desc}</span>
                    <b className="shrink-0 tabular-nums text-ink">{by[s.key].toLocaleString()}건</b>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 업무 구분별 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {groups.map(({ biz, n, by: b, cats }) => {
          const { Art, d, tone } = BIZ_INFO[biz];
          return (
            <div key={biz} className={`card flex min-w-0 flex-col overflow-hidden bg-gradient-to-b ${tone} to-white to-40% p-5 sm:p-6`}>
              <Art className="mx-auto -mt-2 mb-3 h-32 w-auto" />
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/bids?biz=${encodeURIComponent(biz)}`} className="text-2xl font-extrabold hover:text-mint-600">{biz}</Link>
                <span className="text-sm font-bold text-ink-500">공고 <span className="tabular-nums text-ink">{n.toLocaleString()}</span>건</span>
              </div>
              <p className="mt-1.5 text-sm text-ink-500 lg:min-h-10">{d}</p>
              <SplitBar by={b} total={n} className="mt-4" />
              <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                {SOURCES.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
                    <dt>{s.key === "g2b" ? "나라장터" : s.key === "apt" ? "공동주택" : "누리장터"}</dt>
                    <dd className="font-bold tabular-nums text-ink-700">{b[s.key].toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-5 flex flex-wrap gap-1.5">
                {cats.map(({ c, n: cn }) => (
                  <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-700">
                    {c}<span className="text-xs font-bold tabular-nums text-ink-300">{cn.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          공동주택 입찰공고 중 <b className="tabular-nums text-ink">{aptWithPrior.toLocaleString()}건</b>에는 같은 단지의 직전 낙찰·수의계약 금액을 함께 붙여 드립니다.
        </p>
        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
          <Link href="/bids" className="btn-primary">공고 검색</Link>
          <Link href="/premium" className="btn-ghost">입찰 예측 보기</Link>
        </div>
      </div>
    </section>
  );
}
