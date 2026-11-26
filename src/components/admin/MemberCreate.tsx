"use client";

import { useState } from "react";
import type { TabProps } from "./AdminConsole";
import { SIZE_LABEL, type Member, type MemberQuota } from "./adminApi";
import { SignupCompanyFields } from "@/components/account/SignupCompanyFields";
import { LicensePicker } from "@/components/LicensePicker";
import { normalizeBizno, validBizno } from "@/lib/corpLookup";
import { PLANS } from "@/lib/plans";
import { REGIONS } from "@/lib/types";
import { kstToday, MAX_QUOTA } from "@/lib/usagePeriod";
import { useSiteConfig } from "@/lib/siteConfig";

type Pw = "temp" | "set";
type Lim = "base" | "num" | "unlimited" | "admin";

/**
 * 회원정보 > 회원 직접 등록 (worker admin.ts member-create).
 * 회원가입과 같은 항목(회사 찾기로 회사명·사업자등록번호 채우기, 담당자·연락처·이메일, 맞춤 공고 조건)에
 * 로그인 비밀번호(비우면 임시 비밀번호), 이용권, 이용 한도, 상태·메모를 함께 정한다.
 */
export function MemberCreate({ call, guard, onCreated, onClose }: {
  call: TabProps["call"]; guard: TabProps["guard"]; onCreated: (m: Member, msg: string) => void; onClose: () => void;
}) {
  const cfg = useSiteConfig();
  const [pw, setPw] = useState<Pw>("temp");
  const [lim, setLim] = useState<Lim>("base");
  const [plan, setPlan] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ company: string; email: string; temp?: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setErr("");
    const bizno = normalizeBizno(s("bizno"));
    if (!validBizno(bizno)) { setErr("올바른 사업자등록번호가 아닙니다. 숫자 10자리를 다시 확인해 주세요."); return; }
    let password = "";
    if (pw === "set") {
      password = String(f.get("password") ?? "");
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setErr("비밀번호는 영문과 숫자를 함께 넣어 8자 이상으로 정해 주세요."); return; }
      if (password !== f.get("password2")) { setErr("비밀번호 확인이 맞지 않습니다."); return; }
    }
    let limit: Record<string, unknown> = { mode: lim, memo: s("limitMemo") };
    if (lim === "num") {
      const n = Number(s("quota").replace(/[^\d]/g, ""));
      if (!s("quota") || !Number.isFinite(n) || n < 0 || n > MAX_QUOTA) { setErr(`개별 한도는 0 ~ ${MAX_QUOTA.toLocaleString()}건 사이 숫자로 적어 주세요.`); return; }
      limit = { ...limit, quota: n };
    }
    const body = {
      company: s("company"), bizno, name: s("contactName"), phone: s("phone"), email: s("email"),
      licenses: f.getAll("licenses").map(String), regions: f.getAll("regions").map(String), size: s("size"), keywords: s("keywords"),
      agreePrivacy: !!f.get("agreePrivacy"), agreeMail: !!f.get("agreeMail"),
      status: s("status") === "suspended" ? "suspended" : "active", memo: s("memo"),
      password, mustChange: pw === "set" && !!f.get("mustChange"),
      limit,
      billing: plan ? { plan, start: s("start"), end: s("end"), memo: "관리자 등록" } : null,
    };
    setBusy(true);
    try {
      const r = await guard(call<{ member: Member & { quota: MemberQuota }; temp?: string }>("member-create", { body }));
      if (r) {
        onCreated({ ...r.member, trial: r.member.trial ?? [] }, `${body.company} 회원을 등록했습니다.`);
        setDone({ company: body.company, email: body.email.toLowerCase(), temp: r.temp });
        setFormKey((k) => k + 1);
        setPw("temp"); setLim("base"); setPlan("");
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  const quotaOfPlan = (id: string) => (id === "lite" ? cfg.pricing.liteQuota : id === "standard" ? cfg.pricing.standardQuota : null);
  const baseText = plan ? `월 ${(quotaOfPlan(plan) ?? 0).toLocaleString()}건` : `무료 체험 누적 ${cfg.trialLimit.toLocaleString()}건`;

  return (
    <div className="card mt-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold">회원 직접 등록</h2>
        <button type="button" onClick={onClose} className="btn-ghost btn-sm">닫기</button>
      </div>
      <p className="mt-1 text-sm text-ink-500">회원가입과 같은 정보로 회원과 로그인 계정을 만듭니다. 로그인 아이디는 이메일 또는 사업자등록번호입니다.</p>

      {done && (
        <div className="mt-4 rounded-xl bg-mint-50 p-4 text-sm">
          <p className="font-semibold text-mint-700">{done.company} 회원을 등록했습니다. 로그인 이메일: <span className="[overflow-wrap:anywhere]">{done.email}</span></p>
          {done.temp && (
            <>
              <p className="mt-2 text-xs text-ink-500">임시 비밀번호 (이 화면에서만 보입니다. 회원에게 전하고 로그인 뒤 바꾸게 해 주세요)</p>
              <p className="mt-1 select-all font-mono text-lg font-bold tracking-wider">{done.temp}</p>
            </>
          )}
        </div>
      )}

      <form key={formKey} onSubmit={submit} className="mt-5 space-y-5">
        <fieldset className="space-y-4">
          <legend className="text-sm font-bold">기본 정보</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <SignupCompanyFields />
            <div><label className="label" htmlFor="mc-name">담당자 이름 *</label><input id="mc-name" name="contactName" required maxLength={40} className="input" /></div>
            <div><label className="label" htmlFor="mc-phone">연락처 *</label><input id="mc-phone" name="phone" required maxLength={30} className="input" placeholder="010-0000-0000" /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="mc-email">이메일 * <span className="font-normal text-ink-300">(로그인 아이디)</span></label><input id="mc-email" name="email" type="email" required maxLength={120} autoComplete="off" className="input" /></div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-ink-100 pt-5">
          <legend className="text-sm font-bold">로그인 비밀번호</legend>
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="pwMode" checked={pw === "temp"} onChange={() => setPw("temp")} />임시 비밀번호 자동 발급 (등록 뒤 한 번만 보여 드립니다)</label>
            <label className="flex items-center gap-2"><input type="radio" name="pwMode" checked={pw === "set"} onChange={() => setPw("set")} />직접 정하기</label>
          </div>
          {pw === "set" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="mc-pw">비밀번호 *</label><input id="mc-pw" name="password" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" placeholder="영문+숫자 8자 이상" /></div>
              <div><label className="label" htmlFor="mc-pw2">비밀번호 확인 *</label><input id="mc-pw2" name="password2" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="mustChange" value="1" defaultChecked />첫 로그인 때 비밀번호를 바꾸도록 안내</label>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 border-t border-ink-100 pt-5">
          <legend className="text-sm font-bold">이용권과 이용 한도</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="mc-plan">이용권</label>
              <select id="mc-plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="">없음 (무료 체험)</option>
                {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {plan && (
              <>
                <div><label className="label" htmlFor="mc-start">이용 시작일</label><input id="mc-start" name="start" type="date" className="input" defaultValue={kstToday()} /></div>
                <div><label className="label" htmlFor="mc-end">종료일 <span className="font-normal text-ink-300">(비우면 계속)</span></label><input id="mc-end" name="end" type="date" className="input" /></div>
              </>
            )}
          </div>
          {plan && <p className="text-xs text-ink-400">결제정보에 &lsquo;이용 중&rsquo;으로 기록합니다. 결제 내역은 결제정보 탭에서 따로 적어 주세요.</p>}
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="limMode" checked={lim === "base"} onChange={() => setLim("base")} />요금제 기본 한도 ({baseText})</label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name="limMode" checked={lim === "num"} onChange={() => setLim("num")} />개별 한도
              <input name="quota" className="input w-24 py-1 text-right tabular-nums" inputMode="numeric" onFocus={() => setLim("num")} aria-label="개별 한도 건수" />
              <span className="text-ink-500">건{plan ? " (월)" : " (누적)"}</span>
            </label>
            <label className="flex items-center gap-2"><input type="radio" name="limMode" checked={lim === "unlimited"} onChange={() => setLim("unlimited")} />무제한</label>
            <label className="flex items-center gap-2"><input type="radio" name="limMode" checked={lim === "admin"} onChange={() => setLim("admin")} />관리자 계정 (한도 없음, 사용 건수 안 셈)</label>
          </div>
          {lim !== "base" && <input name="limitMemo" className="input py-1.5 text-sm" maxLength={200} placeholder="사유 메모 (예: 운영 관리자, 시범 이용)" aria-label="이용 한도 메모" />}
        </fieldset>

        <details className="group space-y-4 border-t border-ink-100 pt-5">
          <summary className="cursor-pointer list-none text-sm font-bold">맞춤 공고 조건 <span className="font-normal text-ink-400">(선택)</span></summary>
          <fieldset className="mt-4">
            <legend className="label">보유 면허·업종 (투찰가능업종)</legend>
            <LicensePicker name="licenses" openGroups={0} />
          </fieldset>
          <fieldset>
            <legend className="label">영업 가능 지역</legend>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => (
                <label key={r} className="cursor-pointer">
                  <input type="checkbox" name="regions" value={r} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-500 transition peer-checked:border-mint peer-checked:bg-mint peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-mint-100">{r}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="mc-size">수행 가능한 사업 규모 (건당)</label>
              <select id="mc-size" name="size" className="input" defaultValue="">
                <option value="">선택 안 함</option>
                {Object.entries(SIZE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="mc-kw">관심 키워드 <span className="font-normal text-ink-300">(쉼표로 구분)</span></label><input id="mc-kw" name="keywords" maxLength={200} className="input" /></div>
          </div>
        </details>

        <fieldset className="space-y-3 border-t border-ink-100 pt-5">
          <legend className="text-sm font-bold">관리</legend>
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div>
              <label className="label" htmlFor="mc-status">상태</label>
              <select id="mc-status" name="status" className="input" defaultValue="active">
                <option value="active">정상</option>
                <option value="suspended">이용 정지</option>
              </select>
            </div>
            <div><label className="label" htmlFor="mc-memo">관리 메모 (회원에게 보이지 않음)</label><input id="mc-memo" name="memo" maxLength={1000} className="input" /></div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agreePrivacy" value="1" required className="mt-1" /><span><b>[필수]</b> 회원에게 개인정보 수집·이용 동의를 받았습니다.</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agreeMail" value="1" className="mt-1" /><span>맞춤 공고 메일 수신 동의</span></label>
        </fieldset>

        {err && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy}>{busy ? "등록하는 중…" : "회원 등록"}</button>
          <button type="button" onClick={onClose} className="btn-ghost">취소</button>
        </div>
      </form>
    </div>
  );
}
