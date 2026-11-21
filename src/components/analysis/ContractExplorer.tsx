"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { won, wonFull } from "@/lib/format";
import { contractHref, contractUrl, type Contract } from "@/lib/contracts";
import { loadSiteJson } from "@/lib/useSiteJson";

type Sort = "new" | "amount" | "end";

/** 계약현황: 최근 2주 나라장터 경쟁 계약을 기관·업체·사업자번호로 찾는다 */
export function ContractExplorer() {
  const [list, setList] = useState<Contract[] | null>(null);
  const [q, setQ] = useState("");
  const [corp, setCorp] = useState("");
  const [biz, setBiz] = useState("");
  const [cat, setCat] = useState("");
  const [min, setMin] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadSiteJson<Contract[]>("contracts-data.json").then(setList).catch(() => setList([]));
    try {
      const p = new URLSearchParams(location.search);
      if (p.get("corp")) setCorp(p.get("corp")!);
      if (p.get("q")) setQ(p.get("q")!);
    } catch { /* 주소 읽기 실패는 무시 */ }
  }, []);

  const cats = useMemo(() => [...new Set((list ?? []).filter((c) => !biz || c.biz === biz).map((c) => c.category))].sort(), [list, biz]);
  const shown = useMemo(() => {
    const words = q.trim().split(/\s+/).filter(Boolean);
    const cw = corp.trim();
    const cd = cw.replace(/\D/g, "");
    const lo = Number(min) * 1e4 || 0;
    const xs = (list ?? []).filter((c) =>
      (!biz || c.biz === biz) && (!cat || c.category === cat) && c.amount >= lo &&
      (!cw || c.corps.some((k) => (cd.length === 10 ? k.bizNo === cd : k.name.includes(cw)))) &&
      words.every((w) => `${c.title} ${c.agency} ${c.demand}`.includes(w)));
    const by: Record<Sort, (a: Contract, b: Contract) => number> = {
      new: (a, b) => b.date.localeCompare(a.date) || b.amount - a.amount,
      amount: (a, b) => b.amount - a.amount,
      end: (a, b) => (a.end ?? "9").localeCompare(b.end ?? "9"),
    };
    return xs.sort(by[sort]);
  }, [list, q, corp, biz, cat, min, sort]);
  const total = useMemo(() => shown.reduce((s, c) => s + c.amount, 0), [shown]);
  // 업체로 찾았을 때 그 업체의 계약 요약
  const corpSummary = useMemo(() => {
    if (!corp.trim()) return null;
    const agencies = new Map<string, number>();
    for (const c of shown) agencies.set(c.demand, (agencies.get(c.demand) ?? 0) + 1);
    return { n: shown.length, top: [...agencies.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }, [corp, shown]);

  return (
    <div className="container-x py-8">
      <div className="card grid grid-cols-2 gap-3 p-4 lg:grid-cols-6 sm:p-5">
        <label className="col-span-2 min-w-0">
          <span className="label">계약명·기관</span>
          <input className="input" placeholder="예: 청소, 교육청" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="col-span-2 min-w-0">
          <span className="label">계약업체 (이름 또는 사업자번호)</span>
          <input className="input" placeholder="예: 경쟁사 이름" value={corp} onChange={(e) => setCorp(e.target.value)} />
        </label>
        <label className="min-w-0">
          <span className="label">업무</span>
          <select className="input" value={biz} onChange={(e) => { setBiz(e.target.value); setCat(""); }}>
            <option value="">전체</option><option>용역</option><option>공사</option><option>물품</option>
          </select>
        </label>
        <label className="min-w-0">
          <span className="label">분야</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">전체</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-3 lg:col-span-6">
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0">금액</span>
            <input className="input w-28 py-1.5" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} aria-label="금액 만원 이상" />
            <span className="shrink-0">만원 이상</span>
          </label>
          <select className="input ml-auto w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="new">최근 계약순</option><option value="amount">금액 큰순</option><option value="end">계약 끝나는 날 빠른순</option>
          </select>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-500">
        {list ? `최근 2주 경쟁 계약 ${list.length.toLocaleString()}건 중 ${shown.length.toLocaleString()}건${total ? ` · 합계 ${won(total)}` : ""}` : "불러오는 중…"}
      </p>
      {corpSummary && corpSummary.n > 0 && (
        <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">이 업체는 최근 2주 {corpSummary.n}건을 계약했습니다. 주요 기관: {corpSummary.top.map(([a, n]) => `${a} ${n}건`).join(", ")}</p>
      )}

      <ul className="mt-3 space-y-3">
        {shown.slice(0, limit).map((c) => {
          const end = c.end;
          return (
            <li key={c.no} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip border-ink bg-ink text-white">계약 {c.date}</span>
                <span className="chip">{c.biz}{c.div && c.div !== c.biz ? ` · ${c.div}` : ""}</span>
                <span className="chip">{c.category}</span>
                <span className="chip">{c.method}</span>
                {c.kind && c.kind !== "신규" && <span className="chip">{c.kind}</span>}
                {c.corps.length > 1 && <span className="chip">공동수급 {c.corps.length}개사</span>}
              </div>
              <h3 className="mt-2 font-bold leading-snug [overflow-wrap:anywhere]"><Link href={contractHref(c.no)} className="hover:text-mint-700">{c.title}</Link></h3>
              <p className="mt-1 text-sm text-ink-500 [overflow-wrap:anywhere]">
                {[c.demand === c.agency ? c.demand : `${c.demand} (계약 ${c.agency})`, `계약금액 ${won(c.amount)} (${wonFull(c.amount)})`, c.total ? `총 ${won(c.total)}` : "", end ? `계약 끝 ${end}` : c.period ? `기간 ${c.period}` : ""].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-sm">
                {c.corps.map((k, i) => (
                  <span key={i} className="mr-3 inline-block">
                    <button type="button" className="font-semibold underline decoration-ink-200 underline-offset-2 hover:text-mint-700" onClick={() => setCorp(k.bizNo ?? k.name)}>{k.name}</button>
                    {k.share && c.corps.length > 1 ? <span className="text-ink-400"> {k.share}%</span> : null}
                  </span>
                ))}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={contractHref(c.no)} className="btn-mint btn-sm">계약 상세 보기</Link>
                <a href={contractUrl(c)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-ink-500">나라장터 원문</a>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && <button type="button" onClick={() => setLimit((l) => l + 50)} className="btn-ghost mt-4 w-full">더 보기 ({(shown.length - limit).toLocaleString()}건 남음)</button>}
      <p className="mt-6 text-xs leading-relaxed text-ink-400">
        나라장터 계약정보에서 최근 2주 동안 등록된 일반·제한·지명경쟁 계약입니다. 수의계약은 뺐습니다. 장기계속계약은 이번 차수 금액을 계약금액으로 보여 줍니다. 업체 이름을 누르면 그 업체의 계약만 모아 봅니다.
      </p>
    </div>
  );
}
