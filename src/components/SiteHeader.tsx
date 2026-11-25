"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { useMyboxOn } from "@/lib/useMyboxOn";
import { useAccount } from "@/lib/account";
import { hardGo } from "@/lib/hardGo";

type Item = { href: string; label: string; desc: string; /** 관리자 화면에서 서류함을 켰을 때만 */ mybox?: boolean };
type Entry = { label: string; href: string } | { label: string; items: Item[] };

/** 상단 메뉴. 하위 화면이 많은 메뉴는 묶어서 펼침 메뉴로 보여 준다 */
export const NAV: Entry[] = [
  { label: "서비스", href: "/service" },
  {
    label: "공고 찾기",
    items: [
      { href: "/bids", label: "나라장터 공고", desc: "나라장터 용역·공사·물품 전 업종" },
      { href: "/apt-bids", label: "아파트 공고", desc: "아파트 청소·경비·위탁관리 입찰" },
      { href: "/nuri-bids", label: "민간 공고", desc: "누리장터 민간 기업·조합·법인 입찰" },
      { href: "/changes", label: "정정·취소 공고", desc: "바뀌거나 취소된 공고" },
    ],
  },
  {
    label: "입찰 분석",
    items: [
      { href: "/awards", label: "최근 낙찰 결과", desc: "최근 한 달 최종낙찰·개찰 순위" },
      { href: "/analysis/agency", label: "발주처 분석", desc: "수요기관별 낙찰률·사정율·주요 낙찰업체" },
      { href: "/analysis/industry", label: "업종별 분석", desc: "업종별 낙찰률 추이·주요 발주기관·낙찰업체" },
      { href: "/analysis/rival", label: "경쟁사 투찰 성향", desc: "경쟁사 사정율·주요 발주처" },
      { href: "/analysis/mine", label: "우리 회사 진단", desc: "우리 회사 낙찰 기록으로 투찰 습관 점검" },
      { href: "/plans", label: "발주계획", desc: "기관이 미리 올린 발주 예정 사업" },
      { href: "/prespecs", label: "사전규격 미리보기", desc: "본공고 전에 공개된 규격" },
      { href: "/contracts", label: "계약현황", desc: "최근 2주 계약업체·금액·기간" },
      { href: "/mybox", label: "내 서류함", desc: "담아 둔 관심공고와 제출서류", mybox: true },
    ],
  },
  {
    label: "평가점수 예측",
    items: [
      { href: "/premium", label: "나라장터 예측", desc: "적격심사·협상 예상 평가점수와 투찰률" },
      { href: "/premium/apt", label: "아파트 예측", desc: "아파트 청소·경비 공고 예상 낙찰금액" },
      { href: "/premium/nuri", label: "민간 예측", desc: "누리장터 민간 공고 예상 평가점수" },
    ],
  },
  { label: "요금제", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
];

const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
// 나라장터 예측(/premium)은 아래에 아파트 예측(/premium/apt)이 있어 같은 주소일 때만 켠다
const isOn = (path: string, href: string) => (href === "/premium" ? path === href : href === "/bids" ? path === "/bids" || path.startsWith("/bids/") : path === href || path.startsWith(`${href}/`));

export function SiteHeader() {
  const myboxOn = useMyboxOn();
  const acc = useAccount();
  const loggedIn = acc.status === "in";
  const nav = NAV.map((e) => ("items" in e ? { ...e, items: e.items.filter((i) => !i.mybox || myboxOn) } : e));
  const path = clean(usePathname() || "/");
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  /**
   * 메뉴에서 마지막으로 누른 화면. 그 화면을 보고 있을 때만 메뉴를 선택된 것처럼 표시한다.
   * 화면 메모리에만 두므로 새로고침하거나 로고를 누르면 선택 표시가 풀린다.
   */
  const [picked, setPicked] = useState<string | null>(null);
  const lit = (href: string) => !!picked && isOn(path, href) && isOn(path, picked);
  const litEntry = (e: Entry) => ("href" in e ? lit(e.href) : e.items.some((i) => lit(i.href)));
  /** 메뉴 링크를 누를 때: 지금 보고 있는 화면이면 그 화면을 처음 상태로 새로 연다 */
  const go = (href: string) => (ev: React.MouseEvent<HTMLAnchorElement>) => {
    setPicked(href);
    if (path === href) hardGo(ev, href);
  };

  // 화면이 바뀌면 펼친 메뉴를 닫고, 메뉴에 남아 있는 포커스도 푼다
  useEffect(() => {
    setOpen(null);
    setMobile(false);
    const a = document.activeElement as HTMLElement | null;
    if (a && (headerRef.current?.contains(a) || document.getElementById("mobile-menu")?.contains(a))) a.blur();
  }, [path]);

  // 바깥 클릭·Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    const onDown = (e: MouseEvent) => navRef.current && !navRef.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  // 모바일 메뉴가 열려 있으면 뒤 화면 스크롤을 막는다
  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    return () => void (document.body.style.overflow = "");
  }, [mobile]);

  const enter = (label: string) => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(label);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(null), 120);
  };

  return (
    <>
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/90 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-2 lg:gap-4">
        <Logo reset />

        <nav ref={navRef} aria-label="주요 메뉴" className="hidden items-center gap-0.5 text-[15px] font-semibold text-ink-500 lg:flex">
          {nav.map((e) => {
            const on = litEntry(e);
            const base = `rounded-full px-3 py-2 transition hover:bg-paper hover:text-ink ${on ? "text-ink" : ""}`;
            if ("href" in e)
              return (
                <Link key={e.label} href={e.href} onClick={go(e.href)} aria-current={on ? "page" : undefined} className={`${base} whitespace-nowrap`}>
                  {e.label}
                </Link>
              );
            const expanded = open === e.label;
            return (
              <div key={e.label} className="relative" onMouseEnter={() => enter(e.label)} onMouseLeave={leave}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-haspopup="true"
                  onClick={() => setOpen(expanded ? null : e.label)}
                  className={`${base} inline-flex items-center gap-1 whitespace-nowrap ${expanded ? "bg-paper text-ink" : ""}`}
                >
                  {e.label}
                  <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {expanded && (
                  <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2">
                    <ul className="w-[19rem] rounded-2xl border border-ink-100 bg-white p-2 shadow-lift">
                      {e.items.map((i) => {
                        const cur = lit(i.href);
                        return (
                          <li key={i.href}>
                            <Link
                              href={i.href}
                              onClick={go(i.href)}
                              aria-current={cur ? "page" : undefined}
                              className={`block rounded-xl px-3 py-2.5 transition hover:bg-paper ${cur ? "bg-mint-50" : ""}`}
                            >
                              <span className={`block text-[15px] font-bold ${cur ? "text-mint-600" : "text-ink"}`}>{i.label}</span>
                              <span className="mt-0.5 block text-xs font-medium text-ink-400">{i.desc}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {loggedIn ? (
            <Link href="/account" className="btn-ghost btn-sm whitespace-nowrap sm:px-4">
              내 정보
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-ink-500 transition hover:text-ink sm:inline-block">
                로그인
              </Link>
              <Link href="/apply" className="btn-mint btn-sm whitespace-nowrap sm:px-4">
                무료 체험
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setMobile(!mobile)}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            aria-label={mobile ? "메뉴 닫기" : "메뉴 열기"}
            className="grid h-9 w-9 place-items-center rounded-full border border-ink-100 bg-white lg:hidden"
          >
            {mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </header>

      {/* 헤더의 backdrop-blur가 fixed 기준을 바꾸므로 메뉴 판은 헤더 밖에 둔다 */}
      {mobile && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-ink-100 bg-white lg:hidden">
          <nav aria-label="주요 메뉴" className="container-x space-y-6 py-5 pb-24">
            <Link href={loggedIn ? "/account" : "/login"} className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-[15px] font-bold text-ink">
              <span>{loggedIn ? "내 정보" : "로그인"}</span>
              <span className="min-w-0 truncate pl-3 text-xs font-medium text-ink-400">{loggedIn && acc.status === "in" ? acc.company : "이메일 또는 사업자등록번호"}</span>
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {nav.filter((e): e is { label: string; href: string } => "href" in e).map((e) => {
                const on = lit(e.href);
                return (
                  <Link key={e.href} href={e.href} onClick={go(e.href)} aria-current={on ? "page" : undefined} className={`rounded-xl border px-3 py-3 text-[15px] font-bold ${on ? "border-mint bg-mint-50 text-mint-600" : "border-ink-100 text-ink"}`}>
                    {e.label}
                  </Link>
                );
              })}
            </div>
            {nav.filter((e): e is { label: string; items: Item[] } => "items" in e).map((g) => (
              <section key={g.label}>
                <p className="px-1 text-xs font-bold tracking-wide text-ink-400">{g.label}</p>
                <ul className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100">
                  {g.items.map((i) => {
                    const on = lit(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} onClick={go(i.href)} aria-current={on ? "page" : undefined} className={`block px-4 py-3 ${on ? "bg-mint-50" : ""}`}>
                          <span className={`block text-[15px] font-bold ${on ? "text-mint-600" : "text-ink"}`}>{i.label}</span>
                          <span className="block text-xs text-ink-400">{i.desc}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
