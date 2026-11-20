import Link from "next/link";

/** 공고 검색의 출처 탭: 나라장터 공고 / 아파트(공동주택) 공고 */
export function BidSourceTabs({ active }: { active: "g2b" | "apt" }) {
  const tabs = [
    { key: "g2b", href: "/bids", label: "나라장터 공고" },
    { key: "apt", href: "/apt-bids", label: "아파트 공고" },
  ] as const;
  return (
    <nav className="mt-6 flex gap-1 overflow-x-auto" aria-label="공고 출처">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${t.key === active ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
