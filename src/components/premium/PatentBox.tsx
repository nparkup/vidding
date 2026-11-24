"use client";

import type { EvalItem } from "@/lib/evalscore";
import { countPatents, patentRule, type PatentLookup } from "@/lib/patents";

/**
 * 평가점수 예측 3단계: 공고 배점표에 특허 항목이 있을 때만 보인다.
 * 특허청 등록원부(공공데이터포털) 조회 결과 중 지금 살아 있는 특허권을 보여 주고, 공고에 인정되지 않는 건은 고객이 뺄 수 있다.
 * 조회에 없는 건(출원 건, 조회 뒤 등록된 건)은 직접 더한다.
 */
export function PatentBox({ items, res, loading, excluded, onToggle, extra, onExtra, asOf }: {
  items: EvalItem[];
  res: PatentLookup | null;
  loading: boolean;
  excluded: Set<string>;
  onToggle: (no: string) => void;
  extra: number;
  onExtra: (n: number) => void;
  /** 공고일 (최근 N년 기준) */
  asOf?: string;
}) {
  const rules = items.map((it) => ({ it, rule: patentRule(it) }));
  const list = res?.items ?? [];
  const date = asOf ? new Date(`${asOf.slice(0, 10)}T00:00:00+09:00`) : new Date();
  const picked = list.filter((p) => !excluded.has(p.no));
  const status = loading
    ? "특허청 특허 정보를 조회하는 중…"
    : !res ? "우리 회사를 조회하면 특허청에 등록된 특허를 불러옵니다."
    : res.status === "ok" ? `특허청 등록원부 조회: 권리자로 유지 중인 특허·실용신안 ${res.total.toLocaleString("ko-KR")}건${res.reason ? ` (${res.reason})` : ""}`
    : res.status === "none" ? "특허청 등록원부에 이 사업자번호의 특허권이 없습니다. 보유 특허가 있으면 직접 넣어 주세요."
    : res.status === "limit" ? "이번 달 특허 자동 조회 한도에 다다라 직접 입력으로 계산합니다."
    : res.status === "off" ? "특허 자동 조회를 준비 중입니다. 보유 특허 건수를 직접 넣어 주세요."
    : "특허 조회에 실패했습니다. 보유 특허 건수를 직접 넣어 주세요.";
  return (
    <div className="min-w-0 rounded-2xl border border-ink-100 p-4 sm:col-span-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
        특허 보유
        {res?.status === "ok" || res?.status === "none"
          ? <span className="rounded-md bg-mint-50 px-1.5 py-0.5 text-[11px] font-semibold text-mint-700">자동 · 특허청 등록원부</span>
          : <span className="rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">직접 입력</span>}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-ink-500">
        {rules.map(({ it, rule }) => {
          const n = countPatents(picked, rule, date).length + extra;
          const how = [
            rule.utility ? "특허·실용신안" : "특허 (실용신안 제외)",
            rule.applications ? "출원 건도 인정 (출원 건은 직접 더하기)" : "등록 건만",
            rule.withinYears ? `최근 ${rule.withinYears}년 등록` : "",
            rule.bands.length ? rule.bands.map((b) => b.cond).join(" · ") : rule.perItem ? `건당 ${rule.perItem}점` : rule.holdFull ? "보유 시 배점" : "",
          ].filter(Boolean).join(" · ");
          return (
            <li key={it.id} className="[overflow-wrap:anywhere]">
              <b className="text-ink">{it.label}</b> ({it.max}점): {how}. 이 기준으로 {n}건.
              {rule.others.length > 0 && ` ${rule.others.join("·")} 인증은 특허 조회에 없어 따로 확인하세요.`}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-500">{status}</p>
      {list.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer select-none text-sm font-semibold text-ink-500 hover:text-ink">
            조회된 특허 {list.length}건 · 반영 {picked.length}건 <span className="group-open:hidden">펼치기</span><span className="hidden group-open:inline">접기</span>
          </summary>
          <p className="mt-2 text-xs text-ink-500">공고가 '해당 사업 관련 특허'만 인정하면 관련 없는 건의 체크를 빼세요.</p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto overscroll-contain">
            {list.map((p) => (
              <li key={p.no}>
                <label className="flex min-w-0 items-start gap-2 rounded-lg bg-paper px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-1 shrink-0" checked={!excluded.has(p.no)} onChange={() => onToggle(p.no)} />
                  <span className="min-w-0">
                    <span className="block [overflow-wrap:anywhere]">{p.title || "(발명의 명칭 없음)"}</span>
                    <span className="block text-xs text-ink-500">{p.type} 제{p.no}호{p.regDate ? ` · 등록 ${p.regDate}` : ""}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-3 max-w-xs">
        <span className="label">조회에 없는 특허 (건)</span>
        <input className="input" type="number" min={0} value={extra} onChange={(e) => onExtra(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        <p className="mt-1 text-xs text-ink-500">증빙: 특허등록원부 또는 특허증 (공고일 전 등록, 권리 존속 중)</p>
      </div>
    </div>
  );
}
