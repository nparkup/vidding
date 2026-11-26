"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { AuthError, makeCall, type Member, type Withdrawn } from "./adminApi";
import { MembersTab } from "./MembersTab";
import { BillingTab } from "./BillingTab";
import { UsageTab } from "./UsageTab";
import { SettingsTab } from "./SettingsTab";
import { ApiTab } from "./ApiTab";
import { SystemTab } from "./SystemTab";
import { ScrollRow } from "@/components/ScrollRow";
import { TotpCard } from "./TotpCard";

/** 이 시간 동안 화면 조작이 없으면 자동으로 로그아웃한다 */
const IDLE_MS = 30 * 60_000;

/** 로그인 토큰(12시간)은 이 탭에만 둔다. 비밀번호는 저장하지 않는다 */
const TOKEN_KEY = "bm-admin-token";

const TABS = [
  { id: "members", label: "회원정보" },
  { id: "billing", label: "결제정보" },
  { id: "usage", label: "회원 사용량" },
  { id: "settings", label: "페이지 설정" },
  { id: "api", label: "API 사용량" },
  { id: "system", label: "시스템 정보" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * 운영 관리자 화면. 아이디·비밀번호로 로그인하면 중계 서버가 12시간짜리 토큰을 주고, 모든 자료는 그 토큰으로 받아 온다.
 * 정적 사이트 묶음에는 회원 정보가 들어가지 않는다 (로그인한 뒤 서버에서만 받는다).
 */
export function AdminConsole({ api }: { api: string }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState(false);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [withdrawn, setWithdrawn] = useState<Withdrawn[]>([]);
  const [limit, setLimit] = useState(3);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("members");

  const call = useMemo(() => makeCall(api, token), [api, token]);

  const logout = useCallback((why = "") => {
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ }
    setAuthed(false);
    setMembers(null);
    setToken("");
    setMsg(why);
  }, []);

  /** 하위 화면의 요청이 로그인 만료로 실패하면 로그인 화면으로 돌아간다 */
  const guard = useCallback(async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof AuthError) logout(e.message);
      else throw e;
      return undefined;
    }
  }, [logout]);

  const load = useCallback(async (t: string) => {
    setBusy(true);
    setMsg("");
    try {
      const j = await makeCall(api, t)<{ members?: Member[]; withdrawn?: Withdrawn[]; limit?: number }>("members");
      setAuthed(true);
      setLimit(j.limit ?? 3);
      setMembers((j.members ?? []).map((m) => ({ ...m, trial: Array.isArray(m.trial) ? m.trial : [] })));
      setWithdrawn(Array.isArray(j.withdrawn) ? j.withdrawn : []);
    } catch (e) {
      if (e instanceof AuthError) logout(e.message);
      else setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, logout]);

  async function login() {
    if (!api) { setMsg("중계 서버 주소가 없어 로그인할 수 없습니다."); return; }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`${api}?admin=login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password: pw, code }) });
      const j = (await r.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!r.ok || !j.token) { setMsg(j.error ?? `로그인하지 못했습니다 (${r.status})`); return; }
      setPw("");
      setCode("");
      setToken(j.token);
      // 사이트의 다른 화면(새 탭 포함)에서도 관리자로 알아보도록 localStorage 에도 둔다 (lib/adminSession.ts: 공고 예측 한도 없음)
      try { sessionStorage.setItem(TOKEN_KEY, j.token); localStorage.setItem(TOKEN_KEY, j.token); } catch { /* 무시 */ }
      await load(j.token);
    } catch {
      setMsg("중계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? ""; } catch { /* 무시 */ }
    // 토큰 앞부분이 만료 시각이라 지난 토큰은 서버에 보내지 않는다
    if (saved && Number(saved.split(".")[0]) > Date.now()) { setToken(saved); load(saved); }
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === h)) setTab(h as TabId);
  }, [load]);

  // 관리자 화면을 30분 동안 건드리지 않으면 로그아웃 (다른 사람이 자리를 비운 화면을 쓰지 못하게)
  useEffect(() => {
    if (!authed) return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const evs = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = window.setInterval(() => { if (Date.now() - last > IDLE_MS) logout("30분 동안 사용하지 않아 로그아웃했습니다."); }, 30_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, touch)); window.clearInterval(t); };
  }, [authed, logout]);

  const newToken = (t: string) => {
    setToken(t);
    try { sessionStorage.setItem(TOKEN_KEY, t); localStorage.setItem(TOKEN_KEY, t); } catch { /* 무시 */ }
  };

  const pick = (t: TabId) => {
    setTab(t);
    try { history.replaceState(null, "", `#${t}`); } catch { /* 무시 */ }
  };

  const updateMember = (m: Member) => setMembers((l) => l?.map((x) => (x.bizno === m.bizno ? { ...x, ...m } : x)) ?? null);
  const addMember = (m: Member) => setMembers((l) => [m, ...(l ?? []).filter((x) => x.bizno !== m.bizno)]);
  const removeMember = (bizno: string) => setMembers((l) => l?.filter((x) => x.bizno !== bizno) ?? null);
  const addWithdrawn = (w: Withdrawn) => setWithdrawn((l) => [w, ...l.filter((x) => x.bizno !== w.bizno)]);
  const shared = { call, guard, members: members ?? [], withdrawn, addWithdrawn, limit, busy, reload: () => load(token), updateMember, addMember, removeMember };

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-ink-100 bg-white">
        <div className="container-x flex items-center justify-between gap-3 py-4">
          <Logo />
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">관리자</span>
            {authed && <button type="button" onClick={() => logout()} className="btn-ghost btn-sm">로그아웃</button>}
          </div>
        </div>
      </header>

      {!authed ? (
        <main className="container-x py-8">
          <form className="card mx-auto max-w-sm p-6" onSubmit={(e) => { e.preventDefault(); if (id && pw) login(); }}>
            <h1 className="text-xl font-extrabold">관리자 로그인</h1>
            <p className="mt-1 text-sm text-ink-500">관리자 페이지는 로그인한 뒤에 이용할 수 있습니다.</p>
            <label className="label mt-5" htmlFor="admin-id">아이디</label>
            <input id="admin-id" autoComplete="username" className="input" value={id} onChange={(e) => setId(e.target.value)} />
            <label className="label mt-3" htmlFor="admin-pw">비밀번호</label>
            <input id="admin-pw" type="password" autoComplete="current-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
            <label className="label mt-3" htmlFor="admin-code">인증 코드 <span className="font-normal text-ink-400">(2단계 인증을 켠 경우)</span></label>
            <input id="admin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리" className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            {msg && <p className="mt-3 rounded-xl bg-coral-100 p-3 text-sm text-coral">{msg}</p>}
            <button className="btn-primary mt-5 w-full" disabled={busy || !id || !pw}>{busy ? "확인 중…" : "로그인"}</button>
            <p className="mt-3 text-xs text-ink-400">로그인은 최대 12시간, 30분 동안 사용하지 않으면 자동으로 끝납니다. 같은 곳에서 5번 틀리면 15분 동안 로그인할 수 없습니다.</p>
          </form>
        </main>
      ) : (
        <div className="container-x py-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
          <ScrollRow as="nav" active={tab} aria-label="관리 메뉴" className="-mx-4 mb-5 px-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
            <ul className="flex gap-2 lg:sticky lg:top-6 lg:flex-col lg:gap-1">
              {TABS.map((t) => (
                <li key={t.id} className="shrink-0">
                  <button type="button" onClick={() => pick(t.id)} aria-current={tab === t.id ? "page" : undefined}
                    className={`w-full whitespace-nowrap rounded-xl px-4 py-2 text-left text-sm font-semibold transition ${tab === t.id ? "bg-ink text-white" : "bg-white text-ink-700 hover:bg-ink-50 lg:bg-transparent"}`}>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollRow>
          <main className="min-w-0">
            {msg && <p className="mb-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">{msg}</p>}
            {tab === "members" && <MembersTab {...shared} />}
            {tab === "billing" && <BillingTab {...shared} />}
            {tab === "usage" && <UsageTab {...shared} />}
            {tab === "settings" && <TotpCard call={call} onToken={newToken} />}
            {tab === "settings" && <SettingsTab {...shared} />}
            {tab === "api" && <ApiTab {...shared} />}
            {tab === "system" && <SystemTab {...shared} />}
          </main>
        </div>
      )}
    </div>
  );
}

export interface TabProps {
  call: ReturnType<typeof makeCall>;
  guard: <T>(p: Promise<T>) => Promise<T | undefined>;
  members: Member[];
  /** 탈퇴한 회원 기록 (최근 순) */
  withdrawn: Withdrawn[];
  addWithdrawn: (w: Withdrawn) => void;
  limit: number;
  busy: boolean;
  reload: () => void;
  updateMember: (m: Member) => void;
  addMember: (m: Member) => void;
  removeMember: (bizno: string) => void;
}
