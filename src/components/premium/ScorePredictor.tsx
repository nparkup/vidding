"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScoreBar } from "@/components/Badges";
import { readDocument, UnsupportedDocError } from "@/lib/docText";
import {
  CREDIT_GRADES, DEFAULT_COMPANY, findCreditGrade, kindOf, predict, templateSheet, yearsSince,
  type CompanyInput, type CreditGrade, type EvalItem, type EvalSheet, type ItemKind, type Level,
} from "@/lib/evalscore";
import { won } from "@/lib/format";
import type { Bid, BidAttachment } from "@/lib/types";
import { useBids } from "@/lib/useBids";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

interface BidDocs { files: BidAttachment[]; sheet?: EvalSheet; sheetFile?: string }

/** 정적 배포는 빌드 때 공고별로 만들어 둔 파일(첨부 목록 + 첨부에서 추출한 평가표)을, 서버 배포는 나라장터 첨부 목록을 바로 조회한다 */
async function loadBidDocs(bid: Bid): Promise<BidDocs> {
  const url = STATIC
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/attachments/${encodeURIComponent(bid.id)}.json`
    : `/api/premium/attachments?${new URLSearchParams({ no: bid.bidNtceNo, ord: bid.bidNtceOrd, biz: bid.bizType ?? "용역" })}`;
  const r = await fetch(url);
  if (!r.ok) return { files: [] };
  const j = await r.json();
  return Array.isArray(j) ? { files: j } : j;
}

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

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function ScorePredictor() {
  const sp = useSearchParams();
  const { bids, error } = useBids();
  const [bidId, setBidId] = useState<string | null>(sp.get("bid"));
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<EvalSheet | null>(null);
  const [co, setCo] = useState<CompanyInput>(DEFAULT_COMPANY);
  const [perfEok, setPerfEok] = useState("");
  const [creditMsg, setCreditMsg] = useState("");
  const [bizno, setBizno] = useState("");
  const [corpMsg, setCorpMsg] = useState("");

  const bid: Bid | undefined = useMemo(() => {
    if (!bids) return undefined;
    // 미리 고르지 않는다: 사용자가 검색해서 고른 공고(또는 공고 상세에서 넘어온 공고)만 쓴다
    return bidId ? bids.find((b) => b.id === bidId) : undefined;
  }, [bids, bidId]);

  const template = useMemo(() => (bid ? templateSheet(bid) : null), [bid]);
  const active = sheet ?? template;

  // 공고를 고르면 첨부 목록과, 첨부에서 미리 추출해 둔 평가표를 불러온다 (없으면 표준 평가표)
  const [docs, setDocs] = useState<BidDocs | null>(null);
  useEffect(() => {
    if (!bid) return;
    let alive = true;
    setDocs(null);
    setSheet(null);
    loadBidDocs(bid)
      .then((d) => { if (!alive) return; setDocs(d); if (d.sheet) setSheet(d.sheet); })
      .catch(() => alive && setDocs({ files: [] }));
    return () => { alive = false; };
  }, [bid]);

  const result = useMemo(() => (active && bid ? predict(active, bid, co) : null), [active, bid, co]);

  const matches = useMemo(() => {
    if (!bids || !query.trim()) return [];
    const q = query.trim().toLowerCase();
    return bids.filter((b) => b.title.toLowerCase().includes(q) || b.agency.includes(q) || b.bidNtceNo.toLowerCase().includes(q)).slice(0, 8);
  }, [bids, query]);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setCo((c) => ({ ...c, [k]: v }));

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

  const searchBox = (
          <div className={`relative ${bid ? "mt-3" : "mt-4"}`}>
            <input className="input" placeholder={bid ? "다른 공고 찾기: 공고명·기관명·공고번호" : "공고명·기관명·공고번호로 검색"} value={query} onChange={(e) => setQuery(e.target.value)} />
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
  );

  if (error) return <p className="card p-6 text-sm text-coral">공고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>;
  if (!bids) return <p className="card p-6 text-sm text-ink-300">공고 목록을 불러오는 중…</p>;

  // 공고를 고르기 전: 검색만 보이고, 결과 자리에는 안내만 둔다
  if (!bid || !active || !result) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <p className="mt-2 text-sm text-ink-500">분석할 공고를 검색해 고르세요. 고른 공고의 첨부파일에서 평가기준을 확인해 평가표를 바로 적용합니다.</p>
          {searchBox}
        </section>
        <aside className="card grid min-h-[12rem] min-w-0 place-items-center p-6 text-center">
          <div>
            <p className="font-bold">예상 평가점수</p>
            <p className="mt-2 text-sm text-ink-500">공고를 고르면 기업 정보 입력란과 항목별 예상 점수가 나옵니다.</p>
          </div>
        </aside>
      </div>
    );
  }

  const isNego = active.method === "협상에 의한 계약" || active.method === "종합심사";

  return (
    <div className="space-y-6">
    {/* 입력과 결과: 결과 패널의 sticky 범위를 이 두 칸으로 한정해 아래 평가표를 덮지 않게 한다 */}
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
          {searchBox}
          {/* 고른 공고의 첨부파일을 자동으로 확인해 평가표를 적용한다 (첨부가 없으면 표시하지 않는다) */}
          {(!docs || docs.sheet || docs.files.length > 0) && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            {!docs ? (
              <p className="text-sm text-ink-300">첨부파일 확인 중…</p>
            ) : (
              <>
                {(docs.sheet || docs.files.length > 0) && (
                  <p className={`rounded-xl px-3 py-2 text-sm ${docs.sheet ? "bg-mint-50 text-mint-700" : "bg-paper text-ink-500"}`}>
                    {docs.sheet
                      ? `첨부 '${docs.sheetFile}'에서 평가항목 ${docs.sheet.items.length}개를 읽어 원문 배점으로 계산합니다.`
                      : `이 공고의 첨부에서 평가 배점표를 찾지 못해 ${bid.contractMethod} 표준 평가표로 계산합니다.`}
                  </p>
                )}
                {docs.files.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {docs.files.map((f) => (
                      <li key={f.url}>
                        <a href={f.url} target="_blank" rel="noreferrer" className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-100/60 ${f.name === docs.sheetFile ? "bg-mint-50 font-semibold" : "bg-paper"}`}>
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 text-xs text-ink-300">{f.name === docs.sheetFile ? "평가표 출처" : f.kind}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          )}
        </section>

        {/* 2. 기업 정보 */}
        <section className="card p-6">
          <Step n={2} title="기업 정보와 신용평가 서류" />
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
          {active.source === "extracted" && active.items.some((i) => i.bands || i.recognition || i.criteria) || active.scale
            ? "점수 구간·서류 인정 범위·정성 등급은 공고 첨부에서 읽은 기준을 적용했습니다. 정성평가는 위원이 제안서와 발표를 보고 매기므로, 제안 준비 수준으로 고른 등급은 예상치입니다. 실제로 인정되는 서류는 제출 전 공고 원문으로 확인하세요."
            : "예측값은 평가표와 입력한 기업 정보로 계산한 추정치입니다. 공고 첨부에서 세부기준을 읽지 못한 항목은 표준 규칙으로 계산했고, 정성평가는 위원 판단에 따라 달라집니다."}
        </p>
      </aside>
    </div>

    {/* 평가표 (전체 폭) */}
    <section className="card min-w-0 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{active.title}</h3>
          <div className="flex items-center gap-2">
            <span className="chip">{active.source === "extracted" ? `원문 추출 · 신뢰도 ${active.confidence}` : "표준 평가표"}</span>
            {sheet && <button type="button" className="text-xs font-semibold text-ink-500 hover:text-ink" onClick={() => setSheet(null)}>표준으로 되돌리기</button>}
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {active.items.map((i) => (
            <li key={i.id} className="min-w-0 rounded-2xl border border-ink-100 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-semibold">{i.label}</p>
                  <p className="truncate text-xs text-ink-300">{i.group}{active.source === "template" && i.basis ? ` · ${i.basis}` : ""}</p>
                </div>
                <select aria-label="항목 유형" className="shrink-0 rounded-lg border border-ink-100 bg-white px-2 py-1 text-xs" value={i.kind} onChange={(e) => editItem(i.id, { kind: e.target.value as ItemKind })}>
                  {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <input aria-label="배점" type="number" step="0.5" min={0} className="w-16 shrink-0 rounded-lg border border-ink-100 px-2 py-1 text-right text-sm tabular-nums" value={i.max} onChange={(e) => editItem(i.id, { max: Number(e.target.value) || 0 })} />
                <button type="button" className="shrink-0 text-xs text-ink-300 hover:text-coral" onClick={() => removeItem(i.id)}>삭제</button>
              </div>
              <ItemDetail item={i} />
            </li>
          ))}
        </ul>
        <SheetDetail sheet={active} />
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

/** 항목별 세부기준: 공고의 점수 구간, 인정 범위, 평가 요소 */
function ItemDetail({ item }: { item: EvalItem }) {
  if (!item.bands && !item.recognition && !item.criteria) return null;
  return (
    <div className="mt-2 space-y-1.5 border-t border-ink-100 pt-2 text-xs leading-relaxed">
      {item.bands && (
        <div className="flex flex-wrap gap-1">
          {item.bands.map((b) => (
            <span key={b.cond + b.points} className="rounded-md bg-ink-50 px-1.5 py-0.5 tabular-nums text-ink-500">{b.cond} <b className="text-ink">{b.points}</b></span>
          ))}
        </div>
      )}
      {item.recognition?.map((r) => <p key={r} className="text-ink-500"><span className="font-semibold text-ink">인정 범위</span> {r}</p>)}
      {item.criteria && <p className="text-ink-500"><span className="font-semibold text-ink">평가 요소</span> {item.criteria.join(" / ")}</p>}
    </div>
  );
}

/** 평가표 전체 기준: 정성 등급표, 위원 점수 처리, 서류 인정 기준 */
function SheetDetail({ sheet }: { sheet: EvalSheet }) {
  if (!sheet.scale && !sheet.panelRule && !sheet.recognition) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
      {(sheet.scale || sheet.panelRule) && (
        <div className="rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-relaxed">
          <p className="text-sm font-semibold">정성평가 방식</p>
          {sheet.scale && <p className="mt-1 tabular-nums text-ink-500">등급 {sheet.scale.map((l) => `${l.label} ${Math.round(l.ratio * 100)}%`).join(" · ")}</p>}
          {sheet.panelRule && <p className="mt-1 text-ink-500">{sheet.panelRule}</p>}
          <p className="mt-1 text-ink-300">제안 준비 수준 상·중·하를 이 등급에 대응시켜 계산합니다. 위원별 실제 판단은 알 수 없어 예상치입니다.</p>
        </div>
      )}
      {sheet.recognition && (
        <div className="rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-relaxed">
          <p className="text-sm font-semibold">서류 인정 기준</p>
          <ul className="mt-1 space-y-0.5 text-ink-500">{sheet.recognition.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
