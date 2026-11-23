type Group = { group: string; items: { name: string; note?: string; required: boolean }[] };

/** 제출 서류 목록 (체크 기능 없이 서류만 보여준다) */
export function DocList({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-3">
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 text-sm font-bold text-ink-700">{g.group}</p>
          <ul className="grid grid-cols-1 gap-x-4 rounded-xl border border-ink-100 bg-white px-1 py-1.5 sm:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.name} className="flex min-w-0 items-start gap-2.5 px-2 py-1.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                <span className="min-w-0">
                  <span className="text-sm font-medium">{it.name}</span>
                  {!it.required && <span className="ml-1.5 text-[11px] font-semibold text-ink-300">해당 시</span>}
                  {it.note && <span className="block text-xs text-ink-500">{it.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
