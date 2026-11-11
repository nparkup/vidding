"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/clients", label: "고객사" },
  { href: "/admin/bids", label: "공고 수집·선별" },
  { href: "/admin/mail", label: "메일 발송" },
  { href: "/admin/reports", label: "주간 보고서" },
  { href: "/admin/inquiries", label: "상담 신청" },
  { href: "/admin/settings", label: "설정·API" },
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
            <span>{it.label}</span>
            {badge[it.href] ? <span className="ml-auto rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">{badge[it.href]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
