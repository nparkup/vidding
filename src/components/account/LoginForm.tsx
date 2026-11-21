"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCOUNT_API, accountCall, saveSession, useAccount, type AccountMember } from "@/lib/account";
import { normalizeBizno, validBizno } from "@/lib/corpLookup";

type Session = { token: string; exp: number; member: AccountMember };

/** 로그인 화면. 비밀번호 없이 가입했던 회원은 같은 화면에서 비밀번호를 처음 정한다 */
export function LoginForm({ email }: { email: string }) {
  const router = useRouter();
  const acc = useAccount();
  const [mode, setMode] = useState<"login" | "claim">("login");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/account");
  useEffect(() => {
    // 로그인 뒤 돌아갈 화면 (사이트 안 주소만)
    const n = new URLSearchParams(window.location.search).get("next") ?? "";
    if (/^\/[\w\-/]*$/.test(n)) setNext(n);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    setMsg("");
    let body: Record<string, string>;
    if (mode === "login") {
      body = { id: v("id"), password: String(f.get("password") ?? "") };
    } else {
      const bizno = normalizeBizno(v("bizno"));
      if (!validBizno(bizno)) { setMsg("올바른 사업자등록번호가 아닙니다. 숫자 10자리를 다시 확인해 주세요."); return; }
      if (f.get("password") !== f.get("password2")) { setMsg("비밀번호 확인이 맞지 않습니다."); return; }
      body = { bizno, email: v("email"), phone: v("phone"), password: String(f.get("password") ?? "") };
    }
    setBusy(true);
    try {
      const r = await accountCall<Session>(mode, body);
      saveSession(r);
      router.push(next);
    } catch (err) {
      const e2 = err as Error & { code?: string };
      setMsg(e2.message);
      if (e2.code === "no-password") setMode("claim");
    } finally {
      setBusy(false);
    }
  }

  if (acc.status === "in") {
    return (
      <div className="card p-6 sm:p-8">
        <p className="text-xl font-extrabold">{acc.company}(으)로 로그인되어 있습니다</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/account" className="btn-primary">내 정보</Link>
          <Link href="/premium#predict" className="btn-ghost">공고 분석하기</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6 sm:p-8">
      <div>
        <h2 className="text-xl font-extrabold">{mode === "login" ? "로그인" : "비밀번호 처음 정하기"}</h2>
        <p className="mt-1 text-sm text-ink-500">
          {mode === "login" ? "가입하신 이메일 또는 사업자등록번호로 로그인합니다." : "비밀번호 없이 가입하셨던 회원은 가입 때 적으신 사업자등록번호·이메일·연락처를 확인하고 비밀번호를 정합니다."}
        </p>
      </div>
      {!ACCOUNT_API && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">로그인 서버에 연결할 수 없는 환경입니다.</p>}
      {msg && <p role="alert" className="rounded-xl bg-coral-100 p-3 text-sm text-coral">{msg}</p>}

      {mode === "login" ? (
        <div className="space-y-4">
          <div><label className="label" htmlFor="id">이메일 또는 사업자등록번호</label><input id="id" name="id" required autoComplete="username" maxLength={120} className="input" placeholder="you@company.co.kr" /></div>
          <div><label className="label" htmlFor="password">비밀번호</label><input id="password" name="password" type="password" required autoComplete="current-password" maxLength={64} className="input" /></div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="bizno">사업자등록번호</label><input id="bizno" name="bizno" required inputMode="numeric" maxLength={14} className="input" placeholder="000-00-00000" /></div>
          <div><label className="label" htmlFor="phone">가입 때 적은 연락처</label><input id="phone" name="phone" required maxLength={30} className="input" placeholder="010-0000-0000" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="email">가입 때 적은 이메일 (로그인 이메일이 됩니다)</label><input id="email" name="email" type="email" required autoComplete="username" maxLength={120} className="input" /></div>
          <div><label className="label" htmlFor="password">새 비밀번호</label><input id="password" name="password" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
          <div><label className="label" htmlFor="password2">새 비밀번호 확인</label><input id="password2" name="password2" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
          <p className="text-xs text-ink-400 sm:col-span-2">영문과 숫자를 함께 넣어 8자 이상으로 정해 주세요.</p>
        </div>
      )}

      <button className="btn-mint w-full text-base" disabled={busy || !ACCOUNT_API}>{busy ? "확인하는 중…" : mode === "login" ? "로그인" : "비밀번호 정하고 로그인"}</button>

      <div className="space-y-2 border-t border-ink-100 pt-4 text-sm text-ink-500">
        {mode === "login" ? (
          <>
            <p>아직 회원이 아니신가요? <Link href="/apply" className="font-semibold text-mint-600 hover:underline">회원가입하고 무료 체험</Link></p>
            <p>비밀번호 없이 가입하셨나요? <button type="button" onClick={() => { setMode("claim"); setMsg(""); }} className="font-semibold text-mint-600 hover:underline">비밀번호 처음 정하기</button></p>
            <p className="text-xs text-ink-400">비밀번호를 잊으셨으면 {email}로 회사명과 사업자등록번호를 보내 주세요. 임시 비밀번호를 보내 드립니다.</p>
          </>
        ) : (
          <p><button type="button" onClick={() => { setMode("login"); setMsg(""); }} className="font-semibold text-mint-600 hover:underline">로그인으로 돌아가기</button></p>
        )}
      </div>
    </form>
  );
}
