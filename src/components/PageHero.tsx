import type { ReactNode } from "react";

/** 하위 페이지 상단 머리말 (연한 격자 배경 + 선택 일러스트) */
export function PageHero({ eyebrow, title, lead, art, children, center = false }: { eyebrow: string; title: ReactNode; lead?: ReactNode; art?: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <section className="px-2 sm:px-3">
      <div className="relative overflow-hidden rounded-[28px] bg-paper sm:rounded-[36px]">
        <div className="bg-grid-light mask-fade pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-mint-100 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-sky-100/70 blur-3xl" />
        <div className={`container-x relative grid items-center gap-8 py-14 sm:py-20 ${art ? "lg:grid-cols-[1.3fr_1fr]" : ""} ${center ? "text-center" : ""}`}>
          <div className={center ? "mx-auto max-w-3xl" : ""}>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.15] tracking-[-0.04em] sm:text-[52px]">{title}</h1>
            {lead && <p className={`lead mt-5 max-w-2xl ${center ? "mx-auto" : ""}`}>{lead}</p>}
            {children}
          </div>
          {art && <div className="mx-auto hidden w-full max-w-sm lg:block">{art}</div>}
        </div>
      </div>
    </section>
  );
}
