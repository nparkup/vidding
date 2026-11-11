import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-ink-300">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            청소·시설관리 업체의 입찰 담당자가 되어 드립니다. 공고 탐색부터 서류 준비까지, 매일 아침 정리해서 전달합니다.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">서비스</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/service" className="hover:text-white">서비스 소개</Link></li>
            <li><Link href="/bids" className="hover:text-white">공고 검색</Link></li>
            <li><Link href="/report/sample" className="hover:text-white">주간 보고서 샘플</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">시작하기</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/pricing" className="hover:text-white">요금제</Link></li>
            <li><Link href="/apply" className="hover:text-white">무료 진단 신청</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">고객센터</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>평일 09:00 – 18:00</li>
            <li>hello@ipchalpartner.kr</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-6 text-xs sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} 입찰파트너(가칭). 공고 데이터 출처: 조달청 나라장터(공공데이터포털).</p>
          <p>본 서비스의 분석은 참고용이며 최종 입찰 판단과 책임은 이용자에게 있습니다.</p>
        </div>
      </div>
    </footer>
  );
}
