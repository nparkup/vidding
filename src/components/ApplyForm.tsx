"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BidRow } from "./BidRow";
import { LicensePicker } from "./LicensePicker";
import { rank, type MatchResult } from "@/lib/analysis";
import { won } from "@/lib/format";
import { REGIONS, type License, type Region } from "@/lib/types";
import { loadBids } from "@/lib/useBids";
import { bidHref } from "@/lib/links";

const SIZES = [
  ["0-100000000", "1억 이하"],
  ["50000000-500000000", "5천만 ~ 5억"],
  ["300000000-2000000000", "3억 ~ 20억"],
  ["1000000000-10000000000", "10억 이상"],
];

/**
 * 무료 진단 신청 폼.
 * - 서버 배포: action(서버 액션)으로 접수 저장
 * - 정적 배포(GitHub Pages): 브라우저에서 바로 추천 공고를 계산하고, 신청 내용은 메일 앱으로 전송
 */
export function ApplyForm({ action, error, plan, email = "" }: { action?: (f: FormData) => void; error?: boolean; plan?: string; email?: string }) {
  const [result, setResult] = useState<{ company: string; ok: MatchResult[]; excluded: number; qs: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // 정적 배포: 진단에 쓸 공고를 미리 받아 둔다
  useEffect(() => { if (!action) loadBids().catch(() => {}); }, [action]);

  async function onStatic(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const bids = await loadBids().catch(() => []);
    setBusy(false);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const licenses = f.getAll("licenses").map(String) as License[];
    const regions = f.getAll("regions").map(String) as Region[];
    const [minAmount, maxAmount] = s("size").split("-").map(Number);
    const ranked = rank(bids, { licenses, regions, minAmount, maxAmount, pastPerformance: maxAmount });
    const ok = ranked.filter((r) => r.eligible);
    const qs = new URLSearchParams({ lic: licenses.join(","), rg: regions.join(","), min: String(minAmount), max: String(maxAmount) }).toString();
    setResult({ company: s("company"), ok, excluded: ranked.length - ok.length, qs });
    const lines = [
      `회사명: ${s("company")}`, `담당자: ${s("contactName")}`, `이메일: ${s("email")}`, `연락처: ${s("phone")}`,
      `보유 면허: ${licenses.join(", ") || "-"}`, `영업 지역: ${regions.join(", ") || "-"}`, `수행 규모: ${won(minAmount)} ~ ${won(maxAmount)}`,
      `문의: ${s("message")}`, "", `(사이트 진단 결과: 참가 가능 공고 ${ok.length}건)`,
    ];
    if (email) window.location.href = `mailto:${email}?subject=${encodeURIComponent(`[입찰메이트LAB 무료진단] ${s("company")}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center sm:p-8">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-mint text-white"><Check className="h-6 w-6" strokeWidth={3} /></span>
          <p className="mt-4 text-2xl font-extrabold">{result.company || "귀사"} 조건의 진단 결과</p>
          <p className="mt-2 text-sm text-ink-500">메일 앱이 열리지 않았다면 {email}로 회사명과 연락처를 보내 주세요.</p>
          <div className="mx-auto mt-6 grid max-w-sm grid-cols-2 gap-3">
            <div className="rounded-2xl bg-mint-50 p-4"><p className="text-3xl font-extrabold text-mint-600">{result.ok.length}</p><p className="text-sm text-ink-500">참가 가능 공고</p></div>
            <div className="rounded-2xl bg-paper p-4"><p className="text-3xl font-extrabold text-ink-500">{result.excluded}</p><p className="text-sm text-ink-500">조건 불일치 제외</p></div>
          </div>
        </div>
        {result.ok.slice(0, 5).map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={bidHref(m.bid.id, result.qs)} />)}
        <Link href={`/bids?${result.qs}&ok=1`} className="btn-primary w-full">전체 추천 공고 보기</Link>
      </div>
    );
  }

  return (
        <form action={action} onSubmit={action ? undefined : onStatic} className="card space-y-5 p-6 sm:p-8">
          {error && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">회사명, 이메일, 연락처는 꼭 입력해 주세요.</p>}
          {plan && <input type="hidden" name="message" value={`관심 요금제: ${plan}`} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="company">회사명 *</label><input id="company" name="company" required className="input" placeholder="(주)한빛클린서비스" /></div>
            <div><label className="label" htmlFor="contactName">담당자</label><input id="contactName" name="contactName" className="input" placeholder="홍길동 대표" /></div>
            <div><label className="label" htmlFor="email">이메일 *</label><input id="email" name="email" type="email" required className="input" placeholder="공고를 받을 이메일" /></div>
            <div><label className="label" htmlFor="phone">연락처 *</label><input id="phone" name="phone" required className="input" placeholder="010-0000-0000" /></div>
          </div>
          <fieldset>
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
              {SIZES.map(([v, l], i) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name="size" value={v} defaultChecked={i === 1} className="peer sr-only" />
                  <span className="block rounded-xl border border-ink-100 bg-white px-2 py-2.5 text-center text-sm text-ink-500 transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {!plan && (
            <div><label className="label" htmlFor="message">문의 내용</label><textarea id="message" name="message" rows={3} className="input" placeholder="주로 참여하고 싶은 공고, 어려운 점 등을 적어 주세요." /></div>
          )}
          <p className="text-xs text-ink-300">제출 시 상담 목적의 개인정보 수집·이용에 동의한 것으로 간주합니다.</p>
          <button className="btn-mint w-full text-base" disabled={busy}>{busy ? "공고 불러오는 중…" : "무료 진단 결과 보기"}</button>
          {!action && <p className="text-center text-xs text-ink-300">제출하면 메일 앱이 열려 신청 내용이 {email}로 전송됩니다.</p>}
        </form>
  );
}
