import Link from "next/link";
import { ArrowRight, Menu } from "lucide-react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/service", label: "서비스" },
  { href: "/bids", label: "공고 검색" },
  { href: "/report/sample", label: "보고서 샘플" },
  { href: "/pricing", label: "요금제" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/70">
      <div className="container-x flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-1 rounded-full border border-ink-100 bg-white/70 p-1 text-[15px] font-medium text-ink-500 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-4 py-1.5 transition hover:bg-paper hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/apply" className="btn-primary btn-sm sm:px-4">
            무료 진단 받기 <ArrowRight className="hidden h-4 w-4 sm:block" />
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
