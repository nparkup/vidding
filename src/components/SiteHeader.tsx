import Link from "next/link";
import { Logo } from "./Logo";

const NAV = [
  { href: "/service", label: "서비스" },
  { href: "/bids", label: "공고 검색" },
  { href: "/report/sample", label: "보고서 샘플" },
  { href: "/pricing", label: "요금제" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-paper/85 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-8 text-[15px] font-medium text-ink-500 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/apply" className="btn-mint btn-sm sm:px-4">
            무료 진단 받기
          </Link>
          <details className="relative md:hidden">
            <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-lg border border-ink-100 bg-white" aria-label="메뉴">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </summary>
            <div className="card absolute right-0 mt-2 w-48 p-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-paper">
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
