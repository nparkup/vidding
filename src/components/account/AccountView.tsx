"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountCall, logout, refreshAccount, saveSession, useAccount, useAccountRefresh, type AccountMember, type Usage } from "@/lib/account";
import { planName } from "@/lib/plans";
import { useSiteConfig } from "@/lib/siteConfig";

const bizFmt = (n: string) => `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
const day = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
const when = (t: number) => new Date(t).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" });
const bidHref = (k: string) => (k.startsWith("apt:") ? `/premium/apt?apt=${encodeURIComponent(k.slice(4))}` : `/premium?bid=${encodeURIComponent(k.slice(5))}#predict`);

/** 내 정보: 이용권·이번 달 사용 건수, 가입 정보 고치기, 비밀번호 바꾸기, 로그아웃 */
export function AccountView({ email }: { email: string }) {
  const acc = useAccount();
  useAccountRefresh();
  if (acc.status === "loading") return <div className="h-64 animate-pulse rounded-2xl bg-ink-100/60" />;
  if (acc.status === "out") {
    return (
      <div className="card p-6 text-center sm:p-10">
        <p className="text-xl font-extrabold">로그인이 필요합니다</p>
        <p className="mt-2 text-sm text-ink-500">로그인하면 이용권과 이번 달 공고 예측 사용 건수를 볼 수 있습니다.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/login?next=/account" className="btn-primary">로그인</Link>
          <Link href="/apply" className="btn-ghost">회원가입</Link>
        </div>
      </div>
    );
  }
  const m = acc.member;
  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xl font-extrabold [overflow-wrap:anywhere]">{acc.company}</p>
          <p className="mt-0.5 text-sm tabular-nums text-ink-400">{bizFmt(acc.bizno)}{m?.login?.email ? ` · ${m.login.email}` : ""}</p>
        </div>
        <button type="button" onClick={logout} className="btn-ghost btn-sm self-start sm:self-auto">로그아웃</button>
      </div>
      {m?.login?.temp && (
        <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">임시 비밀번호로 로그인하셨습니다.<br />아래에서 비밀번호를 새로 정해 주세요.</p>
      )}
      {m?.status === "suspended" && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">이용이 정지된 계정입니다.<br />새 공고를 분석할 수 없습니다. {email}로 문의해 주세요.</p>}
      <UsageCard usage={acc.usage} />
      {m ? <ProfileForm m={m} /> : <div className="h-40 animate-pulse rounded-2xl bg-ink-100/60" />}
      <PasswordForm />
      <p className="text-xs text-ink-400">탈퇴를 원하시면 {email}로 요청해 주세요.<br />가입 정보와 서류함을 바로 지웁니다.</p>
    </div>
  );
}

function UsageCard({ usage }: { usage?: Usage }) {
  const trialLimit = useSiteConfig().trialLimit;
  const [all, setAll] = useState(false);
  if (!usage) return <div className="h-40 animate-pulse rounded-2xl bg-ink-100/60" />;
  const used = [...usage.used].sort((a, b) => b.t - a.t);
  const quota = usage.mode === "paid" ? usage.quota : trialLimit;
  const pct = quota ? Math.min(100, Math.round((used.length / quota) * 100)) : 0;
  const shown = all ? used : used.slice(0, 8);
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink-500">이용권</p>
          <p className="mt-1 text-lg font-extrabold">{usage.mode === "paid" ? `${planName(usage.plan)} 이용권` : "무료 체험"}</p>
          {usage.mode === "paid" && (
            <p className="mt-0.5 text-xs text-ink-500">
              이번 달 {day(usage.period.from)} ~ {day(dayBefore(usage.period.to))} · {day(usage.period.to)}에 새로 시작{usage.end ? ` · 이용 종료일 ${day(usage.end)}` : ""}
            </p>
          )}
        </div>
        <Link href="/pricing" className="btn-ghost btn-sm">{usage.mode === "paid" ? "이용권 보기" : "요금제 보기"}</Link>
      </div>
      <div className="mt-4">
        <p className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">{usage.mode === "paid" ? "이번 달 공고 예측" : "무료 체험 공고"}</span>
          <span className="tabular-nums"><b className="text-lg">{used.length.toLocaleString()}</b>{quota !== null ? ` / ${quota.toLocaleString()}건` : "건 (무제한)"}</span>
        </p>
        {quota !== null && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={used.length} aria-valuemin={0} aria-valuemax={quota}>
            <div className={`h-full rounded-full ${pct >= 100 ? "bg-coral" : "bg-mint"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="mt-2 text-xs text-ink-400">공고 예측 1건은 공고 하나의 평가점수 예측·배점표 판독·낙찰 결과로 본 예측입니다.<br />나라장터·공동주택 입찰공고를 합쳐 세고, 이미 분석한 공고는 다시 열어도 차감되지 않습니다.</p>
      </div>
      {used.length > 0 ? (
        <div className="mt-4 border-t border-ink-100 pt-4">
          <p className="text-xs font-semibold text-ink-500">분석한 공고</p>
          <ul className="mt-2 divide-y divide-ink-100 text-sm">
            {shown.map((e) => (
              <li key={e.k} className="flex items-center justify-between gap-3 py-2">
                <Link href={bidHref(e.k)} className="min-w-0 font-semibold hover:text-mint-600 [overflow-wrap:anywhere]">
                  <span className="mr-1.5 text-xs font-medium text-ink-400">{e.k.startsWith("apt:") ? "공동주택" : "나라장터"}</span>
                  {e.title || e.k.replace(/^(nara|apt|nuri):/, "공고 ")}
                </Link>
                <span className="shrink-0 text-xs text-ink-400">{when(e.t)}</span>
              </li>
            ))}
          </ul>
          {used.length > shown.length && <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm font-semibold text-mint-600 hover:underline">{used.length - shown.length}건 더 보기</button>}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          <Link href="/premium#predict" className="btn-mint btn-sm">나라장터 공고 분석하기</Link>
          <Link href="/premium/apt" className="btn-ghost btn-sm">공동주택 입찰공고 분석하기</Link>
        </div>
      )}
    </section>
  );
}

function ProfileForm({ m }: { m: AccountMember }) {
  const [f, setF] = useState({ name: m.name, phone: m.phone, email: m.email, keywords: m.keywords ?? "", agreeMail: !!m.agreeMail });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF({ name: m.name, phone: m.phone, email: m.email, keywords: m.keywords ?? "", agreeMail: !!m.agreeMail }); }, [m]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await accountCall("me", f);
      await refreshAccount();
      setMsg({ ok: true, t: "저장했습니다." });
    } catch (err) { setMsg({ ok: false, t: (err as Error).message }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="card p-5 sm:p-6">
      <p className="font-bold">가입 정보</p>
      <p className="mt-1 text-xs text-ink-400">회사명과 사업자등록번호는 바꿀 수 없습니다.<br />이메일을 바꾸면 로그인 이메일도 같이 바뀝니다.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="a-name">담당자 이름</label><input id="a-name" className="input" required maxLength={40} value={f.name} onChange={set("name")} /></div>
        <div><label className="label" htmlFor="a-phone">연락처</label><input id="a-phone" className="input" required maxLength={30} value={f.phone} onChange={set("phone")} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="a-email">이메일</label><input id="a-email" type="email" className="input" required maxLength={120} value={f.email} onChange={set("email")} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="a-kw">관심 키워드 <span className="font-normal text-ink-300">(쉼표로 구분)</span></label><input id="a-kw" className="input" maxLength={200} value={f.keywords} onChange={set("keywords")} /></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" className="mt-1" checked={f.agreeMail} onChange={set("agreeMail")} />맞춤 공고와 서비스 소식을 이메일로 받겠습니다.</label>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-mint-700" : "text-coral"}`}>{msg.t}</p>}
      <button className="btn-primary btn-sm mt-4" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
    </form>
  );
}

function PasswordForm() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("next") !== f.get("next2")) { setMsg({ ok: false, t: "새 비밀번호 확인이 맞지 않습니다." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountCall<{ token: string; exp: number; member: AccountMember }>("password", { current: f.get("current"), next: f.get("next") });
      saveSession(r);
      form.reset();
      setMsg({ ok: true, t: "비밀번호를 바꿨습니다. 다른 기기에서는 다시 로그인해야 합니다." });
    } catch (err) { setMsg({ ok: false, t: (err as Error).message }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="card p-5 sm:p-6">
      <p className="font-bold">비밀번호 바꾸기</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div><label className="label" htmlFor="p-cur">지금 비밀번호</label><input id="p-cur" name="current" type="password" required autoComplete="current-password" maxLength={64} className="input" /></div>
        <div><label className="label" htmlFor="p-new">새 비밀번호</label><input id="p-new" name="next" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
        <div><label className="label" htmlFor="p-new2">새 비밀번호 확인</label><input id="p-new2" name="next2" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
      </div>
      <p className="mt-2 text-xs text-ink-400">영문과 숫자를 함께 넣어 8자 이상.</p>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-mint-700" : "text-coral"}`}>{msg.t}</p>}
      <button className="btn-primary btn-sm mt-4" disabled={busy}>{busy ? "바꾸는 중…" : "비밀번호 바꾸기"}</button>
    </form>
  );
}

