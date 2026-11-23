"use client";

import { Fragment, useState } from "react";
import { looksLikeBizno, normCorpName, type CorpHit, type CorpSearchResult } from "@/lib/awards/corps";
import { normalizeBizno, validBizno, type CorpLookup } from "@/lib/corpLookup";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const API = STATIC ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";
const BIZNO_API = STATIC ? API : "/api/premium/corp";

const fmtBizno = (n: string) => n.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");

type Note = { tone: "ok" | "warn"; text: string };

/**
 * 회원가입 기본 정보의 회사명·사업자등록번호 칸.
 * 위 찾기 칸에 회사명 또는 사업자등록번호를 넣어 조회하면 두 칸을 채운다. 이름은 10년치 낙찰·개찰 기록의 업체 후보에서 고르고,
 * 번호는 국세청·나라장터·금융위원회 기업 정보에서 상호를 가져온다. 공공입찰 기록이 없는 회사는 아래 두 칸에 직접 쓰면 된다.
 * 가입 폼 안에 있으므로 따로 form을 두지 않고 Enter·버튼으로 조회한다.
 */
export function SignupCompanyFields() {
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [bizno, setBizno] = useState("");
  const [res, setRes] = useState<CorpSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  async function lookup() {
    const v = q.trim();
    setNote(null); setRes(null);
    if (!v) return;
    if (looksLikeBizno(v)) return byBizno(v);
    if (normCorpName(v).length < 2) { setNote({ tone: "warn", text: "회사명은 법인 형태(주식회사 등)를 빼고 두 글자 이상 넣어 주세요." }); return; }
    if (!API) { setNote({ tone: "warn", text: "이 미리보기에서는 회사명 찾기를 쓸 수 없습니다. 사업자등록번호로 조회하거나 아래에 직접 입력해 주세요." }); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}?${new URLSearchParams({ corps: v })}`);
      const j = (await r.json()) as CorpSearchResult;
      if (j.error) throw new Error(j.error);
      if (!j.ready) throw new Error("회사명 색인을 만드는 중입니다. 사업자등록번호로 조회하거나 아래에 직접 입력해 주세요.");
      if (!j.hits.length) { setNote({ tone: "warn", text: `'${v}'(으)로 시작하는 업체가 공공입찰 낙찰·개찰 기록에 없습니다. 사업자등록번호로 조회하거나 아래에 직접 입력해 주세요.` }); return; }
      setRes(j);
    } catch (e) {
      setNote({ tone: "warn", text: e instanceof Error ? e.message : "찾지 못했습니다. 아래에 직접 입력해 주세요." });
    } finally { setBusy(false); }
  }

  async function byBizno(v: string) {
    const no = normalizeBizno(v);
    if (!validBizno(no)) { setNote({ tone: "warn", text: "올바른 사업자등록번호가 아닙니다. 숫자 10자리를 다시 확인해 주세요." }); return; }
    setBizno(fmtBizno(no));
    if (!BIZNO_API) { setNote({ tone: "warn", text: "사업자등록번호를 넣었습니다. 회사명은 아래에 직접 입력해 주세요." }); return; }
    setBusy(true);
    try {
      const r = await fetch(`${BIZNO_API}?${new URLSearchParams({ bizno: no })}`);
      const j = (await r.json()) as CorpLookup & { error?: string };
      if (j.error) throw new Error(j.error);
      const name = j.nara?.corpName || j.fsc?.corpName || j.corpName || "";
      const state = j.nts?.state ?? "";
      const stateNote = j.nts && !j.nts.registered ? " 국세청에 등록되지 않은 번호로 나옵니다. 번호를 다시 확인해 주세요." : state && state !== "계속사업자" ? ` 국세청 상태는 '${state}'입니다.` : "";
      if (name) {
        setCompany(name);
        setNote({ tone: stateNote ? "warn" : "ok", text: `회사명과 사업자등록번호를 채웠습니다. 회사명이 다르면 아래에서 고쳐 주세요.${stateNote}` });
      } else {
        setNote({ tone: "warn", text: `사업자등록번호를 넣었습니다. 등록된 상호를 찾지 못해 회사명은 아래에 직접 입력해 주세요.${stateNote}` });
      }
    } catch {
      setNote({ tone: "warn", text: "기업 정보를 불러오지 못했습니다. 사업자등록번호는 넣었으니 회사명은 아래에 직접 입력해 주세요." });
    } finally { setBusy(false); }
  }

  function pick(h: CorpHit) {
    setRes(null);
    setCompany(h.name);
    setBizno(fmtBizno(h.bizno));
    setQ(h.name);
    setNote({ tone: "ok", text: "회사명과 사업자등록번호를 채웠습니다. 회사명이 다르면 아래에서 고쳐 주세요." });
  }

  return (
    <>
      <div className="min-w-0 sm:col-span-2">
        <label className="label" htmlFor="corpFind">회사 찾기 <span className="font-normal text-ink-300">(회사명 또는 사업자등록번호)</span></label>
        <div className="flex gap-2">
          <input id="corpFind" className="input min-w-0" placeholder="한빛종합건설 또는 000-00-00000" value={q} autoComplete="off" enterKeyHint="search"
            onChange={(e) => { setQ(e.target.value); if (res) setRes(null); if (note) setNote(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) lookup(); } }} />
          <button type="button" className="btn-primary btn-sm shrink-0" disabled={busy || !q.trim()} onClick={lookup}>{busy ? "조회 중" : "조회"}</button>
        </div>
        <p className="mt-1.5 text-xs text-ink-400">조회해서 고르면 회사명과 사업자등록번호가 채워집니다. 공공입찰 기록이 없는 회사는 아래에 직접 입력해 주세요.</p>
        {note && <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${note.tone === "ok" ? "bg-mint-50 text-mint-700" : "bg-coral-100 text-coral"}`}>{note.text}</p>}
        {res && (
          <div className="mt-2 min-w-0 rounded-2xl border border-ink-100 bg-white">
            <p className="border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
              &apos;{res.query}&apos;(으)로 시작하는 업체 {res.total.toLocaleString()}곳{res.total > res.hits.length ? ` 중 낙찰 많은 ${res.hits.length}곳` : ""}. 사업자번호를 보고 골라 주세요.
            </p>
            <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto overflow-x-hidden">
              {res.hits.map((h) => (
                <li key={h.bizno}>
                  <button type="button" className="block w-full px-3 py-2.5 text-left hover:bg-mint-50" onClick={() => pick(h)}>
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 break-all text-sm font-semibold">{h.name}</span>
                      <span className="text-xs tabular-nums text-ink-500">{fmtBizno(h.bizno)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {[
                        h.wins ? `낙찰 ${h.wins.toLocaleString()}건` : "낙찰 없음",
                        h.last ? `최근 ${h.last.slice(0, 7).replace("-", ".")}` : "",
                        h.region ? `주 지역 ${h.region}` : "",
                      ].filter(Boolean).map((t, i) => <Fragment key={t}>{i ? " · " : ""}<span className="whitespace-nowrap">{t}</span></Fragment>)}
                    </span>
                    {h.formerNames.length > 0 && <span className="mt-0.5 block text-xs text-ink-400">예전 상호 {h.formerNames.slice(0, 2).join(", ")}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="block w-full border-t border-ink-100 px-3 py-2 text-left text-xs text-ink-500 hover:bg-ink-50" onClick={() => setRes(null)}>
              목록에 없으면 닫고 아래에 직접 입력
            </button>
          </div>
        )}
      </div>
      <div className="min-w-0"><label className="label" htmlFor="company">회사명 *</label><input id="company" name="company" required maxLength={100} className="input" placeholder="(주)한빛종합건설" value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      <div className="min-w-0">
        <label className="label" htmlFor="bizno">사업자등록번호 *</label>
        <input id="bizno" name="bizno" required inputMode="numeric" maxLength={14} className="input" placeholder="000-00-00000" value={bizno} onChange={(e) => setBizno(e.target.value)} />
      </div>
    </>
  );
}
