"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { LICENSE_GROUPS } from "@/lib/types";
import { normalizeLicense } from "@/lib/licenses";

/**
 * 보유 면허(투찰가능업종) 선택: 업종군별 칩 + 목록에 없는 업종 직접 입력.
 * - selected/onChange 를 주면 제어 컴포넌트로 동작
 * - name 을 주면 선택값을 hidden input 으로 함께 보내 폼 제출에 쓸 수 있다
 */
export function LicensePicker({
  selected,
  onChange,
  defaultSelected = [],
  name,
  openGroups = 1,
}: {
  selected?: string[];
  onChange?: (v: string[]) => void;
  defaultSelected?: string[];
  name?: string;
  openGroups?: number;
}) {
  const [inner, setInner] = useState<string[]>(defaultSelected);
  const value = selected ?? inner;
  const set = (v: string[]) => (onChange ? onChange(v) : setInner(v));
  const toggle = (l: string) => set(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  const [text, setText] = useState("");

  const known = new Set(LICENSE_GROUPS.flatMap((g) => g.items));
  const custom = value.filter((v) => !known.has(v));

  const addCustom = () => {
    const add = text.split(",").map(normalizeLicense).filter((x) => x && !value.includes(x));
    if (add.length) set([...value, ...add]);
    setText("");
  };

  const chip = (l: string) => (
    <button
      key={l}
      type="button"
      onClick={() => toggle(l)}
      aria-pressed={value.includes(l)}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${value.includes(l) ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500 hover:border-ink-300"}`}
    >
      {l}
    </button>
  );

  return (
    <div className="space-y-2">
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      {LICENSE_GROUPS.map((g, i) => {
        const n = g.items.filter((l) => value.includes(l)).length;
        return (
          <details key={g.group} open={i < openGroups || n > 0} className="group rounded-xl border border-ink-100 bg-white/60 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink-700">
              <span>{g.group}</span>
              <span className="text-xs font-medium text-ink-300">{n > 0 ? <b className="text-mint-600">{n}개 선택</b> : `${g.items.length}개`} <ChevronDown className="ml-1 inline-block h-3.5 w-3.5 align-[-2px] transition group-open:rotate-180" /></span>
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5 pb-1">{g.items.map(chip)}</div>
          </details>
        );
      })}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="목록에 없는 업종 직접 입력 (예: 승강기 유지관리업)"
          className="input min-w-0 flex-1"
        />
        <button type="button" onClick={addCustom} className="btn-ghost btn-sm shrink-0">추가</button>
      </div>
      {custom.length > 0 && <div className="flex flex-wrap gap-1.5">{custom.map(chip)}</div>}
    </div>
  );
}
