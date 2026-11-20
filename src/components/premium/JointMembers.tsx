"use client";

import { CREDIT_GRADES, type CreditGrade } from "@/lib/evalscore";
import type { JointMember } from "@/lib/joint";
import { won } from "@/lib/format";

const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;

/** 적격심사 공동수급 구성원 입력: 지분율·유사 실적·신용등급(·경영상태 비율) */
export function JointMembers({ members, onChange, ourPerf, showFinance }: { members: JointMember[]; onChange: (m: JointMember[]) => void; ourPerf: number; showFinance: boolean }) {
  const sum = members.reduce((a, m) => a + m.share, 0);
  const ours = Math.max(0, 100 - sum);
  const total = ourPerf + members.reduce((a, m) => a + m.perf, 0);
  const edit = (id: string, patch: Partial<JointMember>) => onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const add = () => onChange([...members, { id: `m${Date.now()}`, name: "", share: members.length ? 20 : 30, perf: 0, credit: "BBB0" }]);

  return (
    <div className="rounded-2xl border border-ink-100 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="label mb-0">공동수급 구성원</span>
        <span className="text-xs text-ink-500">공동도급 허용 공고 · 공동이행 방식 기준</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        구성원을 넣으면 실적은 모두 더하고, 신용평가·경영상태 점수는 지분율로 가중해 합칩니다. 분담이행이나 공고별 세부기준이 다르면 공고문을 따르세요.
      </p>
      {members.length > 0 && (
        <ul className="mt-3 space-y-3">
          {members.map((m, i) => (
            <li key={m.id} className="rounded-xl bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <input className="input py-1.5" placeholder={`구성원 ${i + 1} 업체명`} value={m.name} onChange={(e) => edit(m.id, { name: e.target.value })} />
                <button type="button" onClick={() => onChange(members.filter((x) => x.id !== m.id))} className="shrink-0 text-xs text-ink-500 hover:text-coral">빼기</button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="text-xs text-ink-500">지분율 (%)
                  <input className="input mt-1 py-1.5" inputMode="decimal" value={m.share || ""} onChange={(e) => edit(m.id, { share: Math.min(99, num(e.target.value)) })} />
                </label>
                <label className="text-xs text-ink-500">유사 실적 (원)
                  <input className="input mt-1 py-1.5" inputMode="numeric" value={m.perf ? m.perf.toLocaleString("ko-KR") : ""} onChange={(e) => edit(m.id, { perf: num(e.target.value) })} />
                </label>
                <label className="col-span-2 text-xs text-ink-500 sm:col-span-1">신용평가등급
                  <select className="input mt-1 py-1.5" value={m.credit} onChange={(e) => edit(m.id, { credit: e.target.value as CreditGrade | "없음" })}>
                    {CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}
                    <option value="없음">없음(미제출)</option>
                  </select>
                </label>
                {showFinance && (<>
                  <label className="text-xs text-ink-500">자기자본비율 (%)
                    <input className="input mt-1 py-1.5" inputMode="decimal" value={m.equity ?? ""} onChange={(e) => edit(m.id, { equity: num(e.target.value) })} />
                  </label>
                  <label className="text-xs text-ink-500">유동비율 (%)
                    <input className="input mt-1 py-1.5" inputMode="decimal" value={m.current ?? ""} onChange={(e) => edit(m.id, { current: num(e.target.value) })} />
                  </label>
                </>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={add} className="btn-ghost btn-sm">구성원 추가</button>
        {members.length > 0 && (
          <p className={`text-xs ${sum >= 100 ? "font-semibold text-coral" : "text-ink-500"}`}>
            우리 회사 지분 {ours}% · 합산 실적 {won(total)}{sum >= 100 ? " · 구성원 지분 합이 100% 이상입니다" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
