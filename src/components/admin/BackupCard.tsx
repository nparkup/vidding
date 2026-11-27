"use client";

import { useCallback, useEffect, useState } from "react";
import type { makeCall } from "./adminApi";

interface SealState { on: boolean; kid: string | null; sealed: number; plain: number; otherKey: number; at: string; done: boolean }
interface BackupList { seal?: { on: boolean; state: SealState | null }; ready: boolean; encrypted: boolean; items: { key: string; size: number }[]; last: { key: string; at: string; bytes: number; skipped: number; counts: Record<string, number> } | null }
interface Verify { ok: boolean; reason?: string; file?: string; at?: string; parsed?: number; compare?: Record<string, { backup: number; live: number; same: number }> }

const PART: Record<string, string> = { "members/": "회원 정보", "billing/": "결제 기록", "retain/": "보존 중인 결제 기록" };

/** 회원·결제 자료 백업 (worker/corp-lookup/backup.ts). 매일 0시 10분 자동, 여기서 지금 백업·복구 시험 */
export function BackupCard({ call }: { call: ReturnType<typeof makeCall> }) {
  const [list, setList] = useState<BackupList | null>(null);
  const [verify, setVerify] = useState<Verify | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { call<BackupList>("backup").then(setList).catch((e) => setMsg((e as Error).message)); }, [call]);
  useEffect(load, [load]);

  async function seal() {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<SealState>("backup", { body: { step: "seal" } });
      setMsg(r.done ? `회원 자료 ${r.sealed}개를 모두 암호화했습니다.` : `암호화 ${r.sealed}개, 남은 파일 ${r.plain + r.otherKey}개. 한 번 더 눌러 주세요.`);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function run(step: "run" | "verify") {
    setBusy(true);
    setMsg("");
    try {
      const r = await call<Verify & { key?: string; error?: string }>("backup", { body: { step } });
      if (step === "verify") setVerify(r);
      else { setMsg(`백업했습니다: ${r.key}`); load(); }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024)).toLocaleString()}KB`;
  return (
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">회원·결제 자료 백업·암호화</h2>
        {list && <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${list.ready ? "bg-mint-50 text-mint-700" : "bg-coral-100 text-coral"}`}>{list.ready ? (list.encrypted ? "백업 중 · 암호화" : "백업 중 · 암호화 키 없음") : "백업 버킷 없음"}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-500">매일 0시 10분에 회원 정보·결제 기록을 별도 비공개 저장소에 백업합니다. 매일 백업 14개, 매달 1일 백업 3개를 남깁니다.</p>
      {list?.last && (
        <p className="mt-3 text-sm">마지막 백업 <b>{new Date(list.last.at).toLocaleString("ko-KR")}</b> · {kb(list.last.bytes)} · 회원 {list.last.counts["members/"] ?? 0}명 · 결제 기록 {list.last.counts["billing/"] ?? 0}건{list.last.skipped ? ` · 빠진 파일 ${list.last.skipped}개` : ""}</p>
      )}
      {list?.ready && !list.last && <p className="mt-3 text-sm text-ink-500">아직 백업이 없습니다.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !list?.ready} onClick={() => run("run")} className="btn-primary btn-sm">지금 백업</button>
        <button type="button" disabled={busy || !list?.last} onClick={() => run("verify")} className="btn-ghost btn-sm">복구 시험</button>
      </div>
      {verify && (
        <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
          {verify.ok ? (
            <>
              <p className="font-semibold">{verify.file}을 풀어 지금 자료와 비교했습니다 (실제로 덮어쓰지는 않습니다).</p>
              <ul className="mt-1 space-y-0.5 text-ink-700">
                {Object.entries(verify.compare ?? {}).map(([k, v]) => <li key={k}>{PART[k] ?? k}: 백업 {v.backup} · 지금 {v.live} · 내용 같음 {v.same}</li>)}
              </ul>
            </>
          ) : <p className="text-coral">{verify.reason}</p>}
        </div>
      )}
      {list?.seal && (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">회원 개인정보 암호화</h3>
            <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${list.seal.on && list.seal.state?.done ? "bg-mint-50 text-mint-700" : "bg-coral-100 text-coral"}`}>
              {!list.seal.on ? "꺼짐 · 암호화 키 없음" : list.seal.state?.done ? "켜짐 · 모두 암호화" : "켜짐 · 암호화 진행 중"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">회원 가입 정보(회사명·담당자·연락처·이메일), 결제·탈퇴 기록, 서류함, 로그인 서명 키와 2단계 인증 비밀값을 AES-256-GCM으로 암호화해 저장합니다.</p>
          {list.seal.state && (
            <p className="mt-2 text-sm">마지막 확인 <b>{new Date(list.seal.state.at).toLocaleString("ko-KR")}</b> · 암호화 {list.seal.state.sealed}개{list.seal.state.plain ? ` · 평문 ${list.seal.state.plain}개` : ""}{list.seal.state.otherKey ? ` · 예전 키 ${list.seal.state.otherKey}개` : ""} · 키 ID {list.seal.state.kid ?? "-"}</p>
          )}
          {list.seal.on ? (
            <button type="button" disabled={busy} onClick={seal} className="btn-ghost btn-sm mt-3">지금 암호화</button>
          ) : (
            <p className="mt-2 text-xs text-ink-400">저장소 Secrets에 MEMBER_KEY(16자 이상 임의 문자열)를 넣고 중계 서버를 다시 배포하면 켜집니다. 키를 잃어버리면 회원 자료를 풀 수 없으니 따로 안전하게 보관해 주세요.</p>
          )}
        </div>
      )}
      {msg && <p className="mt-3 rounded-xl bg-paper p-3 text-sm text-ink-700">{msg}</p>}
      {list && !list.encrypted && list.ready && <p className="mt-3 text-xs text-ink-400">저장소 Secrets에 BACKUP_KEY(긴 임의 문자열)를 넣으면 다음 배포부터 백업을 암호화합니다. 그 키는 따로 안전하게 보관해 주세요.</p>}
    </section>
  );
}
