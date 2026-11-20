"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { Logo } from "./Logo";

type Item = { href: string; label: string; desc: string };
type Entry = { label: string; href: string } | { label: string; items: Item[] };

/** 상단 메뉴. 하위 화면이 많은 메뉴는 묶어서 펼침 메뉴로 보여 준다 */
export const NAV: Entry[] = [
  { label: "서비스", href: "/service" },
  {
    label: "공고 찾기",
    items: [
      { href: "/bids", label: "공고 검색", desc: "나라장터 용역·공사·물품 전 업종" },
      { href: "/apt-bids", label: "아파트 공고", desc: "아파트 청소·경비·위탁관리 입찰" },
      { href: "/changes", label: "정정·취소 공고", desc: "바뀌거나 취소된 공고" },
    ],
  },
  {
    label: "입찰 분석",
    items: [
      { href: "/awards", label: "최근 낙찰 결과", desc: "최근 한 달 최종낙찰·개찰 순위" },
      { href: "/analysis/agency", label: "발주처 분석", desc: "수요기관별 낙찰률·사정율·주요 낙찰업체" },
      { href: "/analysis/rival", label: "경쟁사 투찰 성향", desc: "경쟁사 사정율·주요 발주처" },
      { href: "/analysis/mine", label: "우리 회사 진단", desc: "우리 회사 낙찰 기록으로 투찰 습관 점검" },
      { href: "/plans", label: "발주계획", desc: "기관이 미리 올린 발주 예정 사업" },
      { href: "/prespecs", label: "사전규격 미리보기", desc: "본공고 전에 공개된 규격" },
      { href: "/contracts", label: "계약현황", desc: "최근 2주 계약업체·금액·기간" },
    ],
  },
  { label: "평가점수 예측", href: "/premium" },
  {
    label: "실무 도구",
    items: [
      { href: "/tools/joint", label: "공동도급 지분 계산기", desc: "구성원별 최대 참여비율 계산" },
      { href: "/tools/finance", label: "경영상태 평균비율", desc: "업종별 부채비율·유동비율 평균" },
      { href: "/rates", label: "낙찰하한율·실적 기준표", desc: "금액 구간별 기준 한눈에" },
      { href: "/mybox", label: "내 서류함", desc: "관심 공고 일정·제출서류 관리" },
    ],
  },
  { label: "요금제", href: "/pricing" },
];

const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const isOn = (path: string, href: string) => (href === "/bids" ? path === "/bids" || path.startsWith("/bids/") : path === href || path.startsWith(`${href}/`));
const entryOn = (path: string, e: Entry) => ("href" in e ? isOn(path, e.href) : e.items.some((i) => isOn(path, i.href)));

export function SiteHeader() {
  const path = clean(usePathname() || "/");
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // 화면이 바뀌면 펼친 메뉴를 닫는다
  useEffect(() => {
    setOpen(null);
    setMobile(false);
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
    <header className="sticky top-0 z-40 border-b border-ink-100/70 bg-white/90 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-2 lg:gap-4">
        <Logo />

        <nav ref={navRef} aria-label="주요 메뉴" className="hidden items-center gap-0.5 text-[15px] font-semibold text-ink-500 lg:flex">
          {NAV.map((e) => {
            const on = entryOn(path, e);
            const base = `rounded-full px-3 py-2 transition hover:bg-paper hover:text-ink ${on ? "text-ink" : ""}`;
            if ("href" in e)
              return (
                <Link key={e.label} href={e.href} aria-current={on ? "page" : undefined} className={`${base} whitespace-nowrap`}>
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
                        const cur = isOn(path, i.href);
                        return (
                          <li key={i.href}>
                            <Link
                              href={i.href}
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
          <Link href="/apply" className="btn-mint btn-sm whitespace-nowrap sm:px-4">
            2주 무료 체험
          </Link>
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
            <div className="grid grid-cols-2 gap-2">
              {NAV.filter((e): e is { label: string; href: string } => "href" in e).map((e) => {
                const on = isOn(path, e.href);
                return (
                  <Link key={e.href} href={e.href} aria-current={on ? "page" : undefined} className={`rounded-xl border px-3 py-3 text-[15px] font-bold ${on ? "border-mint bg-mint-50 text-mint-600" : "border-ink-100 text-ink"}`}>
                    {e.label}
                  </Link>
                );
              })}
            </div>
            {NAV.filter((e): e is { label: string; items: Item[] } => "items" in e).map((g) => (
              <section key={g.label}>
                <p className="px-1 text-xs font-bold tracking-wide text-ink-400">{g.label}</p>
                <ul className="mt-2 divide-y divide-ink-100 rounded-2xl border border-ink-100">
                  {g.items.map((i) => {
                    const on = isOn(path, i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={on ? "page" : undefined} className={`block px-4 py-3 ${on ? "bg-mint-50" : ""}`}>
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
