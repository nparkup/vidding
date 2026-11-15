"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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
  const nav = useRef<HTMLElement>(null);
  // 모바일에서는 메뉴가 가로로 스크롤되므로, 현재 메뉴가 잘려 보이지 않게 가운데로 옮긴다
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (!nav.current || !el || nav.current.scrollWidth <= nav.current.clientWidth) return;
    nav.current.scrollLeft = el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2;
  }, [path]);
  return (
    <nav ref={nav} className="relative -mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
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
