import Link from "next/link";

const TABS = [
  { href: "/analysis/agency", key: "agency", label: "발주처 분석" },
  { href: "/analysis/rival", key: "rival", label: "경쟁사 투찰 성향" },
  { href: "/analysis/mine", key: "mine", label: "우리 회사 진단" },
  { href: "/prespecs", key: "prespec", label: "사전규격 미리보기" },
];

/** 입찰 분석 메뉴의 하위 탭 */
export function AnalysisTabs({ active }: { active: string }) {
  return (
    <nav className="container-x mt-6 flex gap-1 overflow-x-auto" aria-label="입찰 분석">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${t.key === active ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
