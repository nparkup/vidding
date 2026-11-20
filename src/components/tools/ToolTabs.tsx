import Link from "next/link";

const TABS = [
  { href: "/tools/joint", key: "joint", label: "공동도급 지분 계산기" },
  { href: "/tools/finance", key: "finance", label: "경영상태 평균비율" },
  { href: "/rates", key: "rates", label: "낙찰하한율·실적 기준표" },
];

/** 실무 도구 메뉴의 하위 탭 */
export function ToolTabs({ active }: { active: string }) {
  return (
    <nav className="container-x mt-6 flex gap-1 overflow-x-auto" aria-label="실무 도구">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${t.key === active ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
