import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/service", label: "서비스" },
  { href: "/bids", label: "공고 검색" },
  { href: "/premium", label: "평가점수 예측" },
  { href: "/report/sample", label: "보고서 샘플" },
  { href: "/pricing", label: "요금제" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/85 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 text-[15px] font-semibold text-ink-500 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-4 py-2 transition hover:bg-paper hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/bids" className="hidden px-3 text-sm font-semibold text-ink-500 hover:text-ink lg:block">오늘의 공고</Link>
          <Link href="/apply" className="btn-mint btn-sm sm:px-4">
            2주 무료 체험
          </Link>
          <details className="relative md:hidden">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full border border-ink-100 bg-white" aria-label="메뉴">
              <Menu className="h-5 w-5" />
            </summary>
            <div className="card absolute right-0 mt-2 w-52 p-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-paper">
                  {n.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
