"use client";

import { useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { bizFmt, downloadCsv, dt, SIZE_LABEL, type Member } from "./adminApi";
import { planName } from "@/lib/plans";
import { fullOf, LimitEditor, QuotaBadge, tierName, useMemberQuota } from "./limits";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const bidLink = (k: string) => (k.startsWith("apt:") ? `/apt-bids/view?no=${encodeURIComponent(k.slice(4))}` : k.startsWith("nuri:") ? `/nuri-bids/view?no=${encodeURIComponent(k.slice(5).replace(/-\d+$/, ""))}` : `/bids/view?id=${encodeURIComponent(k.slice(5))}`);

type Use = "all" | "none" | "some" | "full" | "custom";
type St = "all" | "active" | "suspended" | "paid" | "login" | "nologin";

export const isPaid = (m: Member) => m.billing?.status === "active";

/** 회원정보 관리: 검색·거르기, 가입 정보 고치기, 이용 정지·해제, 메모, 무료 체험 초기화, 탈퇴 처리, CSV */
export function MembersTab({ call, guard, members, limit, busy, reload, updateMember, removeMember }: TabProps) {
  const [q, setQ] = useState("");
  const [mailOnly, setMailOnly] = useState(false);
  const [use, setUse] = useState<Use>("all");
  const [st, setSt] = useState<St>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const quotaOf = useMemberQuota();
  const sorted = useMemo(() => [...members].sort((a, b) => (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "")), [members]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return sorted.filter((m) => {
      const q = quotaOf(m);
      const n = q.used;
      if (mailOnly && !m.agreeMail) return false;
      if (use === "none" && n > 0) return false;
      if (use === "some" && (n === 0 || fullOf(q))) return false;
      if (use === "full" && !fullOf(q)) return false;
      if (use === "custom" && !q.custom) return false;
      if (st === "active" && m.status === "suspended") return false;
      if (st === "suspended" && m.status !== "suspended") return false;
      if (st === "paid" && !isPaid(m)) return false;
      if (st === "login" && !m.login) return false;
      if (st === "nologin" && m.login) return false;
      const hay = `${m.company} ${m.bizno} ${bizFmt(m.bizno)} ${m.name} ${m.email} ${m.phone} ${m.memo ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [sorted, q, mailOnly, use, st, quotaOf]);

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400_000;
    return {
      total: members.length,
      recent: members.filter((m) => m.joinedAt && new Date(m.joinedAt).getTime() >= week).length,
      paid: members.filter(isPaid).length,
      login: members.filter((m) => m.login).length,
      used: members.filter((m) => m.trial.length > 0).length,
      suspended: members.filter((m) => m.status === "suspended").length,
      mail: members.filter((m) => m.agreeMail).length,
    };
  }, [members]);

  function csv() {
    downloadCsv("회원", ["회사명", "사업자등록번호", "담당자", "연락처", "이메일", "가입일", "상태", "결제", "요금제", "적용 한도", "개별 한도", "이번 기간 사용", "체험 사용", "분석한 공고", "메일 수신 동의", "업종·면허", "지역", "규모", "관심 키워드", "메모"],
      shown.map((m) => [
        m.company, bizFmt(m.bizno), m.name, m.phone, m.email, dt(m.joinedAt), m.status === "suspended" ? "이용 정지" : "정상",
        isPaid(m) ? planName(m.billing!.plan) : "", ...(() => { const q = quotaOf(m); return [tierName(q), q.quota === null ? "무제한" : q.quota, q.custom ? "예" : "", q.used]; })(), `${m.trial.length}/${limit}`, m.trial.map((t) => t.k).join(" "), m.agreeMail ? "동의" : "",
        (m.licenses ?? []).join(" "), (m.regions ?? []).join(" "), SIZE_LABEL[m.size ?? ""] ?? "", m.keywords ?? "", m.memo ?? "",
      ]));
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">회원정보</h1>
          <p className="mt-1 text-sm text-ink-500">회원가입한 업체입니다. 최근 가입 순. 상세에서 정보를 고치거나 이용을 정지할 수 있습니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className="btn-ghost btn-sm" disabled={busy}>{busy ? "불러오는 중…" : "새로 불러오기"}</button>
          <button type="button" onClick={csv} className="btn-primary btn-sm" disabled={!shown.length}>CSV 내려받기</button>
        </div>
      </div>

      <Stats items={[["전체 회원", stats.total], ["최근 7일 가입", stats.recent], ["결제 중", stats.paid], ["로그인 계정", stats.login], ["체험 사용", stats.used], ["이용 정지", stats.suspended]]} />

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input className="input sm:max-w-xs" placeholder="회사명·사업자번호·담당자·연락처·메모" value={q} onChange={(e) => setQ(e.target.value)} aria-label="회원 검색" />
        <select className="input sm:w-auto" value={st} onChange={(e) => setSt(e.target.value as St)} aria-label="상태">
          <option value="all">상태 전체</option>
          <option value="active">정상</option>
          <option value="paid">결제 중</option>
          <option value="login">로그인 계정 있음</option>
          <option value="nologin">비밀번호 없는 예전 가입</option>
          <option value="suspended">이용 정지</option>
        </select>
        <select className="input sm:w-auto" value={use} onChange={(e) => setUse(e.target.value as Use)} aria-label="이용 한도 사용">
          <option value="all">한도 사용 전체</option>
          <option value="none">아직 안 씀</option>
          <option value="some">사용 중 (한도 남음)</option>
          <option value="full">한도 모두 사용</option>
          <option value="custom">개별 한도 회원</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mailOnly} onChange={(e) => setMailOnly(e.target.checked)} />메일 수신 동의만</label>
      </div>
      {note && <p className="mt-3 text-sm text-mint-700">{note}</p>}
      <p className="mt-3 text-xs text-ink-400">{shown.length.toLocaleString()}명 표시 / 전체 {stats.total.toLocaleString()}명</p>

      <ul className="mt-3 space-y-3">
        {shown.map((m) => (
          <li key={m.bizno} className="card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold [overflow-wrap:anywhere]">{m.company}</span>
                  {m.status === "suspended" && <span className="rounded-lg bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral">이용 정지</span>}
                  {isPaid(m) && <span className="rounded-lg bg-mint-50 px-2 py-0.5 text-xs font-bold text-mint-700">{planName(m.billing!.plan)}</span>}
                  {!m.login && <span className="rounded-lg bg-ink-50 px-2 py-0.5 text-xs font-semibold text-ink-400">비밀번호 없음</span>}
                </p>
                <p className="text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)} · 가입 {dt(m.joinedAt)}</p>
                <p className="mt-1.5 text-sm">{m.name} · <span className="tabular-nums">{m.phone}</span> · <a href={`mailto:${m.email}`} className="text-mint-600 [overflow-wrap:anywhere] hover:underline">{m.email}</a></p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <QuotaBadge q={quotaOf(m)} />
                <span className="text-xs text-ink-400">메일 {m.agreeMail ? "동의" : "미동의"}</span>
                <button type="button" onClick={() => setOpen(open === m.bizno ? null : m.bizno)} className="btn-ghost btn-sm">{open === m.bizno ? "닫기" : "상세"}</button>
              </div>
            </div>
            {open === m.bizno && (
              <div className="mt-4 border-t border-ink-100 pt-4">
                <MemberEditor m={m} limit={limit} call={call} guard={guard} onSaved={(x, msg) => { updateMember(x); setNote(msg); }} onDeleted={() => { removeMember(m.bizno); setOpen(null); setNote(`${m.company} 가입 정보를 삭제했습니다.`); }} />
              </div>
            )}
          </li>
        ))}
        {!shown.length && <li className="card p-6 text-center text-sm text-ink-400">{stats.total ? "조건에 맞는 회원이 없습니다." : "아직 가입한 회원이 없습니다."}</li>}
      </ul>
      <p className="mt-3 text-xs text-ink-400">탈퇴 처리는 가입 정보·로그인 계정·서류함과 결제 기록을 지우고, 이미 쓴 무료 체험 건수는 남겨 둡니다(다시 가입해도 {limit}건이 새로 생기지 않게). 이용 정지한 사업자번호는 로그인할 수 없고 무료 체험·이용권 공고가 더 늘지 않습니다. 결제 중(결제정보 '이용 중', 기간 안)인 회원은 무료 체험 대신 이용권 한 달 건수로 셉니다. 회원 상세의 이용 한도에서 회원마다 개별 한도를 정할 수 있습니다.</p>
    </>
  );
}

export function Stats({ items }: { items: [string, number | string][] }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0 bg-white px-4 py-3">
          <p className="text-xs text-ink-400">{k}</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums [overflow-wrap:anywhere] xl:text-xl">{typeof v === "number" ? v.toLocaleString() : v}</p>
        </div>
      ))}
    </div>
  );
}

export function TrialBadge({ n, limit }: { n: number; limit: number }) {
  return <span className={`inline-block shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums ${n >= limit ? "bg-coral-100 text-coral" : n ? "bg-mint-50 text-mint-700" : "bg-ink-50 text-ink-400"}`}>체험 {n}/{limit}</span>;
}

function MemberEditor({ m, limit, call, guard, onSaved, onDeleted }: {
  m: Member; limit: number; call: TabProps["call"]; guard: TabProps["guard"]; onSaved: (m: Member, msg: string) => void; onDeleted: () => void;
}) {
  const [f, setF] = useState({
    company: m.company, name: m.name, phone: m.phone, email: m.email,
    licenses: (m.licenses ?? []).join(", "), regions: (m.regions ?? []).join(", "), keywords: m.keywords ?? "", memo: m.memo ?? "",
    agreeMail: !!m.agreeMail, status: m.status === "suspended" ? "suspended" : "active",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"" | "delete" | "trial" | "temp">("");
  const [temp, setTemp] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const split = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const r = await guard(call<{ member: Member }>("member", { params: { bizno: m.bizno }, body: { ...f, licenses: split(f.licenses), regions: split(f.regions) } }));
      if (r) onSaved({ ...m, ...r.member, trial: m.trial, billing: m.billing, quota: m.quota, seen: m.seen }, `${f.company} 정보를 저장했습니다.`);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }
  async function del() {
    setSaving(true);
    try { if (await guard(call("member-delete", { params: { bizno: m.bizno }, body: {} }))) onDeleted(); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); setConfirm(""); }
  }
  async function resetTrial() {
    setSaving(true);
    try { if (await guard(call("trial-reset", { params: { bizno: m.bizno }, body: {} }))) onSaved({ ...m, trial: [], quota: m.quota && m.quota.tier === "trial" ? { ...m.quota, used: 0 } : m.quota }, `${m.company} 무료 체험 기록을 초기화했습니다.`); } catch (e) { setErr((e as Error).message); } finally { setSaving(false); setConfirm(""); }
  }

  async function issueTemp() {
    setSaving(true);
    setErr("");
    try {
      const r = await guard(call<{ temp: string }>("password-temp", { params: { bizno: m.bizno }, body: {} }));
      if (r) {
        setTemp(r.temp);
        onSaved({ ...m, login: { email: (m.login?.email ?? m.email).toLowerCase(), setAt: new Date().toISOString(), lastLogin: m.login?.lastLogin ?? null, temp: true } }, `${m.company} 임시 비밀번호를 발급했습니다.`);
      }
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); setConfirm(""); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="회사명"><input className="input" value={f.company} onChange={set("company")} /></Field>
        <Field label="담당자"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="연락처"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="이메일"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="업종·면허 (쉼표로 구분)"><input className="input" value={f.licenses} onChange={set("licenses")} /></Field>
        <Field label="지역 (쉼표로 구분)"><input className="input" value={f.regions} onChange={set("regions")} /></Field>
        <Field label="관심 키워드"><input className="input" value={f.keywords} onChange={set("keywords")} /></Field>
        <Field label="상태">
          <select className="input" value={f.status} onChange={set("status")}>
            <option value="active">정상</option>
            <option value="suspended">이용 정지</option>
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="관리 메모 (회원에게 보이지 않음)"><textarea className="input min-h-[5rem]" value={f.memo} onChange={set("memo")} /></Field></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.agreeMail} onChange={set("agreeMail")} />맞춤 공고 메일 수신 동의</label>
        {err && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral sm:col-span-2">{err}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button className="btn-primary btn-sm" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
          {m.updatedAt && <span className="self-center text-xs text-ink-400">마지막 수정 {dt(m.updatedAt)}</span>}
        </div>
      </form>
      <div className="space-y-4 text-sm">
        <LimitEditor m={m} call={call} guard={guard} onSaved={onSaved} />
        <div>
          <p className="text-xs font-semibold text-ink-500">무료 체험으로 분석한 공고 ({m.trial.length}/{limit})</p>
          {m.trial.length ? (
            <ul className="mt-1 space-y-1">
              {m.trial.map((t) => (
                <li key={t.k} className="[overflow-wrap:anywhere]">
                  <a href={`${base}${bidLink(t.k)}`} target="_blank" rel="noreferrer" className="text-mint-600 hover:underline">{t.k.startsWith("apt:") ? "공동주택" : t.k.startsWith("nuri:") ? "누리장터" : "나라장터"} {t.k.replace(/^(nara|apt|nuri):/, "")}</a>
                  <span className="ml-2 text-xs text-ink-400">{dt(t.t)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-ink-400">아직 없음</p>}
        </div>
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-xs text-ink-500">규모</dt><dd>{SIZE_LABEL[m.size ?? ""] ?? "-"}</dd>
          <dt className="text-xs text-ink-500">관심 이용권</dt><dd>{m.plan ? planName(m.plan) : "-"}</dd>
          <dt className="text-xs text-ink-500">마지막 조회</dt><dd>{m.seen ? `${dt(m.seen.last)} (${m.seen.n.toLocaleString()}회)` : "-"}</dd>
          <dt className="text-xs text-ink-500">로그인 계정</dt><dd className="[overflow-wrap:anywhere]">{m.login ? `${m.login.email}${m.login.temp ? " (임시 비밀번호)" : ""}` : "비밀번호 없음 (예전 가입)"}</dd>
          <dt className="text-xs text-ink-500">마지막 로그인</dt><dd>{m.login?.lastLogin ? dt(m.login.lastLogin) : "-"}</dd>
        </dl>
        {temp && (
          <div className="rounded-xl bg-mint-50 p-3">
            <p className="text-xs text-ink-500">임시 비밀번호 (이 화면에서만 보입니다. 회원에게 전하고 로그인 뒤 바꾸게 해 주세요)</p>
            <p className="mt-1 select-all font-mono text-lg font-bold tracking-wider">{temp}</p>
          </div>
        )}
        <div className="space-y-2 border-t border-ink-100 pt-3">
          {confirm === "trial" ? (
            <Confirm text={`무료 체험 기록을 지우면 ${limit}건을 다시 쓸 수 있습니다.`} label="초기화" onYes={resetTrial} onNo={() => setConfirm("")} busy={saving} />
          ) : confirm === "temp" ? (
            <Confirm text={`임시 비밀번호를 만들면 지금 비밀번호와 다른 기기의 로그인이 모두 풀립니다. 로그인 이메일: ${m.login?.email ?? m.email}`} label="발급" onYes={issueTemp} onNo={() => setConfirm("")} busy={saving} />
          ) : confirm === "delete" ? (
            <Confirm text={`${m.company} 가입 정보와 결제 기록을 지울까요? 되돌릴 수 없습니다.`} label="삭제" onYes={del} onNo={() => setConfirm("")} busy={saving} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setConfirm("temp")} className="btn-ghost btn-sm">임시 비밀번호 발급</button>
              <button type="button" onClick={() => setConfirm("trial")} className="btn-ghost btn-sm" disabled={!m.trial.length}>무료 체험 초기화</button>
              <button type="button" onClick={() => setConfirm("delete")} className="btn-ghost btn-sm text-coral">탈퇴 처리</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-ink-500">{label}</span>
      {children}
    </label>
  );
}

export function Confirm({ text, label, onYes, onNo, busy }: { text: string; label: string; onYes: () => void; onNo: () => void; busy: boolean }) {
  return (
    <div className="rounded-xl bg-coral-100/60 p-3">
      <p className="text-sm text-coral">{text}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onYes} disabled={busy} className="rounded-full bg-coral px-4 py-1.5 text-sm font-bold text-white">{label}</button>
        <button type="button" onClick={onNo} className="btn-ghost btn-sm">취소</button>
      </div>
    </div>
  );
}
