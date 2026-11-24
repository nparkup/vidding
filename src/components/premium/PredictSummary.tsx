/**
 * 예측 화면 맨 위 '한눈에 보기': 지금 어느 단계인지와 핵심 결과 몇 개, 아래 자세한 내용으로 가는 바로가기.
 * 나라장터 예측(ScorePredictor)과 아파트 예측(AptPredictor)이 함께 쓴다.
 * 결과 패널은 스크롤을 따라다니지 않으므로(사용자 요청), 위에서 답을 먼저 보여 주고 자세한 내용은 아래로 보낸다.
 */
export type StepState = "done" | "now" | "todo";
export type Tone = "mint" | "coral" | "amber" | "ink" | "muted";

export interface SummaryTile {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}

const VALUE_TONE: Record<Tone, string> = {
  mint: "text-mint-700",
  coral: "text-coral",
  amber: "text-ink",
  ink: "text-ink",
  muted: "text-ink-300",
};
const TILE_TONE: Record<Tone, string> = {
  mint: "border-mint/40 bg-mint-50/60",
  coral: "border-coral/40 bg-coral-100/50",
  amber: "border-amber/50 bg-amber-100/60",
  ink: "border-ink-100 bg-white",
  muted: "border-dashed border-ink-100 bg-white",
};

const STEP_STATUS: Record<StepState, string> = { done: "완료", now: "지금 할 일", todo: "다음 단계" };

/**
 * 진행 단계 표시. 사이트 카드(.card) 한 장 안에 세 단계를 나란히 두고,
 * 위쪽 막대가 진행 정도를 민트색으로 채운다. 지금 단계는 민트 네모, 끝난 단계는 연한 민트 네모.
 */
export function StepBar({ steps }: { steps: { label: string; state: StepState; href?: string }[] }) {
  const nowAt = steps.findIndex((s) => s.state === "now");
  return (
    <nav className="card px-4 py-4 sm:px-6 sm:py-5" aria-label="진행 단계">
      <ol className="grid grid-cols-3 gap-3 sm:gap-6">
        {steps.map((s, n) => {
          const body = (
            <>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums transition ${
                s.state === "now" ? "bg-mint text-white ring-4 ring-mint-100"
                  : s.state === "done" ? "bg-mint-50 text-mint-700 ring-1 ring-inset ring-mint/40"
                  : "bg-white text-ink-300 ring-1 ring-inset ring-ink-100"}`}>{n + 1}</span>
              <span className="min-w-0">
                <span className={`block text-[11px] font-semibold leading-none sm:text-xs ${s.state === "todo" ? "text-ink-300" : "text-mint-600"}`}>{STEP_STATUS[s.state]}</span>
                <span className={`mt-1 block break-keep text-[13px] font-bold leading-snug sm:text-[15px] ${s.state === "todo" ? "text-ink-400" : "text-ink"} ${s.href ? "underline-offset-4 group-hover:underline" : ""}`}>{s.label}</span>
              </span>
            </>
          );
          const row = "mt-3 flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3";
          return (
            <li key={s.label} className="min-w-0" aria-current={n === nowAt ? "step" : undefined}>
              <span aria-hidden className={`block h-1 rounded-full ${s.state === "todo" ? "bg-ink-100" : "bg-mint"}`} />
              {s.href
                ? <a href={s.href} className={`${row} group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-mint`}>{body}</a>
                : <div className={row}>{body}</div>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PredictSummary({ title, tiles, links, note }: { title: string; tiles: SummaryTile[]; links?: { href: string; label: string }[]; note?: React.ReactNode }) {
  return (
    <section className="card min-w-0 p-5 sm:p-6" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {links && links.length > 0 && (
          <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="자세히 보기">
            {links.map((l) => <a key={l.href} href={l.href} className="font-semibold text-ink-500 underline-offset-4 hover:text-ink hover:underline">{l.label}</a>)}
          </nav>
        )}
      </div>
      <dl className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${tiles.length >= 5 ? "lg:grid-cols-3 xl:grid-cols-5" : tiles.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"}`}>
        {tiles.map((t) => (
          <div key={t.label} className={`min-w-0 rounded-2xl border px-4 py-3 ${TILE_TONE[t.tone ?? "ink"]}`}>
            <dt className="text-xs font-semibold text-ink-500">{t.label}</dt>
            <dd className={`mt-1 text-xl font-extrabold leading-tight tabular-nums [overflow-wrap:anywhere] ${VALUE_TONE[t.tone ?? "ink"]} ${t.tone === "muted" ? "text-base font-semibold" : ""}`}>{t.value}</dd>
            {t.sub && <dd className="mt-1 text-xs leading-relaxed text-ink-500 [overflow-wrap:anywhere]">{t.sub}</dd>}
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-xs leading-relaxed text-ink-500">{note}</p>}
    </section>
  );
}
