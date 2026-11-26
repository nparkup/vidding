"use client";

/**
 * 나라장터 입찰 예측 3단계 흐름 (사용자 요청 2026-11-26)
 *  1. 입찰 기업 조회: 회원가입 때 등록한 기업명·사업자등록번호로 조회한다. 로그인 전·미등록이면 등록을 안내하고, 조회가 끝나야 2단계가 열린다.
 *  2. 입찰 공고 선택: 공고 찾기 '나라장터 입찰 공고'의 공고 조회 화면(BidsExplorer)을 그대로 쓰되,
 *     1단계 기업이 참가할 수 없는 공고는 뺀다 (lib/listEligibility). 공고를 누르면 확인 창을 띄우고 '확인'이면 3단계로 간다.
 *  3. 입찰 점수 예측: 기존 계산(ScorePredictor)을 그대로 쓴다. 이용 건수는 3단계에 들어갈 때 센다.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BidsExplorer } from "@/components/BidsExplorer";
import { CorpSearch } from "@/components/CorpSearch";
import { CloseDay } from "@/components/CloseDay";
import { CloseDdayBadge } from "@/components/Badges";
import { useAccount, useAccountRefresh } from "@/lib/account";
import { useIsAdmin } from "@/lib/adminSession";
import { normalizeBizno, validBizno, type CorpLookup } from "@/lib/corpLookup";
import { corpBlocker, makeListJudge } from "@/lib/listEligibility";
import { won } from "@/lib/format";
import type { Bid } from "@/lib/types";
import { useBids } from "@/lib/useBids";
import { LoadingBar } from "./LoadingBar";
import { CORP_LOOKUP_ON, fetchCorp, ScorePredictor } from "./ScorePredictor";

const fmtBizno = (no: string) => no.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3");

type Lookup = { status: "idle" } | { status: "loading"; no: string } | { status: "done"; corp: CorpLookup } | { status: "error"; no: string; msg: string };

export function NaraPredictFlow() {
  const acc = useAccount();
  useAccountRefresh();
  const isAdmin = useIsAdmin();
  const sp = useSearchParams();
  const { bids } = useBids();
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [bidId, setBidId] = useState<string | null>(null);
  const [asking, setAsking] = useState<Bid | null>(null);
  const [adminInput, setAdminInput] = useState("");
  const top = useRef<HTMLDivElement>(null);

  const memberNo = acc.status === "in" && validBizno(acc.bizno) ? acc.bizno : null;
  const memberCompany = acc.status === "in" ? acc.member?.company || acc.company : "";

  async function run(no: string) {
    setLookup({ status: "loading", no });
    setBidId(null);
    try {
      const c = await fetchCorp(no);
      if (!c.corpName && !c.nts?.registered) setLookup({ status: "error", no, msg: "조회된 기업 정보가 없습니다. 회원 정보에 등록한 사업자등록번호가 맞는지 확인해 주세요." });
      else setLookup({ status: "done", corp: c });
    } catch (e) {
      setLookup({ status: "error", no, msg: (e as Error).message || "조회에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    }
  }

  // 로그인한 회원의 등록 사업자번호로 한 번 자동 조회한다
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!memberNo || !CORP_LOOKUP_ON || started.current === memberNo) return;
    started.current = memberNo;
    run(memberNo);
  }, [memberNo]);

  const corp = lookup.status === "done" ? lookup.corp : null;
  const blocker = corp ? corpBlocker(corp) : null;
  const corpOk = !!corp && !blocker;
  const judge = useMemo(() => (corp ? makeListJudge(corp) : null), [corp]);
  const step: 1 | 2 | 3 = !corpOk ? 1 : !bidId ? 2 : 3;

  // 공고 상세의 '이 공고 점수 예측하기'로 들어오면, 기업 조회가 끝난 뒤 그 공고로 확인 창을 띄운다
  const urlBid = sp.get("bid");
  const [urlNote, setUrlNote] = useState("");
  const urlDone = useRef(false);
  useEffect(() => {
    if (!urlBid || urlDone.current || !corpOk || !judge || !bids) return;
    urlDone.current = true;
    const b = bids.find((x) => x.id === urlBid);
    if (!b) { setUrlNote("공고 상세에서 고른 공고를 찾지 못했습니다. 아래에서 다시 골라 주세요."); return; }
    const v = judge(b);
    if (v.verdict === "불가") setUrlNote(`공고 상세에서 고른 '${b.title}'은 조회한 기업이 참가할 수 없어 고를 수 없습니다: ${v.reasons.join(" · ")}`);
    else setAsking(b);
  }, [urlBid, corpOk, judge, bids]);

  const toTop = () => setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  const confirmPick = () => {
    if (!asking) return;
    setBidId(asking.id);
    setAsking(null);
    toTop();
  };
  const repick = () => { setBidId(null); toTop(); };

  return (
    <div ref={top} className="scroll-mt-24 space-y-6">
      {/* 1. 입찰 기업 조회 */}
      <section className="card min-w-0 p-6" aria-labelledby="flow-corp">
        <StepTitle id="flow-corp" n={1} title="입찰 기업 조회" />
        {!CORP_LOOKUP_ON ? (
          <p className="mt-3 text-sm text-ink-500">이 미리보기에서는 기업 조회 서버에 연결할 수 없습니다.</p>
        ) : acc.status === "loading" ? (
          <p className="mt-3 text-sm text-ink-300">회원 정보를 확인하는 중…</p>
        ) : !memberNo && !(isAdmin && lookup.status !== "idle") ? (
          <div className="mt-3">
            <p className="text-sm leading-relaxed text-ink-700">
              입찰 기업은 회원가입 때 등록한 기업명과 사업자등록번호로 조회합니다.<br />
              {acc.status === "in"
                ? "회원 정보에 사업자등록번호가 없습니다. 내 정보에서 기업명과 사업자등록번호를 등록해 주세요."
                : "로그인해 주세요. 아직 회원이 아니면 회원가입에서 기업명과 사업자등록번호를 등록하면 바로 조회됩니다."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {acc.status === "in" ? (
                <Link href="/account" className="btn-mint">내 정보에서 기업 등록</Link>
              ) : (
                <>
                  <Link href="/apply" className="btn-mint">회원가입하고 기업 등록</Link>
                  <Link href="/login?next=/premium" className="btn-ghost">로그인</Link>
                </>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-500">입찰 기업 조회가 끝나야 다음 단계인 입찰 공고 선택으로 넘어갑니다.</p>
          </div>
        ) : (
          <div className="mt-3">
            {memberNo && (
              <p className="text-sm text-ink-500">회원가입 등록 기업 <b className="text-ink">{memberCompany || "기업명 미등록"}</b> · 사업자등록번호 {fmtBizno(memberNo)}</p>
            )}
            {lookup.status === "loading" && <LoadingBar label="국세청·나라장터·금융위원회 기업 정보를 조회하는 중" />}
            {lookup.status === "error" && (
              <div className="mt-3 rounded-2xl border border-coral/40 bg-coral-100/50 p-4 text-sm">
                <p className="font-semibold text-coral">입찰 기업을 조회하지 못했습니다</p>
                <p className="mt-1 text-ink-700">{lookup.msg}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => run(lookup.no)}>다시 조회</button>
                  <Link href="/account" className="btn-ghost btn-sm">내 정보 확인</Link>
                </div>
              </div>
            )}
            {corp && <CorpCard corp={corp} blocker={blocker} />}
            {corp && <button type="button" className="mt-3 text-xs font-semibold text-ink-500 underline-offset-4 hover:text-ink hover:underline" onClick={() => run(corp.bizno)}>다시 조회</button>}
            {(lookup.status === "error" || blocker) && <p className="mt-3 text-xs text-ink-500">입찰 기업 조회가 끝나야 다음 단계인 입찰 공고 선택으로 넘어갑니다.</p>}
          </div>
        )}
        {isAdmin && CORP_LOOKUP_ON && (
          <details className="mt-4 border-t border-ink-100 pt-3">
            <summary className="cursor-pointer select-none text-xs font-semibold text-ink-500">관리자: 다른 기업으로 조회</summary>
            <div className="mt-2">
              <CorpSearch id="flow-admin-corp" label="사업자등록번호 또는 기업명" value={adminInput} onChange={setAdminInput} onBizno={(no) => { const n = normalizeBizno(no); if (validBizno(n)) run(n); }} busy={lookup.status === "loading"} />
            </div>
          </details>
        )}
      </section>

      {/* 2. 입찰 공고 선택 */}
      {step === 1 ? (
        <section className="card border-dashed p-6 text-ink-300" aria-label="입찰 공고 선택">
          <StepTitle n={2} title="입찰 공고 선택" muted />
          <p className="mt-2 text-sm">1단계 입찰 기업 조회가 끝나면 조회한 기업이 참가할 수 있는 공고만 골라 보여 줍니다.</p>
        </section>
      ) : step === 2 && judge ? (
        <section className="min-w-0" aria-labelledby="flow-bid">
          <div className="card p-6">
            <StepTitle id="flow-bid" n={2} title="입찰 공고 선택" />
            <p className="mt-2 text-sm text-ink-500">
              {corp?.corpName ?? "조회한 기업"}이 참가할 수 있는 마감 전 공고만 보여 줍니다. 계약방식, 나라장터 등록 업종과 공고의 투찰가능업종, 본사 소재지와 참가가능지역을 대조했습니다.<br />
              공고를 누르면 그 공고로 입찰 점수를 예측합니다. 공고서 본문 요건은 3단계에서 첨부 자료로 다시 확인합니다.
            </p>
            {urlNote && <p className="mt-3 rounded-xl bg-coral-100/60 px-3 py-2 text-sm text-ink">{urlNote}</p>}
          </div>
          <BidsExplorer picker={{ judge, onPick: setAsking }} />
        </section>
      ) : null}

      {/* 3. 입찰 점수 예측 */}
      {step === 3 && corp && bidId ? (
        <section className="min-w-0" aria-labelledby="flow-score">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StepTitle id="flow-score" n={3} title="입찰 점수 예측" />
            <button type="button" onClick={repick} className="btn-ghost btn-sm">2단계로 돌아가 다른 공고 선택</button>
          </div>
          <ScorePredictor flow={{ corp, bidId, onRepick: repick }} />
        </section>
      ) : (
        <section className="card border-dashed p-6 text-ink-300" aria-label="입찰 점수 예측">
          <StepTitle n={3} title="입찰 점수 예측" muted />
          <p className="mt-2 text-sm">공고를 고르면 평가 기준, 참가자격, 예상 평가점수, 통과 가능한 투찰률, 낙찰 결과 분석을 보여 줍니다.</p>
        </section>
      )}

      {asking && <ConfirmPick bid={asking} onCancel={() => setAsking(null)} onOk={confirmPick} />}
    </div>
  );
}

function StepTitle({ id, n, title, muted }: { id?: string; n: number; title: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums ${muted ? "bg-white text-ink-300 ring-1 ring-inset ring-ink-100" : "bg-mint text-white"}`}>{n}</span>
      <h2 id={id} className={`text-lg font-bold ${muted ? "text-ink-400" : ""}`}>{title}</h2>
    </div>
  );
}

function CorpCard({ corp, blocker }: { corp: CorpLookup; blocker: string | null }) {
  const n = corp.nara;
  const today = new Date().toISOString().slice(0, 10);
  const inds = (n?.industries ?? []).filter((i) => !i.expiresAt || i.expiresAt >= today);
  return (
    <div className={`mt-3 rounded-2xl border p-4 ${blocker ? "border-coral/40 bg-coral-100/40" : "border-mint/40 bg-mint-50/60"}`}>
      <p className={`text-xs font-semibold ${blocker ? "text-coral" : "text-mint-700"}`}>{blocker ? "조회 완료 · 입찰 참가 불가" : "조회 완료"}</p>
      <p className="mt-1 text-lg font-bold leading-snug">{corp.corpName ?? "상호 정보 없음"}</p>
      <p className="mt-0.5 text-sm text-ink-500">사업자등록번호 {fmtBizno(corp.bizno)}{corp.ceoName ? ` · 대표 ${corp.ceoName}` : ""}{corp.nts?.state ? ` · ${corp.nts.state}` : ""}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="min-w-0"><dt className="text-xs text-ink-500">본사 소재지</dt><dd className="[overflow-wrap:anywhere]">{n?.region || "조회 안 됨"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-ink-500">나라장터 참여 분야</dt><dd>{n?.bizDivisions.length ? n.bizDivisions.join(", ") : n ? "정보 없음" : "등록 안 됨"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-ink-500">나라장터 등록 업종</dt><dd className="[overflow-wrap:anywhere]">{inds.length ? `${inds.slice(0, 3).map((i) => i.name || i.code).join(", ")}${inds.length > 3 ? ` 외 ${inds.length - 3}개` : ""}` : "없음"}</dd></div>
      </dl>
      {blocker && <p className="mt-3 text-sm font-semibold text-coral">{blocker}</p>}
      {!blocker && corp.errors.nara && <p className="mt-3 text-xs text-ink-500">나라장터 조달업체 정보를 조회하지 못해 업종·지역은 공고를 고른 뒤 다시 확인합니다.</p>}
    </div>
  );
}

function ConfirmPick({ bid, onCancel, onOk }: { bid: Bid; onCancel: () => void; onOk: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 px-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="pick-q" className="card w-full max-w-md p-6 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <p id="pick-q" className="text-lg font-bold leading-snug">해당 입찰 공고로 입찰 점수를 예측 하시겠습니까?</p>
        <div className="mt-4 rounded-2xl bg-paper p-4">
          <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]"><CloseDdayBadge iso={bid.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={bid.closeAt} />{bid.title}</p>
          <p className="mt-1 text-xs text-ink-500">{bid.demandAgency || bid.agency} · {bid.contractMethod} · {bid.baseAmount ? won(bid.baseAmount) : "금액 미공개"}</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">취소</button>
          <button ref={ok} type="button" onClick={onOk} className="btn-mint">확인</button>
        </div>
      </div>
    </div>
  );
}
