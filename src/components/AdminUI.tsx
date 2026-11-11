export function PageHead({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-ink-500">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = "ink" }: { label: string; value: string | number; sub?: string; tone?: "ink" | "mint" | "coral" | "amber" }) {
  const c = { ink: "text-ink", mint: "text-mint-600", coral: "text-coral", amber: "text-[#9A6412]" }[tone];
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums ${c}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-300">{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  활성: "bg-mint-100 text-mint-600", 체험: "bg-amber-100 text-[#9A6412]", 일시중지: "bg-ink-100 text-ink-500",
  신규: "bg-coral-100 text-coral", 연락완료: "bg-amber-100 text-[#9A6412]", 체험전환: "bg-mint-100 text-mint-600", 보류: "bg-ink-100 text-ink-500",
  초안: "bg-amber-100 text-[#9A6412]", 발송완료: "bg-mint-100 text-mint-600",
};

export function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[value] ?? "bg-ink-100 text-ink-500"}`}>{value}</span>;
}
