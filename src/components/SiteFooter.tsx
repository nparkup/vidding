import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-100 bg-paper text-ink-500">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo reset />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">
            입찰 특화 알고리즘이 귀사의 입찰 담당자가 되어 드립니다.<br />공고 평가부터 제출 서류 정리까지, 매일 아침 정리해서 전달합니다.
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">서비스</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/service" className="hover:text-ink">서비스 소개</Link></li>
            <li><Link href="/bids" className="hover:text-ink">공고 검색</Link></li>
            <li><Link href="/changes" className="hover:text-ink">정정·취소 공고</Link></li>
            <li><Link href="/rates" className="hover:text-ink">낙찰하한율·실적 기준표</Link></li>
            <li><Link href="/awards" className="hover:text-ink">최근 낙찰 결과</Link></li>
            <li><Link href="/tools/joint" className="hover:text-ink">공동도급 지분 계산기</Link></li>
            <li><Link href="/tools/finance" className="hover:text-ink">경영상태 평균비율</Link></li>
            <li><Link href="/report/sample" className="hover:text-ink">주간 보고서 샘플</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-ink">시작하기</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link href="/pricing" className="hover:text-ink">요금제</Link></li>
            <li><Link href="/faq" className="hover:text-ink">자주 묻는 질문</Link></li>
            <li><Link href="/apply" className="hover:text-ink">무료 체험 · 회원가입</Link></li>
            <li><Link href="/login" className="hover:text-ink">로그인</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100">
        <div className="container-x flex flex-col gap-2 py-6 text-xs text-ink-400 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} 비드매트릭스.</p>
          <p>본 서비스의 분석은 참고용이며 최종 입찰 판단과 책임은 이용자에게 있습니다. <Link href="/admin" className="ml-2 underline-offset-2 hover:underline">관리자</Link></p>
        </div>
      </div>
    </footer>
  );
}
