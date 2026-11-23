import { Plus } from "lucide-react";
import type { Faq } from "@/lib/faq";

/** 질문을 누르면 답이 펼쳐지는 목록. large는 메인 화면처럼 답 글자를 조금 크게 */
export function FaqList({ items, large = false, openFirst = true }: { items: Faq[]; large?: boolean; openFirst?: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <details key={f.q} className="group rounded-2xl bg-paper px-5 py-5 open:bg-white open:shadow-card open:ring-1 open:ring-ink-100 sm:px-6" open={openFirst && i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
            {f.q}
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-ink-400 transition group-open:rotate-45 group-open:bg-mint group-open:text-white"><Plus className="h-4 w-4" /></span>
          </summary>
          <p className={`mt-3 leading-relaxed text-ink-500 ${large ? "" : "text-sm sm:text-[15px]"}`}>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
