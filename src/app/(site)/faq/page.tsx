import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { FaqList } from "@/components/FaqList";
import { FAQ_SECTIONS } from "@/lib/faq";

export const metadata: Metadata = { title: "자주 묻는 질문" };

export default function FaqPage() {
  return (
    <>
    <PageHero title="자주 묻는 질문" lead="서비스 이용과 요금·이용권에 관한 질문을 모았습니다.">
      <div className="mt-7 flex flex-wrap gap-2">
        {FAQ_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-ink-100 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-mint hover:text-mint-600">{s.title}</a>
        ))}
      </div>
    </PageHero>
    <div className="container-x">
      {FAQ_SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className={`grid scroll-mt-24 gap-5 lg:grid-cols-[240px_1fr] lg:gap-16 ${i === 0 ? "mt-14 sm:mt-20" : "mt-20 sm:mt-28"}`}>
          <div className="lg:pt-1">
            <p className="text-sm font-bold tabular-nums text-mint-600">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{s.title}</h2>
            <p className="mt-2 text-sm text-ink-400">{s.desc} · {s.items.length}개 질문</p>
          </div>
          <FaqList items={s.items} />
        </section>
      ))}
      <p className="mt-20 text-center text-sm text-ink-500">
        이용권 금액과 기능 비교는 <Link href="/pricing" className="font-semibold text-mint-600">요금제</Link>에서 보실 수 있습니다.
      </p>
    </div>
    </>
  );
}
