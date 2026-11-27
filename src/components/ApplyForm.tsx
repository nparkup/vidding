"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SignupCompanyFields } from "@/components/account/SignupCompanyFields";
import { BidRow } from "./BidRow";
import { LicensePicker } from "./LicensePicker";
import { rank, type MatchResult } from "@/lib/analysis";
import { planName } from "@/lib/plans";
import { REGIONS, type License, type Region } from "@/lib/types";
import { loadBids } from "@/lib/useBids";
import { keywordHits, parseKeywords, type KeywordHit } from "@/lib/keywords";
import { bidHref } from "@/lib/links";
import { normalizeBizno, validBizno } from "@/lib/corpLookup";
import { readMember, saveMember } from "@/lib/member";
import { Turnstile, turnstileToken } from "@/components/Turnstile";
import { accountCall, saveSession, useAccount, type AccountMember } from "@/lib/account";
import { TrialN } from "@/components/Cfg";

const SIZES = [
  ["0-100000000", "1억 이하"],
  ["50000000-500000000", "5천만 ~ 5억"],
  ["300000000-2000000000", "3억 ~ 20억"],
  ["1000000000-10000000000", "10억 이상"],
];

const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
/** 가입 정보를 받는 중계 서버 (worker/corp-lookup ?account=signup, R2 members/) */
const SIGNUP_API = STATIC ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "";

interface Done {
  company: string;
  /** ok: 새로 가입(로그인됨), exists: 이미 가입된 사업자번호, local: 서버에 저장하지 못하고 이 브라우저에만 저장 */
  status: "ok" | "exists" | "local";
  /** exists 일 때 그 회원이 비밀번호를 정했는지 */
  hasPassword?: boolean;
  match?: { ok: MatchResult[]; qs: string; kw: KeywordHit[] };
}

/**
 * 무료 체험 회원가입 폼. 가입하면 입찰공고 3건을 입찰점수 예측(src/lib/trial.ts)으로 무료 분석할 수 있다.
 * - 정적 배포(GitHub Pages): 중계 서버에 가입 정보를 저장하고(사업자번호 하나에 하나), 이 브라우저에 사업자번호를 적어 둔다.
 *   맞춤 공고 조건을 넣었으면 브라우저에서 바로 참가 가능 공고를 계산한다.
 * - 서버 배포: action(서버 액션)으로 접수 저장
 * 비밀번호를 같이 받아 가입과 동시에 로그인한다 (src/lib/account.ts). 비밀번호는 중계 서버가 해시로만 저장한다.
 */
export function ApplyForm({ action, error, plan, email = "" }: { action?: (f: FormData) => void; error?: boolean; plan?: string; email?: string }) {
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tsKey, setTsKey] = useState(0);
  const [joined, setJoined] = useState<string | null>(null);
  const acc = useAccount();
  useEffect(() => { setJoined(readMember()?.company ?? null); }, []);
  // 정적 배포: 참가 가능 공고 계산에 쓸 공고를 미리 받아 둔다
  useEffect(() => { if (!action) loadBids().catch(() => {}); }, [action]);

  async function onStatic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const bizno = normalizeBizno(s("bizno"));
    if (!validBizno(bizno)) { setMsg("올바른 사업자등록번호가 아닙니다. 숫자 10자리를 다시 확인해 주세요."); return; }
    if (!f.get("agreePrivacy")) { setMsg("개인정보 수집·이용에 동의해 주세요."); return; }
    const password = String(f.get("password") ?? "");
    if (SIGNUP_API) {
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setMsg("비밀번호는 영문과 숫자를 함께 넣어 8자 이상으로 정해 주세요."); return; }
      if (password !== f.get("password2")) { setMsg("비밀번호 확인이 맞지 않습니다."); return; }
    }
    setMsg("");
    setBusy(true);
    const licenses = f.getAll("licenses").map(String) as License[];
    const regions = f.getAll("regions").map(String) as Region[];
    const body = {
      company: s("company"), bizno, name: s("contactName"), email: s("email"), phone: s("phone"),
      licenses, regions, size: s("size"), keywords: s("keywords"),
      agreePrivacy: true, agreeMail: !!f.get("agreeMail"), plan: plan ?? "",
    };
    let status: Done["status"] = "local";
    let hasPassword: boolean | undefined;
    try {
      if (!SIGNUP_API) throw new Error("off");
      const j = await accountCall<{ status: "ok" | "exists"; hasPassword?: boolean; token?: string; exp?: number; member?: AccountMember }>("signup", { ...body, password, turnstile: turnstileToken(f) });
      status = j.status;
      hasPassword = j.hasPassword;
      if (j.status === "ok" && j.token && j.exp && j.member) saveSession({ token: j.token, exp: j.exp, member: j.member });
    } catch (err) {
      // 입력이 잘못됐거나 이미 쓰는 이메일이면 고치게 한다. 서버에 닿지 못하면 이 브라우저로 체험은 시작한다
      const st = (err as { status?: number }).status;
      if (st === 400 || st === 409) { setMsg((err as Error).message); setBusy(false); setTsKey((k) => k + 1); return; }
    }
    if (status !== "exists") saveMember({ bizno, company: body.company, at: Date.now() });

    // 맞춤 공고 조건을 넣었으면 참가 가능 공고를 바로 보여 준다
    let match: Done["match"];
    if (licenses.length || regions.length || body.size || body.keywords) {
      const bids = await loadBids().catch(() => []);
      const [minAmount, maxAmount] = body.size ? body.size.split("-").map(Number) : [0, 1e13];
      const ranked = rank(bids, { licenses, regions, minAmount, maxAmount, pastPerformance: maxAmount });
      const ok = ranked.filter((r) => r.eligible);
      const qs = new URLSearchParams({ lic: licenses.join(","), rg: regions.join(","), min: String(minAmount), max: String(maxAmount) }).toString();
      match = { ok, qs, kw: keywordHits(bids, parseKeywords(body.keywords)) };
    }
    setBusy(false);
    setDone({ company: body.company, status, hasPassword, match });
    setTimeout(() => document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="card p-6 sm:p-8">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-white"><Check className="h-6 w-6" strokeWidth={3} /></span>
          <p className="mt-4 text-2xl font-extrabold">{done.status === "exists" ? "이미 가입된 사업자번호입니다" : "회원가입이 완료되었습니다"}</p>
          {done.status === "exists" ? (
            <p className="mt-2 text-sm text-ink-500">
              처음 가입하신 정보는 그대로 두었습니다. {done.hasPassword ? "가입하신 이메일과 비밀번호로 로그인해 주세요." : "비밀번호 없이 가입하셨던 사업자번호입니다. 로그인 화면의 '비밀번호 처음 정하기'에서 비밀번호를 정해 주세요."}
              {" "}<Link href="/login" className="font-semibold text-mint-600 underline">로그인하러 가기</Link>
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-500">
              {done.company || "귀사"}의 무료 체험이 시작되었습니다{done.status === "ok" ? "(로그인되었습니다)" : ""}. 입찰공고 <TrialN />건을 골라 입찰점수 예측·배점표 판독·낙찰 결과로 본 예측을 써 보세요.
            </p>
          )}
          {done.status === "local" && (
            <p className="mt-2 text-xs text-coral">가입 정보를 서버에 저장하지 못했습니다.<br />체험은 이 브라우저로 바로 쓰실 수 있고, 가입 정보는 {email || "고객센터 메일"}로 회사명과 사업자번호를 보내 주시면 등록해 드립니다.</p>
          )}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href="/premium#predict" className="btn-mint">나라장터 공고 분석하기</Link>
            <Link href="/premium/apt" className="btn-ghost">공동주택 입찰공고 분석하기</Link>
          </div>
          <p className="mt-3 text-xs text-ink-400">공고 상세의 &lsquo;이 공고 점수 예측하기&rsquo;로 열어도 체험 건수로 셉니다.<br />이미 분석한 공고는 다시 열어도 차감되지 않습니다.</p>
        </div>
        {done.match && (
          <>
            <div className="card p-5">
              <p className="text-sm font-bold">입력하신 조건으로 지금 참가 가능한 공고 <span className="text-mint-600">{done.match.ok.length.toLocaleString()}건</span></p>
              <p className="mt-1 text-xs text-ink-500">이 중에서 체험할 공고를 고르셔도 됩니다.<br />맞춤 공고 메일은 요금제를 시작하면 다음 영업일 아침부터 보내 드립니다.</p>
            </div>
            {done.match.kw.length > 0 && (
              <div className="card p-5">
                <p className="text-sm font-bold">관심 키워드로 찾은 진행 중 공고</p>
                <ul className="mt-2 divide-y divide-ink-100 text-sm">
                  {done.match.kw.map((k) => (
                    <li key={k.keyword} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 font-semibold">{k.keyword}</span>
                      <Link href={`/bids?q=${encodeURIComponent(k.keyword)}`} className="shrink-0 text-mint-600 hover:underline">{k.bids.length.toLocaleString()}건 보기</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {done.match.ok.slice(0, 5).map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={bidHref(m.bid.id, done.match!.qs)} />)}
            <Link href={`/bids?${done.match.qs}&ok=1`} className="btn-primary w-full">전체 추천 공고 보기</Link>
          </>
        )}
      </div>
    );
  }

  const section = "space-y-4 border-t border-ink-100 pt-5";
  return (
        <form action={action} onSubmit={action ? undefined : onStatic} className="card space-y-5 p-6 sm:p-8">
          <div>
            <h2 className="text-xl font-extrabold">회원가입</h2>
            <p className="mt-1 text-sm text-ink-500">가입하면 바로 무료 체험이 시작됩니다.</p>
            {acc.status === "in" ? (
              <p className="mt-2 rounded-xl bg-mint-50 px-3 py-2 text-xs text-mint-700">{acc.company}(으)로 로그인되어 있습니다.<br />바로 <Link href="/premium#predict" className="font-semibold underline">공고 분석</Link>을 시작하셔도 됩니다.</p>
            ) : joined ? (
              <p className="mt-2 rounded-xl bg-mint-50 px-3 py-2 text-xs text-mint-700">이 브라우저는 {joined}(으)로 가입되어 있습니다. <Link href="/login" className="font-semibold underline">로그인</Link>하면 다른 기기에서도 이어서 쓸 수 있습니다.</p>
            ) : (
              <p className="mt-2 text-xs text-ink-500">이미 가입하셨나요? <Link href="/login" className="font-semibold text-mint-600 underline">로그인</Link></p>
            )}
          </div>
          {(error || msg) && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">{msg || "회사명, 이메일, 연락처는 꼭 입력해 주세요."}</p>}
          {plan && <input type="hidden" name="message" value={`관심 이용권: ${planName(plan)}`} />}

          <fieldset className="space-y-4">
            <legend className="text-sm font-bold">기본 정보</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <SignupCompanyFields />
              <div><label className="label" htmlFor="contactName">담당자 이름 *</label><input id="contactName" name="contactName" required maxLength={40} className="input" placeholder="홍길동" /></div>
              <div><label className="label" htmlFor="phone">연락처 *</label><input id="phone" name="phone" required maxLength={30} className="input" placeholder="010-0000-0000" /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="email">이메일 * <span className="font-normal text-ink-300">(로그인 아이디)</span></label><input id="email" name="email" type="email" required autoComplete="username" maxLength={120} className="input" placeholder="안내를 받고 로그인할 이메일" /></div>
              {!action && (
                <>
                  <div><label className="label" htmlFor="password">비밀번호 *</label><input id="password" name="password" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" placeholder="영문+숫자 8자 이상" /></div>
                  <div><label className="label" htmlFor="password2">비밀번호 확인 *</label><input id="password2" name="password2" type="password" required minLength={8} maxLength={64} autoComplete="new-password" className="input" /></div>
                </>
              )}
            </div>
            <p className="text-xs text-ink-400">무료 체험 3건은 사업자등록번호 하나에 한 번 드립니다.</p>
          </fieldset>

          <details className={`group ${section}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">
              맞춤 공고 조건 <span className="font-normal text-ink-400">(선택 · 넣으면 가입 즉시 참가 가능 공고를 보여 드립니다)</span>
            </summary>
            <fieldset className="mt-4">
              <legend className="label">보유 면허·업종 (투찰가능업종)</legend>
              <LicensePicker name="licenses" />
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
            <fieldset>
              <legend className="label">수행 가능한 사업 규모 (건당)</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SIZES.map(([v, l]) => (
                  <label key={v} className="cursor-pointer">
                    <input type="radio" name="size" value={v} className="peer sr-only" />
                    <span className="block rounded-xl border border-ink-100 bg-white px-2 py-2.5 text-center text-sm text-ink-500 transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="label" htmlFor="keywords">관심 키워드 <span className="font-normal text-ink-300">(쉼표로 구분)</span></label>
              <input id="keywords" name="keywords" maxLength={200} className="input" placeholder="CCTV, 급식, 학교 청소" />
              <p className="mt-1 text-xs text-ink-300">요금제를 이용하시면 이 단어가 든 새 공고를 맞춤공고 메일에 따로 모아 드립니다.<br />빼고 싶은 단어는 앞에 -를 붙이세요 (예: -설계).</p>
            </div>
          </details>

          <fieldset className={section}>
            <legend className="sr-only">약관 동의</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agreePrivacy" value="1" required className="mt-1" />
              <span><b>[필수]</b> 개인정보 수집·이용에 동의합니다.</span>
            </label>
            <details className="rounded-xl bg-paper px-4 py-3 text-xs leading-relaxed text-ink-500">
              <summary className="cursor-pointer font-semibold text-ink-700">수집 항목과 이용 목적 보기</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>수집 항목: 회사명, 사업자등록번호, 담당자 이름, 이메일, 연락처, 입력하신 맞춤 공고 조건, 비밀번호(복원할 수 없는 암호화 값으로만 저장)</li>
                <li>이용 목적: 회원 확인과 로그인, 무료 체험·이용권 사용 건수 확인, 이용 안내와 요금제 상담</li>
                <li>보유 기간: 회원 탈퇴 때까지. 탈퇴는 로그인 후 내 정보에서 직접 하실 수 있고, 탈퇴하면 바로 지웁니다(남은 이용권이 있으면 이용권이 끝난 다음 날 지우도록 고를 수 있습니다).</li>
                <li>자료는 해외 클라우드(Cloudflare, 미국)에 저장됩니다. 탈퇴 후에도 결제 기록은 법에 따라 5년 보관합니다.</li>
                <li>동의하지 않으실 수 있으며, 이 경우 회원가입과 무료 체험을 이용하실 수 없습니다.</li>
                <li>자세한 내용은 <Link href="/privacy" target="_blank" className="font-semibold text-mint-600 underline">개인정보처리방침</Link>을 확인해 주세요.</li>
              </ul>
            </details>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="agreeMail" value="1" className="mt-1" />
              <span><b className="text-ink-500">[선택]</b> 맞춤 공고와 서비스 소식을 이메일로 받겠습니다.</span>
            </label>
          </fieldset>

          <Turnstile resetKey={tsKey} />
          <button className="btn-mint w-full text-base" disabled={busy}>{busy ? "가입하는 중…" : "가입하고 무료 체험 시작"}</button>
          <p className="text-center text-xs text-ink-300">가입하면 바로 로그인됩니다.<br />다른 기기에서는 이메일과 비밀번호로 로그인하세요.</p>
        </form>
  );
}
