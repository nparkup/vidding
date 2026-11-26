"use client";

import { useEffect, useState } from "react";
import type { makeCall } from "./adminApi";

/**
 * 관리자 2단계 인증 (worker/corp-lookup/security.ts). 켜면 로그인할 때 인증 앱(Google Authenticator, 네이버 등)의 6자리를 함께 넣는다.
 * 켜거나 끄면 다른 기기의 관리자 로그인은 모두 풀리고, 이 화면은 새 토큰으로 이어 간다.
 */
export function TotpCard({ call, onToken }: { call: ReturnType<typeof makeCall>; onToken: (token: string) => void }) {
  const [state, setState] = useState<{ on: boolean; pending: boolean } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    call<{ on: boolean; pending: boolean }>("totp").then(setState).catch((e) => setMsg((e as Error).message));
  }, [call]);

  async function run(step: "setup" | "enable" | "disable") {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<{ secret?: string; uri?: string; on?: boolean; token?: string }>("totp", { body: { step, code } });
      if (step === "setup" && r.secret && r.uri) { setSetup({ secret: r.secret, uri: r.uri }); setState({ on: false, pending: true }); }
      if (r.token) onToken(r.token);
      if (step === "enable") { setSetup(null); setState({ on: true, pending: false }); setMsg("2단계 인증을 켰습니다. 다음 로그인부터 인증 앱의 6자리를 함께 넣어 주세요."); }
      if (step === "disable") { setState({ on: false, pending: false }); setMsg("2단계 인증을 껐습니다."); }
      setCode("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">관리자 2단계 인증</h2>
        {state && <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${state.on ? "bg-mint-50 text-mint-700" : "bg-coral-100 text-coral"}`}>{state.on ? "켜짐" : "꺼짐"}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-500">켜면 아이디·비밀번호와 함께 휴대폰 인증 앱의 6자리 숫자가 있어야 로그인됩니다.</p>

      {state && !state.on && !setup && (
        <button type="button" disabled={busy} onClick={() => run("setup")} className="btn-primary btn-sm mt-4">2단계 인증 설정하기</button>
      )}

      {setup && (
        <div className="mt-4 space-y-3 text-sm">
          <p>1. 휴대폰 인증 앱(Google Authenticator, Microsoft Authenticator, 네이버 앱 등)에서 <b>설정 키 입력</b>을 고르고 아래 키를 넣어 주세요. 휴대폰에서 이 화면을 보고 있으면 링크를 눌러도 됩니다.</p>
          <p className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-base font-bold tracking-wider">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
          <a href={setup.uri} className="inline-block font-semibold text-mint-600 underline">인증 앱에 바로 추가</a>
          <p>2. 앱에 나온 6자리 숫자를 넣고 켜기를 눌러 주세요.</p>
        </div>
      )}

      {(setup || state?.on) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input w-32" aria-label="인증 코드" />
          {setup ? (
            <button type="button" disabled={busy || code.length !== 6} onClick={() => run("enable")} className="btn-primary btn-sm">켜기</button>
          ) : (
            <button type="button" disabled={busy || code.length !== 6} onClick={() => run("disable")} className="btn-ghost btn-sm">끄기</button>
          )}
        </div>
      )}

      {msg && <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink-700">{msg}</p>}
      <p className="mt-3 text-xs text-ink-400">휴대폰을 잃어버렸으면 Cloudflare 대시보드 R2 버킷 bidmate-awards 에서 config/admin-totp.json 파일을 지우면 2단계 인증이 꺼집니다.</p>
    </section>
  );
}
