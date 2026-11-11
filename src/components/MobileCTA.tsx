import Link from "next/link";

/** 모바일 하단 고정 바로가기 */
export function MobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
      <div className="flex gap-2">
        <Link href="/bids" className="btn-ghost btn-sm flex-1">공고 검색</Link>
        <Link href="/apply" className="btn-mint btn-sm flex-[1.6]">무료 진단 받기</Link>
      </div>
    </div>
  );
}
