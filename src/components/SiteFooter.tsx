import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-paper text-ink-500">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            입찰 특화 알고리즘과 전담 매니저가 귀사의 입찰 담당자가 되어 드립니다. 공고 채점부터 서류 준비까지, 매일 아침 정리해서 전달합니다.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">서비스</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/service" className="hover:text-ink">서비스 소개</Link></li>
            <li><Link href="/bids" className="hover:text-ink">공고 검색</Link></li>
            <li><Link href="/report/sample" className="hover:text-ink">주간 보고서 샘플</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">시작하기</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/pricing" className="hover:text-ink">요금제</Link></li>
            <li><Link href="/apply" className="hover:text-ink">무료 진단 신청</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">고객센터</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>평일 09:00 – 18:00</li>
            <li>hello@ipchalmatelab.kr</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100">
        <div className="container-x flex flex-col gap-2 py-6 pb-24 text-xs text-ink-400 sm:flex-row sm:justify-between md:pb-6">
          <p>© {new Date().getFullYear()} 입찰메이트LAB. 공고 데이터 출처: 조달청 나라장터(공공데이터포털).</p>
          <p>본 서비스의 분석은 참고용이며 최종 입찰 판단과 책임은 이용자에게 있습니다.</p>
        </div>
      </div>
    </footer>
  );
}
