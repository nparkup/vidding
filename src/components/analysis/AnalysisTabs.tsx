import Link from "next/link";
import { ScrollRow } from "@/components/ScrollRow";

const TABS = [
  { href: "/awards", key: "awards", label: "최근 낙찰 결과" },
  { href: "/analysis/agency", key: "agency", label: "발주처 분석" },
  { href: "/analysis/industry", key: "industry", label: "업종별 분석" },
  { href: "/analysis/rival", key: "rival", label: "경쟁사 투찰 성향" },
  { href: "/analysis/mine", key: "mine", label: "우리 회사 진단" },
  { href: "/prespecs", key: "prespec", label: "사전규격 미리보기" },
  { href: "/contracts", key: "contract", label: "계약현황" },
];

/** 입찰데이터 분석 메뉴의 하위 탭 */
export function AnalysisTabs({ active }: { active: string }) {
  return (
    <ScrollRow as="nav" className="container-x mt-6 flex gap-1" aria-label="입찰데이터 분석">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${t.key === active ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </ScrollRow>
  );
}
