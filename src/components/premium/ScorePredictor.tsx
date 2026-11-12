"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScoreBar } from "@/components/Badges";
import { readDocument, UnsupportedDocError } from "@/lib/docText";
import {
  CREDIT_GRADES, DEFAULT_COMPANY, extractSheet, findCreditGrade, kindOf, predict, templateSheet, yearsSince,
  type CompanyInput, type CreditGrade, type EvalItem, type EvalSheet, type ItemKind, type Level,
} from "@/lib/evalscore";
import { won } from "@/lib/format";
import type { Bid } from "@/lib/types";
import { useBids } from "@/lib/useBids";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

const KIND_LABEL: Record<ItemKind, string> = {
  performance: "실적",
  credit: "신용·경영상태",
  price: "입찰가격",
  years: "업력",
  staff: "기술인력",
  bonus: "신인도 가감점",
  qualitative: "정성평가",
  other: "기타",
};

/** 공고문이 없을 때 추출 기능을 바로 시험해 볼 수 있는 예시 (업종별) */
const SAMPLES: { label: string; text: string }[] = [
  {
    label: "정보시스템 구축 (협상계약)",
    text: `제안서 평가 기준 (협상에 의한 계약)
평가항목 배점
정량평가 (20점)
유사 사업 수행실적 10점
경영상태(신용평가등급) 5점
참여 기술인력 보유 3점
신인도 2점
정성평가 (60점)
사업 이해도 및 추진전략 10점
시스템 구축 방법론 20점
품질·보안 관리 방안 15점
교육 및 유지보수 계획 10점
발표 및 질의응답 5점
가격평가 20점
합계 100점
기술능력평가 점수가 기술능력평가분야 배점한도의 85% 이상인 자를 협상적격자로 선정`,
  },
  {
    label: "청사 시설관리 용역 (적격심사)",
    text: `용역 적격심사 세부기준
심사항목 배점
용역 수행실적 15점
경영상태(신용평가등급) 15점
신인도 가점 2점
입찰가격 70 − 4 × |88/100 − 입찰가격/예정가격| × 100 70점
종합평점 85점 이상인 자를 낙찰자로 결정`,
  },
  {
    label: "도로 포장 공사 (적격심사)",
    text: `공사 적격심사 기준
시공경험 평가 15점
경영상태 평가 15점
입찰가격 평가 70점
신인도 감점 0점
종합평점 92점 이상이면 낙찰자로 결정`,
  },
];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function ScorePredictor() {
  const sp = useSearchParams();
  const { bids, error } = useBids();
  const [bidId, setBidId] = useState<string | null>(sp.get("bid"));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<EvalSheet | null>(null);
  const [docs, setDocs] = useState<{ name: string; chars: number; pages?: number }[]>([]);
  const [docMsg, setDocMsg] = useState<string>("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [co, setCo] = useState<CompanyInput>(DEFAULT_COMPANY);
  const [perfEok, setPerfEok] = useState("");
  const [creditMsg, setCreditMsg] = useState("");
  const [bizno, setBizno] = useState("");
  const [corpMsg, setCorpMsg] = useState("");
  const textsRef = useRef<string[]>([]);

  const bid: Bid | undefined = useMemo(() => {
    if (!bids) return undefined;
    return bids.find((b) => b.id === bidId) ?? bids.find((b) => b.contractMethod === "적격심사") ?? bids[0];
  }, [bids, bidId]);

  const template = useMemo(() => (bid ? templateSheet(bid) : null), [bid]);
  const active = sheet ?? template;

  // 공고가 바뀌면 원문 평가표와 첨부를 비운다
  useEffect(() => { setSheet(null); setDocs([]); setDocMsg(""); textsRef.current = []; }, [bid?.id]);

  const result = useMemo(() => (active && bid ? predict(active, bid, co) : null), [active, bid, co]);

  const matches = useMemo(() => {
    if (!bids || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return bids.filter((b) => b.title.toLowerCase().includes(q) || b.agency.includes(q) || b.bidNtceNo.toLowerCase().includes(q)).slice(0, 8);
  }, [bids, query]);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setCo((c) => ({ ...c, [k]: v }));

  function runExtract(texts: string[]) {
    const joined = texts.join("\n");
    const ex = extractSheet(joined, template ?? undefined);
    if (ex) {
      setSheet(ex);
      setDocMsg(ex.notes[0]);
    } else {
      setSheet(null);
      setDocMsg("평가항목과 배점을 찾지 못해 표준 평가표로 계산합니다. 평가기준이 담긴 첨부(제안요청서, 적격심사 세부기준 등)를 넣어 주세요.");
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const got: { name: string; chars: number; pages?: number }[] = [];
    const errs: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const d = await readDocument(f);
        textsRef.current.push(d.text);
        got.push({ name: d.name, chars: d.text.length, pages: d.pages });
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof UnsupportedDocError ? e.message : "파일을 읽지 못했습니다."}`);
      }
    }
    setDocs((d) => [...d, ...got]);
    if (textsRef.current.length) runExtract(textsRef.current);
    if (errs.length) setDocMsg(errs.join(" "));
    setBusy(false);
  }

  async function onCreditFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setCreditMsg("읽는 중…");
    try {
      const d = await readDocument(f);
      const g = findCreditGrade(d.text);
      if (g) { set("creditGrade", g); setCreditMsg(`${f.name}에서 신용평가등급 ${g}를 확인했습니다.`); }
      else setCreditMsg("문서에서 등급을 찾지 못했습니다. 아래에서 직접 선택해 주세요.");
    } catch (e) {
      setCreditMsg(e instanceof UnsupportedDocError ? e.message : "파일을 읽지 못했습니다.");
    }
  }

  async function lookup() {
    setCorpMsg("나라장터 조회 중…");
    try {
      const r = await fetch(`/api/premium/corp?bizno=${encodeURIComponent(bizno)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCo((c) => ({
        ...c,
        corpName: j.corpName,
        bizno: j.bizno,
        years: j.openedAt ? yearsSince(j.openedAt) : c.years,
        employees: j.employees ?? c.employees,
      }));
      setCorpMsg(`${j.corpName} · 개업 ${j.openedAt ?? "-"} · 종업원 ${j.employees ?? "-"}명${j.industries?.length ? ` · 등록 업종 ${j.industries.map((i: { name: string }) => i.name).join(", ")}` : ""}`);
    } catch (e) {
      setCorpMsg((e as Error).message || "조회에 실패했습니다.");
    }
  }

  function editItem(id: string, patch: Partial<EvalItem>) {
    if (!active) return;
    setSheet({ ...active, source: active.source, items: active.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }
  function removeItem(id: string) {
    if (!active) return;
    setSheet({ ...active, items: active.items.filter((i) => i.id !== id) });
  }

  if (error) return <p className="card p-6 text-sm text-coral">공고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>;
  if (!bids || !bid || !active || !result) return <p className="card p-6 text-sm text-ink-300">공고 목록을 불러오는 중…</p>;

  const isNego = active.method === "협상에 의한 계약" || active.method === "종합심사";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="min-w-0 space-y-6">
        {/* 1. 공고 */}
        <section className="card p-6">
          <Step n={1} title="공고 선택" />
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">{bid.bizType ?? "용역"} · {bid.category} · {bid.contractMethod} · 공고번호 {bid.bidNtceNo}</p>
            <p className="mt-1 font-bold leading-snug">{bid.title}</p>
            <p className="mt-1 text-sm text-ink-500">{bid.agency} · 기초금액 {won(bid.baseAmount)}{bid.lowerLimitRate ? ` · 낙찰하한율 ${bid.lowerLimitRate}%` : ""}</p>
          </div>
          <div className="relative mt-3">
            <input className="input" placeholder="다른 공고 찾기: 공고명·기관명·공고번호" value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <ul className="card absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto p-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { setBidId(m.id); setQuery(""); }}>
                      <span className="block truncate font-semibold">{m.title}</span>
                      <span className="text-xs text-ink-500">{m.agency} · {m.contractMethod} · {won(m.baseAmount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 2. 첨부파일 */}
        <section className="card p-6">
          <Step n={2} title="공고 첨부파일에서 평가기준 추출" />
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            나라장터 공고의 공고서·규격서·제안요청서를 넣으면 평가항목과 배점, 통과 기준을 읽어 평가표를 만듭니다.
            파일은 이 브라우저 안에서만 읽고 어디에도 전송하지 않습니다.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="btn-ghost btn-sm cursor-pointer">
              파일 선택 (PDF·HWPX·DOCX·TXT)
              <input type="file" multiple accept=".pdf,.hwpx,.docx,.txt,.hwp" className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <a href={bid.detailUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-mint-600">나라장터 원문에서 첨부 내려받기</a>
            {busy && <span className="text-sm text-ink-300">읽는 중…</span>}
          </div>
          {docs.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {docs.map((d, i) => (
                <li key={i} className="flex justify-between rounded-lg bg-paper px-3 py-2">
                  <span className="truncate">{d.name}</span>
                  <span className="shrink-0 text-ink-300 tabular-nums">{d.pages ? `${d.pages}쪽 · ` : ""}{d.chars.toLocaleString()}자</span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-700">본문 붙여 넣기 · 예시로 해보기</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button key={s.label} type="button" className="chip hover:border-ink-300" onClick={() => setPaste(s.text)}>{s.label}</button>
              ))}
            </div>
            <textarea className="input mt-3 min-h-[150px] font-mono text-xs" placeholder="평가기준 부분을 복사해 붙여 넣으세요" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button type="button" className="btn-primary btn-sm mt-2" disabled={!paste.trim()} onClick={() => { textsRef.current = [...textsRef.current, paste]; runExtract(textsRef.current); }}>평가표 추출</button>
          </details>
          {docMsg && <p className="mt-3 rounded-xl bg-mint-50 px-3 py-2 text-sm text-mint-700">{docMsg}</p>}
        </section>

        {/* 3. 기업 정보 */}
        <section className="card p-6">
          <Step n={3} title="기업 정보와 신용평가 서류" />
          <div className="mt-4 grid gap-x-3 gap-y-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <span className="label">사업자등록번호 (나라장터 조달업체 조회)</span>
              <div className="flex gap-2">
                <input className="input" inputMode="numeric" placeholder="000-00-00000" value={bizno} onChange={(e) => setBizno(e.target.value)} />
                <button type="button" className="btn-primary btn-sm shrink-0" disabled={STATIC || bizno.replace(/\D/g, "").length !== 10} onClick={lookup}>불러오기</button>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                {corpMsg || (STATIC
                  ? "공개 미리보기에서는 직접 입력합니다. 이용 고객은 담당 매니저가 나라장터 등록 정보(개업일·종업원 수·등록 업종)를 불러와 채워 드립니다."
                  : "나라장터 사용자정보서비스에서 개업일·종업원 수·등록 업종을 가져옵니다.")}
              </p>
            </div>
            <Num label="업력 (년)" value={co.years} onChange={(v) => set("years", v)} />
            <Num label="종업원 수 (명)" value={co.employees} onChange={(v) => set("employees", v)} />
            <Num label="분야 기술인력 (명)" value={co.techStaff} onChange={(v) => set("techStaff", v)} />
            <div>
              <span className="label">3년 유사 실적 (억원)</span>
              <input className="input" inputMode="decimal" placeholder="예: 6.5" value={perfEok} onChange={(e) => { setPerfEok(e.target.value); set("pastPerformance", Math.round((Number(e.target.value) || 0) * 1e8)); }} />
            </div>
            <Num label="신인도 가점 (건)" value={co.bonusCount} onChange={(v) => set("bonusCount", v)} />
            <Num label="제재·벌점 (최근 2년)" value={co.penaltyCount} onChange={(v) => set("penaltyCount", v)} />
            <div className="sm:col-span-2">
              <span className="label">신용평가등급</span>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" value={co.creditGrade} onChange={(e) => set("creditGrade", e.target.value as CreditGrade)}>
                  {CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
                <label className="btn-ghost btn-sm cursor-pointer">
                  신용평가등급확인서로 읽기
                  <input type="file" accept=".pdf,.hwpx,.docx,.txt" className="sr-only" onChange={(e) => { onCreditFile(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              <p className="mt-1 text-xs text-ink-500">{creditMsg || "나라장터 API에는 등급이 없어 확인서에서 읽거나 직접 고릅니다."}</p>
            </div>
            <div>
              <span className="label">제안서 준비 수준</span>
              <div className="flex gap-2">
                {(["상", "중", "하"] as Level[]).map((l) => (
                  <button key={l} type="button" onClick={() => set("proposal", l)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${co.proposal === l ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500"}`}>{l}</button>
                ))}
              </div>
            </div>
            <Range label="투찰률 (예정가격 대비)" value={co.bidRate} onChange={(v) => set("bidRate", v)} />
            {isNego && <Range label="예상 최저 경쟁 투찰률" value={co.rivalRate} onChange={(v) => set("rivalRate", v)} />}
          </div>
        </section>
      </div>

      {/* 결과 */}
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <section className="overflow-hidden rounded-3xl bg-ink-900 text-white shadow-lift">
          <div className="p-6">
            <p className="text-sm text-ink-300">예상 평가점수</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-6xl font-extrabold tabular-nums tracking-tight">{result.total}<span className="text-xl text-ink-300">/{result.max}</span></p>
              {result.passed !== undefined && (
                <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${result.passed ? "bg-mint text-white" : "bg-coral text-white"}`}>
                  {result.passed ? "통과 예상" : "미달 예상"}
                </span>
              )}
            </div>
            {result.passLabel && (
              <p className="mt-2 text-sm text-ink-300">
                기준 {result.passLabel} · {result.gap !== undefined && (result.gap >= 0 ? `${result.gap}점 여유` : `${Math.abs(result.gap)}점 부족`)}
              </p>
            )}
            {isNego && <p className="mt-1 text-sm text-ink-300">기술 {result.techScore}/{result.techMax} · 가격 {Math.round((result.total - result.techScore) * 10) / 10}</p>}
            {result.rateWindow && (
              <div className="mt-4 rounded-xl bg-white/5 p-3">
                <p className="text-xs text-ink-300">통과 가능한 투찰률</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{result.rateWindow.low}% ~ {result.rateWindow.high}%</p>
              </div>
            )}
          </div>
          <ul className="space-y-4 border-t border-white/10 p-6">
            {result.items.map((i) => (
              <li key={i.id}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{i.label}</span>
                  <span className="shrink-0 tabular-nums text-ink-300">{i.score}/{i.max}</span>
                </div>
                {i.max > 0 && <ScoreBar value={Math.max(0, i.score)} max={i.max} />}
                <p className="mt-1 text-xs text-ink-300">{i.reason}{i.max > 0 ? ` · ${pct(i.score, i.max)}%` : ""}</p>
              </li>
            ))}
          </ul>
        </section>

        {result.tips.length > 0 && (
          <section className="card mt-4 p-6">
            <h3 className="font-bold">점수를 올릴 수 있는 곳</h3>
            <ol className="mt-3 space-y-2 text-sm leading-relaxed">
              {result.tips.map((t, n) => (
                <li key={t} className="flex gap-2"><span className="font-bold text-mint-600 tabular-nums">{n + 1}</span>{t}</li>
              ))}
            </ol>
          </section>
        )}
        <p className="mt-4 text-xs leading-relaxed text-ink-300">
          예측값은 평가표와 입력한 기업 정보로 계산한 추정치입니다. 실제 점수는 발주기관의 세부 평가기준, 서류 인정 범위, 정성평가 위원 판단에 따라 달라집니다.
        </p>
      </aside>

    {/* 평가표 (전체 폭) */}
    <section className="card min-w-0 p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{active.title}</h3>
          <div className="flex items-center gap-2">
            <span className="chip">{active.source === "extracted" ? `원문 추출 · 신뢰도 ${active.confidence}` : "표준 평가표"}</span>
            {sheet && <button type="button" className="text-xs font-semibold text-ink-500 hover:text-ink" onClick={() => { setSheet(null); setDocs([]); textsRef.current = []; setDocMsg(""); }}>표준으로 되돌리기</button>}
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {active.items.map((i) => (
            <li key={i.id} className="flex min-w-0 items-center gap-2 rounded-2xl border border-ink-100 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{i.label}</p>
                <p className="truncate text-xs text-ink-300">{i.group}{active.source === "template" && i.basis ? ` · ${i.basis}` : ""}</p>
              </div>
              <select aria-label="항목 유형" className="shrink-0 rounded-lg border border-ink-100 bg-white px-2 py-1 text-xs" value={i.kind} onChange={(e) => editItem(i.id, { kind: e.target.value as ItemKind })}>
                {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input aria-label="배점" type="number" step="0.5" min={0} className="w-16 shrink-0 rounded-lg border border-ink-100 px-2 py-1 text-right text-sm tabular-nums" value={i.max} onChange={(e) => editItem(i.id, { max: Number(e.target.value) || 0 })} />
              <button type="button" className="shrink-0 text-xs text-ink-300 hover:text-coral" onClick={() => removeItem(i.id)}>삭제</button>
            </li>
          ))}
        </ul>
        <AddItem onAdd={(label, max) => active && setSheet({ ...active, items: [...active.items, { id: `u${Date.now()}`, label, max, kind: kindOf(label), group: "추가 항목" }] })} />
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-ink-500">
          {active.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white tabular-nums">{n}</span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function Num({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <input className="input" type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="sm:col-span-3">
      <div className="flex justify-between"><span className="label">{label}</span><span className="text-sm font-bold tabular-nums">{value.toFixed(2)}%</span></div>
      <input type="range" min={80} max={100} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#12B886]" />
    </div>
  );
}

function AddItem({ onAdd }: { onAdd: (label: string, max: number) => void }) {
  const [label, setLabel] = useState("");
  const [max, setMax] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => { e.preventDefault(); if (label.trim() && Number(max) > 0) { onAdd(label.trim(), Number(max)); setLabel(""); setMax(""); } }}
    >
      <input className="input py-2 text-sm" placeholder="빠진 항목 추가 (예: 안전관리 계획)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="input w-24 py-2 text-sm" placeholder="배점" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
      <button className="btn-ghost btn-sm shrink-0">추가</button>
    </form>
  );
}
