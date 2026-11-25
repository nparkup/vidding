"use client";

import { useEffect, useMemo, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { bizFmt, downloadCsv, dt, type Member } from "./adminApi";
import { Stats } from "./MembersTab";
import { DailyBars, lastDays, seriesOf, type HitRow } from "./Bars";
import { planName } from "@/lib/plans";
import { useSiteConfig } from "@/lib/siteConfig";
import { fullOf, leftOf, periodText, QuotaBar, quotaText, tierName, unitOf, useMemberQuota } from "./limits";
import type { MemberQuota } from "./adminApi";

/** 마지막 활동: 무료 체험으로 공고를 연 때와 사업자번호를 넣은 조회 중 늦은 쪽 */
const lastActive = (m: Member) => Math.max(0, ...m.trial.map((t) => t.t), m.seen?.last ?? 0);

type Tier = "all" | "trial" | "lite" | "standard" | "other";
const tierKey = (q: MemberQuota): Exclude<Tier, "all"> => (q.tier === "trial" || q.tier === "lite" || q.tier === "standard" ? q.tier : "other");
const rate = (q: MemberQuota) => (q.quota === null ? -1 : q.quota ? q.used / q.quota : 1);

/** 회원 사용량: 요금제별 이용 한도와 회원별 사용 건수, 무료 체험 분석 공고, 사업자번호 조회 횟수, 마지막 활동 */
export function UsageTab({ call, guard, members, limit, busy, reload }: TabProps) {
  const [rows, setRows] = useState<HitRow[] | null>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<"active" | "trial" | "seen" | "rate">("active");
  const [tier, setTier] = useState<Tier>("all");
  const quotaOf = useMemberQuota();
  const pricing = useSiteConfig().pricing;
  const qs = useMemo(() => new Map(members.map((m) => [m.bizno, quotaOf(m)])), [members, quotaOf]);
  const tiers = useMemo(() => {
    const defs: { k: Exclude<Tier, "all">; name: string; base: string }[] = [
      { k: "trial", name: "무료 체험", base: `누적 ${limit.toLocaleString()}건` },
      { k: "lite", name: planName("lite"), base: `월 ${pricing.liteQuota.toLocaleString()}건` },
      { k: "standard", name: planName("standard"), base: `월 ${pricing.standardQuota.toLocaleString()}건` },
    ];
    const list = [...qs.values()];
    const other = list.filter((q) => tierKey(q) === "other");
    const out = defs.map((d) => {
      const g = list.filter((q) => tierKey(q) === d.k);
      return { ...d, n: g.length, used: g.reduce((a, q) => a + q.used, 0), full: g.filter(fullOf).length, custom: g.filter((q) => q.custom).length };
    });
    if (other.length) out.push({ k: "other", name: "예전 이용권", base: "무제한", n: other.length, used: other.reduce((a, q) => a + q.used, 0), full: other.filter(fullOf).length, custom: other.filter((q) => q.custom).length });
    return out;
  }, [qs, limit, pricing]);
  const days = useMemo(() => lastDays(30), []);

  useEffect(() => {
    guard(call<{ rows: HitRow[] }>("hits", { params: { days: "30", kinds: "req" } }))
      .then((r) => r && setRows(r.rows))
      .catch((e) => setErr((e as Error).message));
  }, [call, guard]);

  const stats = useMemo(() => {
    const week = Date.now() - 7 * 86400_000;
    const used = members.filter((m) => m.trial.length > 0);
    const paid = members.filter((m) => m.billing?.status === "active");
    return {
      active7: members.filter((m) => lastActive(m) >= week).length,
      analyses: members.reduce((s, m) => s + m.trial.length, 0),
      used: used.length,
      full: members.filter((m) => m.trial.length >= limit).length,
      paid: paid.length,
      conv: used.length ? `${Math.round((paid.filter((m) => m.trial.length > 0).length / used.length) * 100)}%` : "-",
    };
  }, [members, limit]);

  const sorted = useMemo(() => [...members].filter((m) => tier === "all" || tierKey(qs.get(m.bizno)!) === tier).sort((a, b) =>
    sort === "trial" ? b.trial.length - a.trial.length || lastActive(b) - lastActive(a)
      : sort === "seen" ? (b.seen?.n ?? 0) - (a.seen?.n ?? 0)
        : sort === "rate" ? rate(qs.get(b.bizno)!) - rate(qs.get(a.bizno)!) || lastActive(b) - lastActive(a)
          : lastActive(b) - lastActive(a)), [members, sort, tier, qs]);

  function csv() {
    downloadCsv("회원사용량", ["회사명", "사업자등록번호", "요금제", "적용 한도", "개별 한도", "이번 기간 사용", "남은 건수", "기간", "체험 사용", "분석한 공고", "첫 분석", "마지막 분석", "사업자번호 조회 횟수", "마지막 활동", "결제"],
      sorted.map((m) => {
        const ts = m.trial.map((t) => t.t).sort((a, b) => a - b);
        const q = qs.get(m.bizno)!;
        const left = leftOf(q);
        return [m.company, bizFmt(m.bizno), tierName(q), quotaText(q.quota), q.custom ? "예" : "", q.used, left === null ? "제한 없음" : left, periodText(q), `${m.trial.length}/${limit}`, m.trial.map((t) => t.k).join(" "), dt(ts[0]), dt(ts[ts.length - 1]), m.seen?.n ?? 0, dt(lastActive(m) || null), m.billing?.status === "active" ? planName(m.billing.plan) : ""];
      }));
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">회원 사용량</h1>
          <p className="mt-1 text-sm text-ink-500">요금제마다 정한 공고 예측 이용 한도와 회원별 사용 건수입니다. 무료 체험은 누적, 이용권은 이용 시작일 기준 한 달마다 새로 셉니다.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reload} className="btn-ghost btn-sm" disabled={busy}>{busy ? "불러오는 중…" : "새로 불러오기"}</button>
          <button type="button" onClick={csv} className="btn-primary btn-sm" disabled={!members.length}>CSV 내려받기</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {tiers.map((t) => (
          <button key={t.k} type="button" onClick={() => setTier(tier === t.k ? "all" : t.k)} className={`card min-w-0 p-4 text-left transition ${tier === t.k ? "ring-2 ring-mint" : "hover:border-mint-300"}`} aria-pressed={tier === t.k}>
            <p className="flex items-baseline justify-between gap-2"><span className="font-bold">{t.name}</span><span className="text-xs tabular-nums text-ink-500">기본 한도 {t.base}</span></p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums">{t.n.toLocaleString()}<span className="ml-0.5 text-sm font-semibold text-ink-500">명</span></p>
            <p className="mt-1 text-xs tabular-nums text-ink-500">{t.k === "trial" ? "누적" : "이번 기간"} 사용 {t.used.toLocaleString()}건 · 한도 모두 사용 {t.full.toLocaleString()}명{t.custom ? ` · 개별 한도 ${t.custom.toLocaleString()}명` : ""}</p>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-400">요금제 카드를 누르면 아래 목록을 그 요금제 회원만 봅니다. 기본 한도는 페이지 설정, 회원별 개별 한도는 회원정보 상세에서 바꿉니다.</p>

      <Stats items={[["최근 7일 활동 회원", stats.active7], ["체험 분석 공고", stats.analyses], ["체험 사용 회원", stats.used], [`${limit}건 모두 사용`, stats.full], ["결제 중", stats.paid], ["체험 후 결제 비율", stats.conv]]} />

      <div className="card mt-5 grid gap-6 p-5 md:grid-cols-2">
        {rows ? (
          <>
            <DailyBars days={days} label="무료 체험 확인 요청 (일별)" values={seriesOf(rows, days, (r) => r.kind === "req" && r.key === "trial")} />
            <DailyBars days={days} label="사업자번호 조회 (일별)" values={seriesOf(rows, days, (r) => r.kind === "req" && (r.key === "bizno" || r.key === "awards" || r.key === "perf"))} />
          </>
        ) : <p className="text-sm text-ink-400 md:col-span-2">{err || "불러오는 중…"}</p>}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-400">{tier === "all" ? "" : `${tiers.find((t) => t.k === tier)?.name ?? ""} 회원만 · `}회원별 기록은 사업자번호 기준입니다. 조회 횟수는 지표 수집을 시작한 뒤부터 셉니다.</p>
        <select className="input w-auto shrink-0" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬">
          <option value="active">마지막 활동 순</option>
          <option value="trial">체험 사용 많은 순</option>
          <option value="seen">조회 많은 순</option>
          <option value="rate">한도 사용률 높은 순</option>
        </select>
      </div>

      <div className="card mt-3 overflow-x-auto">
        <table className="table-x min-w-[920px]">
          <thead>
            <tr><th>회사명 · 사업자번호</th><th>요금제</th><th className="min-w-[11rem]">이용 한도 (공고 예측)</th><th>분석한 공고 (체험)</th><th className="text-right">조회</th><th>마지막 활동</th></tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const la = lastActive(m);
              const q = qs.get(m.bizno)!;
              const left = leftOf(q);
              return (
                <tr key={m.bizno}>
                  <td className="leading-snug"><span className="font-semibold">{m.company}</span><span className="block text-xs tabular-nums text-ink-400">{bizFmt(m.bizno)}</span></td>
                  <td className="whitespace-nowrap text-sm">{tierName(q)}{q.custom && <span className="ml-1.5 rounded-lg bg-sky-100 px-1.5 py-0.5 text-xs font-bold text-sky">{q.admin ? "관리자" : "개별"}</span>}</td>
                  <td>
                    <p className="flex items-baseline justify-between gap-2 text-sm tabular-nums"><span><b>{q.used.toLocaleString()}</b> / {quotaText(q.quota)}</span><span className={`text-xs ${fullOf(q) ? "font-bold text-coral" : "text-ink-400"}`}>{left === null ? unitOf(q) : `${unitOf(q)} · 남음 ${left.toLocaleString()}`}</span></p>
                    <div className="mt-1"><QuotaBar q={q} /></div>
                    {q.period && <p className="mt-0.5 text-[11px] tabular-nums text-ink-400">{periodText(q)}</p>}
                  </td>
                  <td className="max-w-[16rem] text-xs text-ink-500">{m.trial.length ? m.trial.map((t) => t.k.replace(/^(nara|apt|nuri):/, (x) => (x === "apt:" ? "공동주택 " : x === "nuri:" ? "누리장터 " : ""))).join(", ") : "-"}</td>
                  <td className="text-right tabular-nums">{(m.seen?.n ?? 0).toLocaleString()}</td>
                  <td className="whitespace-nowrap text-sm tabular-nums">{la ? dt(la) : <span className="text-ink-300">-</span>}</td>
                </tr>
              );
            })}
            {!sorted.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-ink-400">아직 회원이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
