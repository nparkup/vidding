"use client";

import { useEffect, useState } from "react";
import type { TabProps } from "./AdminConsole";
import { dt, won } from "./adminApi";
import { Field } from "./MembersTab";
import { DEFAULT_CONFIG, normalizeConfig, type SiteConfig } from "@/lib/siteConfigCore";

/**
 * 페이지 설정: 코드를 고치지 않고 사이트에 바로 반영되는 값.
 * 저장하면 중계 서버(R2 config/site.json)에 두고, 사이트는 화면을 열 때 ?config=1 로 받아 기본값 대신 쓴다 (1~2분 캐시).
 */
export function SettingsTab({ call, guard }: TabProps) {
  const [cfg, setCfg] = useState<SiteConfig | null>(null);
  const [saved, setSaved] = useState<SiteConfig | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    guard(call<{ config: SiteConfig }>("settings"))
      .then((r) => { if (r) { const c = normalizeConfig(r.config); setCfg(c); setSaved(c); } })
      .catch((e) => setErr((e as Error).message));
  }, [call, guard]);

  if (!cfg) return <><Head />{err ? <p className="mt-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p> : <p className="mt-4 text-sm text-ink-400">불러오는 중…</p>}</>;

  const setB = (p: Partial<SiteConfig["banner"]>) => setCfg((c) => c && { ...c, banner: { ...c.banner, ...p } });
  const dirty = JSON.stringify({ ...cfg, updatedAt: undefined }) !== JSON.stringify({ ...saved, updatedAt: undefined });

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setErr("");
    setNote("");
    try {
      const r = await guard(call<{ config: SiteConfig }>("settings", { body: cfg }));
      if (r) { const c = normalizeConfig(r.config); setCfg(c); setSaved(c); setNote("저장했습니다. 사이트에는 1~2분 안에 반영됩니다."); }
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;

  return (
    <>
      <Head />
      {cfg.updatedAt && <p className="mt-1 text-xs text-ink-400">마지막 저장 {dt(cfg.updatedAt)}</p>}

      <section className="card mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">공지 띠</h2>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={cfg.banner.on} onChange={(e) => setB({ on: e.target.checked })} />사이트에 보이기</label>
        </div>
        <p className="mt-1 text-sm text-ink-500">모든 공개 화면 맨 위에 한 줄로 보입니다. 기간을 비우면 끌 때까지 보입니다.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="문구 (200자까지)"><input className="input" value={cfg.banner.text} maxLength={200} onChange={(e) => setB({ text: e.target.value })} placeholder="예: 12월 24일 오후 6시~8시 공고 갱신이 잠시 늦어질 수 있습니다." /></Field></div>
          <Field label="링크 (https:// 또는 /로 시작, 선택)"><input className="input" value={cfg.banner.link} onChange={(e) => setB({ link: e.target.value })} placeholder="/pricing" /></Field>
          <Field label="링크 글자"><input className="input" value={cfg.banner.linkLabel} maxLength={30} onChange={(e) => setB({ linkLabel: e.target.value })} placeholder="자세히" /></Field>
          <Field label="색">
            <select className="input" value={cfg.banner.tone} onChange={(e) => setB({ tone: e.target.value === "warn" ? "warn" : "info" })}>
              <option value="info">기본 (어두운 띠)</option>
              <option value="warn">주의 (노란 띠)</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="보이기 시작"><input className="input min-w-0" type="date" value={cfg.banner.from} onChange={(e) => setB({ from: e.target.value })} /></Field>
            <Field label="보이기 끝"><input className="input min-w-0" type="date" value={cfg.banner.to} onChange={(e) => setB({ to: e.target.value })} /></Field>
          </div>
        </div>
        {cfg.banner.text && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-ink-500">미리 보기</p>
            <div className={`mt-1 rounded-xl px-4 py-2 text-center text-sm ${cfg.banner.tone === "warn" ? "bg-amber-100 text-ink" : "bg-ink text-white"}`}>
              {cfg.banner.text}{cfg.banner.link && <span className="ml-3 font-bold underline underline-offset-2">{cfg.banner.linkLabel || "자세히"}</span>}
            </div>
          </div>
        )}
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-bold">요금</h2>
        <p className="mt-1 text-sm text-ink-500">월간 이용권 3종의 금액(VAT 포함, 월)과 한 달 공고 예측 건수입니다. 메인·요금제·회원가입 화면과 요금 FAQ에 반영됩니다.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {([["lite", "라이트"], ["standard", "스탠다드"], ["unlimited", "무제한"]] as const).map(([k, label]) => (
            <Field key={k} label={`${label} (월)`}><input className="input text-right tabular-nums" inputMode="numeric" value={cfg.pricing[k].toLocaleString()} onChange={(e) => setCfg({ ...cfg, pricing: { ...cfg.pricing, [k]: num(e.target.value) } })} /></Field>
          ))}
          <Field label="라이트 공고 예측 건수 (월)"><input className="input text-right tabular-nums" inputMode="numeric" value={cfg.pricing.liteQuota.toLocaleString()} onChange={(e) => setCfg({ ...cfg, pricing: { ...cfg.pricing, liteQuota: num(e.target.value) } })} /></Field>
          <Field label="스탠다드 공고 예측 건수 (월)"><input className="input text-right tabular-nums" inputMode="numeric" value={cfg.pricing.standardQuota.toLocaleString()} onChange={(e) => setCfg({ ...cfg, pricing: { ...cfg.pricing, standardQuota: num(e.target.value) } })} /></Field>
          <Field label="무제한 공고 예측 건수"><input className="input text-right" value="무제한" disabled /></Field>
        </div>
        {!(cfg.pricing.lite < cfg.pricing.standard && cfg.pricing.standard < cfg.pricing.unlimited) && <p className="mt-2 text-sm text-coral">윗 단계 이용권이 아래 단계보다 싸거나 같습니다. 금액을 다시 확인해 주세요.</p>}
        <p className="mt-2 text-xs text-ink-400">이미 결제한 회원의 금액은 바뀌지 않습니다.</p>
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-bold">무료 체험</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="분석할 수 있는 입찰공고 수">
            <input className="input w-28 text-right tabular-nums" inputMode="numeric" value={cfg.trialLimit} onChange={(e) => setCfg({ ...cfg, trialLimit: Math.min(50, num(e.target.value)) })} />
          </Field>
          <p className="pb-2 text-sm text-ink-500">건 (0이면 무료 체험을 막습니다)</p>
        </div>
        <p className="mt-2 text-xs text-ink-400">안내 문구의 건수와 중계 서버의 사업자번호별 한도가 함께 바뀝니다. 줄여도 이미 분석한 공고는 그대로 다시 열 수 있습니다.</p>
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="text-lg font-bold">기능 켜고 끄기</h2>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={cfg.features.mybox} onChange={(e) => setCfg({ ...cfg, features: { ...cfg.features, mybox: e.target.checked } })} />
          <span><b>내 서류함</b><span className="block text-ink-500">상단 메뉴의 &lsquo;내 서류함&rsquo;, 공고의 &lsquo;서류함에 담기&rsquo; 버튼, 정정 알림의 &lsquo;관심공고만&rsquo;을 보입니다. 로그인 기능이 생기기 전에는 담은 공고가 그 브라우저에만 남습니다.</span></span>
        </label>
      </section>

      {err && <p className="mt-4 rounded-xl bg-coral-100 p-3 text-sm text-coral">{err}</p>}
      {note && <p className="mt-4 text-sm text-mint-700">{note}</p>}
      <div className="sticky bottom-0 -mx-4 mt-5 flex flex-wrap items-center gap-3 border-t border-ink-100 bg-paper/95 px-4 py-3 backdrop-blur lg:mx-0 lg:px-0">
        <button type="button" className="btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>{saving ? "저장 중…" : dirty ? "저장" : "저장됨"}</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => saved && setCfg(saved)} disabled={!dirty}>되돌리기</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setCfg({ ...DEFAULT_CONFIG, banner: { ...cfg.banner, on: false } })}>코드 기본값으로</button>
      </div>
    </>
  );
}

function Head() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">페이지 설정</h1>
      <p className="mt-1 text-sm text-ink-500">코드를 고치지 않고 사이트에 바로 반영되는 값입니다. 저장하면 1~2분 안에 모든 화면에 적용됩니다.</p>
    </div>
  );
}
