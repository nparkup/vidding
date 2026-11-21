"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { TRIAL_LIMIT } from "@/lib/trialLimit";

/** 중계 서버가 돌려주는 가입자 한 명 (worker/corp-lookup signup·listMembers) */
interface Member {
  company: string;
  bizno: string;
  name: string;
  email: string;
  phone: string;
  licenses?: string[];
  regions?: string[];
  size?: string;
  keywords?: string;
  agreeMail?: boolean;
  plan?: string;
  joinedAt?: string;
  trial: { k: string; t: number }[];
}

/** 로그인 토큰(12시간)은 이 탭에만 둔다. 비밀번호는 저장하지 않는다 */
const TOKEN_KEY = "bm-admin-token";
const SIZE_LABEL: Record<string, string> = {
  "0-100000000": "1억 이하",
  "50000000-500000000": "5천만 ~ 5억",
  "300000000-2000000000": "3억 ~ 20억",
  "1000000000-10000000000": "10억 이상",
};
const bizFmt = (b: string) => (b.length === 10 ? `${b.slice(0, 3)}-${b.slice(3, 5)}-${b.slice(5)}` : b);
const day = (iso?: string | number) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const bidLink = (k: string) => (k.startsWith("apt:") ? `/apt-bids/view?no=${encodeURIComponent(k.slice(4))}` : `/bids/view?id=${encodeURIComponent(k.slice(5))}`);

type Use = "all" | "none" | "some" | "full";

/**
 * 관리자 화면: 아이디·비밀번호로 로그인하면 중계 서버가 12시간짜리 토큰을 주고, 그 토큰으로 가입자와 체험 사용 공고를 받아 온다.
 * 검색(회사명·사업자번호·담당자·이메일·연락처), 메일 수신 동의·체험 사용 정도로 거르기, CSV 내려받기, 탈퇴 처리(삭제).
 */
export function MembersAdmin({ api }: { api: string }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [list, setList] = useState<Member[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [mailOnly, setMailOnly] = useState(false);
  const [use, setUse] = useState<Use>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  async function login() {
    if (!api) { setMsg("중계 서버 주소가 없어 로그인할 수 없습니다."); return; }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`${api}?adminlogin=1`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password: pw }) });
      const j = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!r.ok || !j.token) { setMsg(j.error ?? `로그인하지 못했습니다 (${r.status})`); return; }
      setPw("");
      setToken(j.token);
      try { sessionStorage.setItem(TOKEN_KEY, j.token); } catch { /* 무시 */ }
      await load(j.token);
    } catch {
      setMsg("중계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function load(t: string) {
    if (!api) { setMsg("중계 서버 주소가 없어 가입자를 불러올 수 없습니다."); return; }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`${api}?members=1`, { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { members?: Member[]; error?: string };
      if (!r.ok) {
        if (r.status === 401) logout();
        setMsg(r.status === 401 ? "로그인 시간이 지났습니다. 다시 로그인해 주세요." : j.error ?? `불러오지 못했습니다 (${r.status})`);
        return;
      }
      setAuthed(true);
      setList((j.members ?? []).map((m) => ({ ...m, trial: Array.isArray(m.trial) ? m.trial : [] })));
    } catch {
      setMsg("중계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { /* 무시 */ }
    // 토큰 앞부분이 만료 시각이라 지난 토큰은 서버에 보내지 않는다
    if (saved && Number(saved.split(".")[0]) > Date.now()) { setToken(saved); load(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(bizno: string) {
    setBusy(true);
    try {
      const r = await fetch(`${api}?members=1&delete=${bizno}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) { logout(); setMsg("로그인 시간이 지났습니다. 다시 로그인해 주세요."); return; }
      if (!r.ok) { setMsg("삭제하지 못했습니다."); return; }
      setList((l) => l?.filter((m) => m.bizno !== bizno) ?? null);
      setMsg(`${bizFmt(bizno)} 가입 정보를 삭제했습니다.`);
    } finally {
      setBusy(false);
      setConfirmDel(null);
    }
  }

  function logout() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ }
    setAuthed(false);
    setList(null);
    setToken("");
  }

  const sorted = useMemo(() => [...(list ?? [])].sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "")), [list]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sorted.filter((m) => {
      const n = m.trial.length;
      if (mailOnly && !m.agreeMail) return false;
      if (use === "none" && n > 0) return false;
      if (use === "some" && (n === 0 || n >= TRIAL_LIMIT)) return false;
      if (use === "full" && n < TRIAL_LIMIT) return false;
      const hay = `${m.company} ${m.bizno} ${bizFmt(m.bizno)} ${m.name} ${m.email} ${m.phone}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [sorted, q, mailOnly, use]);

  const stats = useMemo(() => {
    const all = list ?? [];
    const week = Date.now() - 7 * 86400_000;
    return {
      total: all.length,
      recent: all.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() >= week).length,
      used: all.filter((m) => m.trial.length > 0).length,
      full: all.filter((m) => m.trial.length >= TRIAL_LIMIT).length,
      mail: all.filter((m) => m.agreeMail).length,
    };
  }, [list]);

  function downloadCsv() {
    const head = ["회사명", "사업자등록번호", "담당자", "연락처", "이메일", "가입일", "체험 사용", "분석한 공고", "메일 수신 동의", "업종·면허", "지역", "규모", "관심 키워드", "관심 결제 방식"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = shown.map((m) => [
      m.company, bizFmt(m.bizno), m.name, m.phone, m.email, day(m.joinedAt), `${m.trial.length}/${TRIAL_LIMIT}`,
      m.trial.map((t) => t.k).join(" "), m.agreeMail ? "동의" : "", (m.licenses ?? []).join(" "), (m.regions ?? []).join(" "),
      SIZE_LABEL[m.size ?? ""] ?? "", m.keywords ?? "", m.plan ?? "",
    ].map((v) => esc(String(v ?? ""))).join(","));
    // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다
    const blob = new Blob(["﻿" + [head.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `가입자_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink-100 bg-white">
        <div className="container-x flex items-center justify-between gap-3 py-4">
          <Logo />
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">관리자</span>
            {authed && <button type="button" onClick={() => { logout(); setMsg(""); }} className="btn-ghost btn-sm">로그아웃</button>}
          </div>
        </div>
      </header>

      <main className="container-x py-8">
        {!authed ? (
          <form className="card mx-auto max-w-sm p-6" onSubmit={(e) => { e.preventDefault(); if (id && pw) login(); }}>
            <h1 className="text-xl font-extrabold">관리자 로그인</h1>
            <p className="mt-1 text-sm text-ink-500">관리자 페이지는 로그인한 뒤에 이용할 수 있습니다.</p>
            <label className="label mt-5" htmlFor="admin-id">아이디</label>
            <input id="admin-id" autoComplete="username" className="input" value={id} onChange={(e) => setId(e.target.value)} />
            <label className="label mt-3" htmlFor="admin-pw">비밀번호</label>
            <input id="admin-pw" type="password" autoComplete="current-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
            {msg && <p className="mt-3 rounded-xl bg-coral-100 p-3 text-sm text-coral">{msg}</p>}
            <button className="btn-primary mt-5 w-full" disabled={busy || !id || !pw}>{busy ? "확인 중…" : "로그인"}</button>
            <p className="mt-3 text-xs text-ink-400">로그인은 12시간 동안 이 탭에서만 유지되고, 탭을 닫거나 로그아웃하면 끝납니다.</p>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold">무료 체험 가입자</h1>
                <p className="mt-1 text-sm text-ink-500">회원가입한 업체와 무료 체험으로 분석한 공고입니다. 최근 가입 순.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => load(token)} className="btn-ghost btn-sm" disabled={busy}>{busy ? "불러오는 중…" : "새로 불러오기"}</button>
                <button type="button" onClick={downloadCsv} className="btn-primary btn-sm" disabled={!shown.length}>CSV 내려받기</button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 sm:grid-cols-5">
              {[
                ["전체 가입", stats.total],
                ["최근 7일 가입", stats.recent],
                ["체험 사용", stats.used],
                [`${TRIAL_LIMIT}건 모두 사용`, stats.full],
                ["메일 수신 동의", stats.mail],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-white px-4 py-3 last:col-span-2 sm:last:col-span-1">
                  <p className="text-xs text-ink-400">{k}</p>
                  <p className="mt-0.5 text-xl font-extrabold tabular-nums">{(v as number).toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input className="input sm:max-w-sm" placeholder="회사명·사업자번호·담당자·이메일·연락처" value={q} onChange={(e) => setQ(e.target.value)} aria-label="가입자 검색" />
              <select className="input sm:w-auto" value={use} onChange={(e) => setUse(e.target.value as Use)} aria-label="체험 사용">
                <option value="all">체험 사용 전체</option>
                <option value="none">아직 안 씀</option>
                <option value="some">사용 중 (1~{TRIAL_LIMIT - 1}건)</option>
                <option value="full">{TRIAL_LIMIT}건 모두 사용</option>
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mailOnly} onChange={(e) => setMailOnly(e.target.checked)} />메일 수신 동의만</label>
            </div>
            {msg && <p className="mt-3 text-sm text-ink-500">{msg}</p>}
            <p className="mt-3 text-xs text-ink-400">{shown.length.toLocaleString()}명 표시 / 전체 {stats.total.toLocaleString()}명</p>

            {/* 좁은 화면: 카드 목록 */}
            <ul className="mt-3 space-y-3 md:hidden">
              {shown.map((m) => (
                <li key={m.bizno} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold [overflow-wrap:anywhere]">{m.company}</p>
                      <p className="text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)} · {day(m.joinedAt)}</p>
                    </div>
                    <TrialBadge n={m.trial.length} />
                  </div>
                  <p className="mt-2 text-sm">{m.name} · <span className="tabular-nums">{m.phone}</span></p>
                  <a href={`mailto:${m.email}`} className="block text-sm text-mint-600 [overflow-wrap:anywhere]">{m.email}</a>
                  <p className="mt-1 text-xs text-ink-500">메일 수신 {m.agreeMail ? "동의" : "미동의"}</p>
                  <button type="button" onClick={() => setOpen(open === m.bizno ? null : m.bizno)} className="btn-ghost btn-sm mt-3">{open === m.bizno ? "닫기" : "상세"}</button>
                  {open === m.bizno && <div className="mt-3 border-t border-ink-100 pt-3"><MemberDetail m={m} confirming={confirmDel === m.bizno} onAskDelete={() => setConfirmDel(m.bizno)} onCancel={() => setConfirmDel(null)} onDelete={() => remove(m.bizno)} busy={busy} /></div>}
                </li>
              ))}
              {!shown.length && <li className="card p-6 text-center text-sm text-ink-400">{stats.total ? "조건에 맞는 가입자가 없습니다." : "아직 가입자가 없습니다."}</li>}
            </ul>

            <div className="card mt-3 hidden overflow-x-auto md:block">
              <table className="table-x min-w-[880px]">
                <thead>
                  <tr>
                    <th>회사명 · 사업자번호</th>
                    <th>담당자</th>
                    <th>연락처 · 이메일</th>
                    <th>가입일</th>
                    <th className="text-center">체험 사용</th>
                    <th className="text-center">메일 수신</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <MemberRow key={m.bizno} m={m} open={open === m.bizno} onToggle={() => setOpen(open === m.bizno ? null : m.bizno)}
                      confirming={confirmDel === m.bizno} onAskDelete={() => setConfirmDel(m.bizno)} onCancel={() => setConfirmDel(null)} onDelete={() => remove(m.bizno)} busy={busy} />
                  ))}
                  {!shown.length && (
                    <tr><td colSpan={7} className="py-10 text-center text-sm text-ink-400">{stats.total ? "조건에 맞는 가입자가 없습니다." : "아직 가입자가 없습니다."}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-400">탈퇴 요청이 오면 &lsquo;상세&rsquo;에서 삭제하세요. 가입 정보만 지우고, 이미 쓴 무료 체험 건수는 남겨 둡니다(다시 가입해도 3건이 새로 생기지 않게).</p>
          </>
        )}
      </main>
    </div>
  );
}

function MemberRow({ m, open, onToggle, confirming, onAskDelete, onCancel, onDelete, busy }: {
  m: Member; open: boolean; onToggle: () => void; confirming: boolean; onAskDelete: () => void; onCancel: () => void; onDelete: () => void; busy: boolean;
}) {
  const n = m.trial.length;
  return (
    <>
      <tr>
        <td className="leading-snug">
          <span className="font-semibold">{m.company}</span>
          <span className="block text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)}</span>
        </td>
        <td>{m.name}</td>
        <td className="leading-snug">
          <span className="block tabular-nums">{m.phone}</span>
          <a href={`mailto:${m.email}`} className="block text-xs text-mint-600 hover:underline">{m.email}</a>
        </td>
        <td className="whitespace-nowrap text-sm tabular-nums">{day(m.joinedAt)}</td>
        <td className="text-center">
          <TrialBadge n={n} />
        </td>
        <td className="text-center text-sm">{m.agreeMail ? "동의" : <span className="text-ink-300">-</span>}</td>
        <td className="text-right"><button type="button" onClick={onToggle} className="btn-ghost btn-sm">{open ? "닫기" : "상세"}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="bg-paper">
            <MemberDetail m={m} confirming={confirming} onAskDelete={onAskDelete} onCancel={onCancel} onDelete={onDelete} busy={busy} />
          </td>
        </tr>
      )}
    </>
  );
}

function TrialBadge({ n }: { n: number }) {
  return <span className={`inline-block shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${n >= TRIAL_LIMIT ? "bg-coral-100 text-coral" : n ? "bg-mint-50 text-mint-700" : "bg-ink-50 text-ink-400"}`}>{n}/{TRIAL_LIMIT}</span>;
}

function MemberDetail({ m, confirming, onAskDelete, onCancel, onDelete, busy }: {
  m: Member; confirming: boolean; onAskDelete: () => void; onCancel: () => void; onDelete: () => void; busy: boolean;
}) {
  const n = m.trial.length;
  return (
    <>
            <div className="grid gap-4 py-2 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-ink-500">무료 체험으로 분석한 공고</p>
          {n ? (
            <ul className="mt-1 space-y-1">
              {m.trial.map((t) => (
                <li key={t.k}>
                  <a href={`${base}${bidLink(t.k)}`} target="_blank" rel="noreferrer" className="text-mint-600 hover:underline">{t.k.startsWith("apt:") ? "아파트" : "나라장터"} {t.k.replace(/^(nara|apt):/, "")}</a>
                  <span className="ml-2 text-xs text-ink-400">{day(t.t)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-ink-400">아직 없음</p>}
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-xs text-ink-500">업종·면허</dt><dd>{m.licenses?.length ? m.licenses.join(", ") : "-"}</dd>
          <dt className="text-xs text-ink-500">지역</dt><dd>{m.regions?.length ? m.regions.join(", ") : "-"}</dd>
          <dt className="text-xs text-ink-500">규모</dt><dd>{SIZE_LABEL[m.size ?? ""] ?? "-"}</dd>
          <dt className="text-xs text-ink-500">관심 키워드</dt><dd>{m.keywords || "-"}</dd>
          <dt className="text-xs text-ink-500">관심 결제</dt><dd>{m.plan || "-"}</dd>
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
        {confirming ? (
          <>
            <span className="text-sm text-coral">{m.company} 가입 정보를 지울까요? 되돌릴 수 없습니다.</span>
            <button type="button" onClick={onDelete} disabled={busy} className="btn-sm rounded-full bg-coral px-4 py-1.5 text-sm font-bold text-white">삭제</button>
            <button type="button" onClick={onCancel} className="btn-ghost btn-sm">취소</button>
          </>
        ) : (
          <button type="button" onClick={onAskDelete} className="btn-ghost btn-sm text-coral">탈퇴 처리(가입 정보 삭제)</button>
        )}
      </div>
    </>
  );
}
