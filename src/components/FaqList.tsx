import { Minus, Plus } from "lucide-react";
import type { Faq } from "@/lib/faq";

/**
 * 자주 묻는 질문 목록. 카드 없이 가는 선으로만 나누고, 처음에는 모두 펼쳐 둔다.
 * 질문 앞 Q, 답 앞 A 글자로 묻고 답하는 줄을 구분한다. 질문을 누르면 접힌다.
 * large는 메인 화면처럼 답 글자를 조금 크게
 */
export function FaqList({ items, large = false }: { items: Faq[]; large?: boolean }) {
  return (
    <div className="border-t border-ink-900">
      {items.map((f) => (
        <details key={f.q} className="group border-b border-ink-100" open>
          <summary className="flex cursor-pointer list-none items-start gap-3 py-5 sm:gap-4 sm:py-6 [&::-webkit-details-marker]:hidden">
            <span className="w-5 shrink-0 text-base font-extrabold leading-7 text-mint-600 sm:text-lg sm:leading-7">Q</span>
            <span className="flex-1 text-base font-bold leading-7 text-ink sm:text-[17px]">{f.q}</span>
            <span className="mt-1 shrink-0 text-ink-300 transition-colors group-hover:text-ink">
              <Plus className="h-5 w-5 group-open:hidden" strokeWidth={1.75} />
              <Minus className="hidden h-5 w-5 group-open:block" strokeWidth={1.75} />
            </span>
          </summary>
          <div className="-mt-1 flex gap-3 pb-6 pr-8 sm:gap-4 sm:pb-7">
            <span className="w-5 shrink-0 text-base font-extrabold leading-7 text-ink-300 sm:text-lg sm:leading-7">A</span>
            <p className={`flex-1 leading-7 text-ink-500 ${large ? "sm:text-[16px]" : "text-[15px]"}`}>{f.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
