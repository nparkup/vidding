import Link from "next/link";

type Source = "g2b" | "apt" | "nuri";

/**
 * 공고 검색의 출처 선택: 나라장터 공고 / 아파트(공동주택) 공고 / 민간(누리장터) 공고.
 * 어떤 공고를 보고 있는지, 다른 쪽에는 어떤 공고가 몇 건 있는지 카드로 보여 준다.
 */
export function BidSourceTabs({ active, counts }: { active: Source; counts: Record<Source, number> }) {
  const tabs = [
    { key: "g2b", href: "/bids", label: "나라장터 공고", desc: "관공서·공공기관 용역·공사·물품" },
    { key: "apt", href: "/apt-bids", label: "공동주택 입찰공고", desc: "공동주택 청소·경비·소독·위탁관리" },
    { key: "nuri", href: "/nuri-bids", label: "민간 공고", desc: "민간 기업·조합·법인 입찰" },
  ] as const;
  return (
    <nav className="mt-6" aria-label="공고 출처 선택">
      <p className="mb-2 text-sm font-semibold text-ink-500">어떤 공고를 찾으세요?</p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`relative min-w-0 rounded-2xl border-2 p-3 transition sm:p-5 ${on ? "border-mint bg-mint-50" : "border-ink-100 bg-white hover:border-ink-300"}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className={`min-w-0 text-[15px] font-extrabold leading-tight sm:text-lg ${on ? "text-ink" : "text-ink-500"}`}>{t.label}</span>
                {/* 선택 표시 (라디오 버튼 모양) */}
                <span className={`mt-0.5 hidden h-5 w-5 shrink-0 place-items-center rounded-full border-2 sm:grid ${on ? "border-mint" : "border-ink-200"}`} aria-hidden>
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-mint" />}
                </span>
              </span>
              <span className="mt-1 hidden text-xs text-ink-500 sm:block sm:text-sm">{t.desc}</span>
              <span className="mt-2 flex flex-wrap items-baseline gap-x-2 sm:mt-3">
                <b className={`text-base tabular-nums sm:text-2xl ${on ? "text-mint-600" : "text-ink"}`}>{counts[t.key].toLocaleString()}건</b>
                <span className="text-xs text-ink-400">진행 중</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
