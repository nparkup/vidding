"use client";

import { TRUST_ITEMS, type TrustRule, type TrustScore } from "@/lib/trustscore";

const SECTIONS = [...new Set(TRUST_ITEMS.map((t) => t.section))];
const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `△${-n}` : "0");

/**
 * 신뢰도 가감점(신인도) 항목 선택. 항목 옆에 지금 평가 기준표의 점수를 보여 주고,
 * 같은 묶음(여성기업 존속기간 등)은 하나만 고를 수 있게 한다.
 */
export function TrustPicker({ rule, selected, onChange, score }: {
  rule?: TrustRule;
  selected: string[];
  onChange: (ids: string[]) => void;
  score?: TrustScore;
}) {
  const toggle = (id: string) => {
    const t = TRUST_ITEMS.find((x) => x.id === id)!;
    if (selected.includes(id)) return onChange(selected.filter((s) => s !== id));
    const others = t.exclusive ? TRUST_ITEMS.filter((x) => x.exclusive === t.exclusive).map((x) => x.id) : [];
    onChange([...selected.filter((s) => !others.includes(s)), id]);
  };

  return (
    <div className="min-w-0 sm:col-span-3">
      <span className="label">신뢰도 가감점(신인도) 해당 항목</span>
      <div className="rounded-2xl border border-ink-100 bg-white/60 p-3">
        <p className="text-xs text-ink-500">
          {rule ? <>기준: {rule.name}. 가점 상한 +{rule.plusCap}, 감점 하한 △{rule.minusCap}.</> : "공고를 고르면 평가 기준표의 항목별 점수를 보여 드립니다."}
          {rule?.fromNotice && <> 공고서에서 읽은 값: {rule.fromNotice.join(", ")}.</>}
          {rule?.estimated && <> 이 업무 구분의 세부 기준표는 확인 전이라 일반용역 항목 점수를 준용한 추정입니다.</>}
        </p>
        <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {SECTIONS.map((sec) => (
            <fieldset key={sec} className="min-w-0">
              <legend className="mb-1 text-xs font-bold text-ink-700">{sec}</legend>
              <div className="space-y-1">
                {TRUST_ITEMS.filter((t) => t.section === sec).map((t) => {
                  const p = rule?.points[t.id] ?? 0;
                  const on = selected.includes(t.id);
                  return (
                    <label key={t.id} className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1 shrink-0" checked={on} onChange={() => toggle(t.id)} />
                      <span className="min-w-0 flex-1">{t.label}</span>
                      <span className={`shrink-0 tabular-nums text-xs font-semibold ${p < 0 ? "text-coral" : p > 0 ? "text-ink-700" : "text-ink-300"}`}>{rule ? (p ? fmt(p) : "해당 없음") : ""}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {score && (
          <div className="mt-3 border-t border-ink-100 pt-3 text-sm">
            <p className="font-semibold">
              신뢰도 가감점 {fmt(score.total)}점
              <span className="ml-2 text-xs font-normal text-ink-500">가점 +{score.plus}{score.plusRaw !== score.plus ? ` (선택 합계 +${score.plusRaw})` : ""} · 감점 △{score.minus}</span>
            </p>
            {[...score.notes, ...(score.ignored.length ? [`이 기준표에서 점수가 없는 항목: ${score.ignored.join(", ")}`] : [])].map((n) => (
              <p key={n} className="mt-1 text-xs text-ink-500">{n}</p>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-500">
          고용창출·고용형태·고용안정(고용 비율), 납품지연(지체상금), 산업재해처럼 비율이나 공고별 기준으로 정하는 항목은 아직 계산에 넣지 않습니다. 공고서의 신인도 기준표를 함께 확인하세요.
        </p>
      </div>
    </div>
  );
}
