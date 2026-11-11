"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "대시보드", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/admin/clients", label: "고객사", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0" },
  { href: "/admin/bids", label: "공고 수집·선별", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/admin/reports", label: "주간 보고서", icon: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { href: "/admin/inquiries", label: "상담 신청", icon: "M4 5h16v11H8l-4 4z" },
  { href: "/admin/settings", label: "설정·API", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12h2M3 12h2M12 3v2M12 19v2" },
];

export function AdminNav({ badge }: { badge: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white"}`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={it.icon} /></svg>
            <span>{it.label}</span>
            {badge[it.href] ? <span className="ml-auto rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">{badge[it.href]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
