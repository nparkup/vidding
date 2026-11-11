"use client";

import { useEffect, useState } from "react";

type Group = { group: string; items: { name: string; note?: string; required: boolean }[] };

/** 제출서류 체크리스트 (진행 상태는 브라우저에 저장) */
export function Checklist({ bidId, groups }: { bidId: string; groups: Group[] }) {
  const storageKey = `checklist:${bidId}`;
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setDone(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const toggle = (k: string) => {
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const total = groups.reduce((s, g) => s + g.items.length, 0);
  const checked = Object.values(done).filter(Boolean).length;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-mint transition-all" style={{ width: `${(checked / total) * 100}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-ink-500">{checked}/{total} 준비</span>
      </div>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="mb-2 text-sm font-bold text-ink-700">{g.group}</p>
            <ul className="space-y-1.5">
              {g.items.map((it) => {
                const k = `${g.group}/${it.name}`;
                return (
                  <li key={k}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${done[k] ? "border-mint-100 bg-mint-50" : "border-ink-100 bg-white hover:border-ink-300"}`}>
                      <input type="checkbox" checked={!!done[k]} onChange={() => toggle(k)} className="mt-0.5 h-4 w-4 accent-[#0FA37F]" />
                      <span className="min-w-0">
                        <span className={`text-sm font-medium ${done[k] ? "text-ink-300 line-through" : ""}`}>{it.name}</span>
                        {!it.required && <span className="ml-1.5 text-[11px] font-semibold text-ink-300">해당 시</span>}
                        {it.note && <span className="block text-xs text-ink-500">{it.note}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
