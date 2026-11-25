"use client";

import { Fragment, useState } from "react";
import { looksLikeBizno, normCorpName, type CorpHit, type CorpSearchResult } from "@/lib/awards/corps";

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const API = STATIC ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";

const fmtBizno = (n: string) => n.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3");

/**
 * 사업자등록번호 또는 기업명 입력칸. 번호면 바로 조회하고, 이름이면 낙찰 저장소에서 후보를 찾아 고르게 한다.
 * 같은 이름 업체가 여럿이면 사업자번호·낙찰 건수·최근 낙찰·주 지역으로 구분해 고른다.
 */
export function CorpSearch({ id, label, value, onChange, onBizno, busy, button = "조회", disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** 사업자번호(숫자만 또는 하이픈 포함)로 조회 */
  onBizno: (bizno: string, name?: string) => void;
  busy?: boolean;
  button?: string;
  disabled?: boolean;
}) {
  const [res, setRes] = useState<CorpSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit() {
    const v = value.trim();
    setMsg("");
    if (!v) return;
    if (looksLikeBizno(v)) { setRes(null); onBizno(v); return; }
    if (normCorpName(v).length < 2) { setRes(null); setMsg("기업명은 법인 형태(주식회사 등)를 빼고 두 글자 이상 넣어 주세요."); return; }
    if (!API) { setMsg("이 미리보기에서는 기업명 찾기를 쓸 수 없습니다. 사업자등록번호를 넣어 주세요."); return; }
    setSearching(true); setRes(null);
    try {
      const r = await fetch(`${API}?${new URLSearchParams({ corps: v })}`);
      const j = (await r.json()) as CorpSearchResult;
      if (j.error) throw new Error(j.error);
      if (!j.ready) throw new Error("기업명 색인을 만드는 중입니다. 잠시 뒤 다시 찾거나 사업자등록번호를 넣어 주세요.");
      if (!j.hits.length) { setMsg(`'${v}'(으)로 시작하는 업체를 10년치 낙찰·개찰 기록에서 찾지 못했습니다. 사업자등록번호로 조회해 보세요.`); return; }
      setRes(j);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "찾지 못했습니다.");
    } finally { setSearching(false); }
  }

  function pick(h: CorpHit) {
    setRes(null);
    onChange(fmtBizno(h.bizno));
    onBizno(h.bizno, h.name);
  }

  const loading = busy || searching;
  return (
    <div className="min-w-0">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="label" htmlFor={id}>{label}</label>
        <div className="flex gap-2">
          <input id={id} className="input" placeholder="000-00-00000 또는 기업명" value={value} autoComplete="off"
            onChange={(e) => { onChange(e.target.value); if (res) setRes(null); if (msg) setMsg(""); }} />
          <button className="btn-primary btn-sm shrink-0" disabled={loading || disabled || !value.trim()}>{searching ? "찾는 중" : busy ? "조회 중" : button}</button>
        </div>
      </form>
      {msg && <p className="mt-2 text-sm text-coral">{msg}</p>}
      {res && (
        <div className="mt-2 overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <p className="border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
            &apos;{res.query}&apos;(으)로 시작하는 업체 {res.total.toLocaleString()}곳{res.total > res.hits.length ? ` 중 낙찰 많은 ${res.hits.length}곳` : ""}. 사업자번호를 보고 골라 주세요.
          </p>
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto overflow-x-hidden">
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
                      h.tops > h.wins ? `개찰 5위 안 ${h.tops.toLocaleString()}건` : "",
                      h.last ? `최근 ${h.last.slice(0, 7).replace("-", ".")}` : "",
                      h.biz,
                      h.region ? `주 지역 ${h.region}` : "",
                    ].filter(Boolean).map((t, i) => <Fragment key={t}>{i ? " · " : ""}<span className="whitespace-nowrap">{t}</span></Fragment>)}
                  </span>
                  {h.formerNames.length > 0 && <span className="mt-0.5 block text-xs text-ink-400">예전 상호 {h.formerNames.slice(0, 2).join(", ")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
