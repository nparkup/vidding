import Link from "next/link";
import { EngineName } from "@/components/EngineName";
import { ENGINE_LIST } from "@/lib/engines";

/** 메인: 비드파인더·비드아틀라스·비드인사이트 세 엔진 소개 */
export function EngineTrio() {
  return (
    <section className="container-x pt-24">
      <div className="text-center">
        <h2 className="h-section">찾고, 분석하고, 예측하는<br />비드매트릭스 솔루션</h2>
      </div>
      <ol className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {ENGINE_LIST.map((e, i) => (
          <li key={e.id} className="card flex min-w-0 flex-col p-6 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-extrabold tabular-nums text-mint-600">0{i + 1}</span>
              <span className="chip bg-paper">{e.area}</span>
            </div>
            <p className="mt-5 text-[28px] font-extrabold leading-tight tracking-[-0.03em]"><EngineName id={e.id} /></p>
            <p className="mt-1 font-bold text-ink-700">{e.tagline}</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-500">{e.desc}</p>
            <ul className="mt-5 flex flex-wrap gap-1">
              {e.items.map((x) => <li key={x} className="chip bg-paper">{x}</li>)}
            </ul>
            <Link href={e.href} className="mt-6 font-semibold text-mint-600 underline-offset-4 hover:underline">{e.cta}</Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
