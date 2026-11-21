"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CloseDdayBadge, ScoreBar } from "@/components/Badges";
import { readDocument, UnsupportedDocError } from "@/lib/docText";
import {
  CREDIT_GRADES, DEFAULT_COMPANY, findCreditGrade, kindOf, predict, templateSheet, yearsSince,
  type CompanyInput, type CreditGrade, type EvalItem, type EvalSheet, type ItemKind, type Level,
} from "@/lib/evalscore";
import { adoptable, bidSheet, TECH_GRADES } from "@/lib/criteria";
import type { NoticeCriteria } from "@/lib/noticeCriteria";
import { won, wonFull } from "@/lib/format";
import { normalizeBizno, validBizno, type CorpLookup } from "@/lib/corpLookup";
import { judgeEligibility, type BidQual, type Eligibility, type Verdict } from "@/lib/eligibility";
import type { Bid, BidAttachment } from "@/lib/types";
import { useBids } from "@/lib/useBids";
import { closedLabel, methodProfile } from "@/lib/bidMethod";
import { estimateRival, MIN_SAMPLES, type AwardStats, type RivalEstimate } from "@/lib/rivalRate";
import { sheetPerfPeriod } from "@/lib/perfLookup";
import { PerfLookup, type PerfSummary } from "./PerfLookup";
import { LoadingBar } from "./LoadingBar";
import { AwardAnalysisSection, ForecastCard, loadAwardAnalysis } from "./AwardAnalysis";
import { forecast, winChance, withConfirmed, withKind, type AwardAnalysis } from "@/lib/awards/analysis";
import { CloseDay } from "../CloseDay";
import { TrustPicker } from "./TrustPicker";
import { applyTrustAuto, trustFromCorp, type TrustAuto } from "@/lib/trustAuto";
import { jointPredict, type JointMember } from "@/lib/joint";
import { JointMembers } from "./JointMembers";
import { PassAmount } from "./PassAmount";
import { PerfCapCard } from "./PerfCapCard";
import { syncTrialServer, useTrial, type TrialEntry } from "@/lib/trial";
import { readMember } from "@/lib/member";
import { TrialIntro, TrialLocked, TrialNote } from "./TrialGate";

/** 공고 선택 검색에서 한 번에 보여줄 최대 공고 수 (목록은 스크롤) */
const MAX_MATCHES = 100;
const STATIC = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
/** 정적 사이트는 Cloudflare 중계 서버(worker/corp-lookup)로, 서버 배포는 자체 API로 조회한다. 정적 사이트에 중계 주소가 없으면 조회를 끈다 */
const CORP_API = STATIC ? process.env.NEXT_PUBLIC_CORP_API ?? "" : "/api/premium/corp";
/** 유사 실적(나라장터 낙찰 이력) 조회: 정적 사이트는 같은 중계 서버, 서버 배포는 자체 API */
const PERF_API = STATIC ? CORP_API : "/api/premium/perf";

interface BidDocs { files: BidAttachment[]; sheet?: EvalSheet; sheetFile?: string; /** AI 판독 입력이 있으면 그 본문 해시 */ ai?: string; /** 빌드가 첨부를 모두 읽었으면 읽은 파일 이름 */ read?: string[]; notice?: NoticeCriteria; quant?: { items: EvalItem[]; total: number; quote: string }; qual?: BidQual }

/** 정적 배포는 빌드 때 공고별로 만들어 둔 파일(첨부 목록 + 첨부에서 추출한 평가표)을, 서버 배포는 나라장터 첨부 목록을 바로 조회한다 */
async function loadBidDocs(bid: Bid): Promise<BidDocs> {
  const url = STATIC
    ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/attachments/${encodeURIComponent(bid.id)}.json`
    : `/api/premium/attachments?${new URLSearchParams({ no: bid.bidNtceNo, ord: bid.bidNtceOrd, biz: bid.bizType ?? "용역" })}`;
  const r = await fetch(url);
  if (!r.ok) return { files: [] };
  const j = await r.json();
  return Array.isArray(j) ? { files: j } : j;
}

type AiRead = "idle" | "reading" | "done" | "none" | "fail";

/**
 * 규칙 파서가 배점표를 못 읽은 공고: 중계 서버에 AI 판독을 부탁한다 (서버가 빌드 때 만든 본문으로 Claude를 부르고 결과를 캐시한다).
 * 처음 읽는 공고는 10~30초 걸리고, 같은 공고는 캐시에서 바로 온다.
 */
async function loadAiSheet(bid: Bid): Promise<EvalSheet | null> {
  const r = await fetch(`${CORP_API}?${new URLSearchParams({ aisheet: bid.id })}`);
  if (!r.ok) throw new Error(`배점표 판독 ${r.status}`);
  const j = (await r.json()) as { status: string; sheet?: EvalSheet };
  if (j.status !== "ok" || !j.sheet) return null;
  // 예전에 저장된 판독 결과의 제목·메모에 남은 'AI 판독' 표기를 지운다
  const clean = (s: string) => s.replace(/\s*\(AI 판독\)/g, "").replace(/^AI 판독:\s*/, "배점표 원문: ");
  return { ...j.sheet, title: clean(j.sheet.title), notes: j.sheet.notes.map(clean) };
}

/**
 * 같은 사업인지 애매한 과거 낙찰 후보가 있으면 중계 서버에 확인을 부탁해 같은 사업으로 확인된 것만 이력에 넣는다.
 * 실패하거나 8초 안에 답이 없으면 확실한 이력만 쓴다.
 */
async function confirmRelated(bid: Bid, a: AwardAnalysis | null): Promise<AwardAnalysis | null> {
  if ((!a?.maybe?.length && !a?.related?.rows?.length) || !STATIC || !CORP_API) return a;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${CORP_API}?${new URLSearchParams({ relate: bid.id })}`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return a;
    const j = (await r.json()) as { status: string; same?: string[]; kind?: string[] };
    if (j.status !== "ok") return a;
    let out = j.same?.length ? withConfirmed(a, j.same, a.subject?.postedAt ?? bid.postedAt.slice(0, 10)) : a;
    if (j.kind) out = withKind(out, j.kind);
    return out;
  } catch {
    return a;
  }
}

/** 전년도 낙찰률 통계: 정적 배포는 빌드 때 만든 파일, 서버 배포는 같은 경로의 라우트 */
async function loadAwardStats(): Promise<AwardStats | null> {
  const r = await fetch(`${STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : ""}/award-stats.json`);
  return r.ok ? r.json() : null;
}

const KIND_LABEL: Record<ItemKind, string> = {
  performance: "실적",
  credit: "신용·경영상태",
  price: "입찰가격",
  years: "업력",
  staff: "기술인력",
  bonus: "신뢰도 가감점(신인도)",
  qualitative: "정성평가",
  other: "기타",
  capability: "사업수행능력",
  plan: "이행계획·확약",
  finance: "재무비율",
  techGrade: "기술등급",
};

/** 사업자번호 조회로 처음 채운 값과 그 출처. 고객이 바꾸면 '수정됨'으로 보여 준다 */
type FactKey = "years" | "employees" | "equityRatio" | "creditGrade";
interface AutoFact { value: number | string; from: string }

/** 증빙 기준: 이 값을 무엇으로 확인하는지 */
const EVIDENCE: Record<string, string> = {
  years: "사업자등록증 개업일 또는 법인등기부 설립일",
  employees: "4대 보험 가입자 명부 (심사기준일 기준)",
  techStaff: "자격증 사본과 재직증명 (공고 분야 기술인력)",
  creditGrade: "신용평가등급확인서 (입찰공고일 전 평가, 유효기간 안의 등급)",
  pqScore: "사업수행능력 평가 결과 (발주기관 PQ 심사점수)",
  techGrade: "기술등급 확인서 (중소기업기술정보진흥원 등)",
  equityRatio: "최근 결산 재무제표 (자기자본 ÷ 총자산)",
  currentRatio: "최근 결산 재무제표 (유동자산 ÷ 유동부채)",
  smallFirm: "소기업·소상공인 확인서 또는 창업기업 확인서",
  perf: "실적증명서 (발주기관 발급, 공고의 인정 기간·동등이상 기준)",
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** 실제 공고·낙찰 결과와 기준표를 대조한 결과 (scripts/score/validate.ts) */
interface Validation {
  builtAt: string;
  period: { notices: [string, string]; awards: [string, string] };
  total: { notices: number; lwltCompared: number; lwltMatched: number; winners: number; winnersInside: number };
  byKind: Record<string, Validation["total"]>;
}
async function loadValidation(): Promise<Validation | null> {
  const r = await fetch(`${STATIC ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : ""}/score-validation.json`);
  return r.ok ? r.json() : null;
}

export function ScorePredictor() {
  const sp = useSearchParams();
  const { bids, error } = useBids();
  const [bidId, setBidId] = useState<string | null>(sp.get("bid"));
  const [query, setQuery] = useState("");
  /** 고객이 항목을 고치거나 더한 평가표. 없으면 공고 기준으로 만든 평가표를 쓴다 */
  const [sheet, setSheet] = useState<EvalSheet | null>(null);
  const [co, setCo] = useState<CompanyInput>(DEFAULT_COMPANY);
  const [perfEok, setPerfEok] = useState("");
  const [creditMsg, setCreditMsg] = useState("");
  const [bizno, setBizno] = useState("");
  const [corpMsg, setCorpMsg] = useState("");
  const [corp, setCorp] = useState<CorpLookup | null>(null);
  const [corpLoading, setCorpLoading] = useState(false);
  /** 사업자번호 조회가 끝난 번호: 이때만 낙찰 이력을 조회한다 */
  const [perfBizno, setPerfBizno] = useState("");
  const [autoPerf, setAutoPerf] = useState<PerfSummary>({ amount: 0, count: 0 });
  const [manualPerf, setManualPerf] = useState(0);
  const [auto, setAuto] = useState<Partial<Record<FactKey, AutoFact>>>({});
  /** 신뢰도 가감점 항목 중 API로 확인한 것 */
  const [trustAuto, setTrustAuto] = useState<Record<string, TrustAuto>>({});
  const onPerf = useCallback((s: PerfSummary) => setAutoPerf((p) => (p.amount === s.amount && p.count === s.count ? p : s)), []);

  const pickedBid: Bid | undefined = useMemo(() => {
    if (!bids) return undefined;
    // 미리 고르지 않는다: 사용자가 검색해서 고른 공고(또는 공고 상세에서 넘어온 공고)만 쓴다
    return bidId ? bids.find((b) => b.id === bidId) : undefined;
  }, [bids, bidId]);
  // 무료 체험: 공개 경쟁 공고를 고르면 1건 차감(이미 분석한 공고는 그대로). 3건을 넘으면 분석을 열지 않는다
  const trialKey = pickedBid && methodProfile(pickedBid).open ? `nara:${pickedBid.id}` : null;
  const trial = useTrial(trialKey, pickedBid?.title);
  const trialLocked = !!pickedBid && trial?.status === "locked";
  const bid: Bid | undefined = trialLocked || (trialKey && !trial) ? undefined : pickedBid;
  const pickTrial = (e: TrialEntry) => { if (e.k.startsWith("nara:")) setBidId(e.k.slice(5)); else window.location.href = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/premium/apt?apt=${encodeURIComponent(e.k.slice(4))}`; };
  // 사업자번호를 조회했으면 그 번호로 쓴 체험 건수도 중계 서버에서 맞춘다 (다른 브라우저에서 쓴 공고 포함)
  // 가입한 사업자번호가 있으면 조회 전에도 그 번호로 센다. 조회 칸에도 미리 넣어 둔다
  const [memberNo, setMemberNo] = useState<string | undefined>();
  useEffect(() => {
    const m = readMember();
    if (!m) return;
    setMemberNo(m.bizno);
    setBizno((v) => v || `${m.bizno.slice(0, 3)}-${m.bizno.slice(3, 5)}-${m.bizno.slice(5)}`);
  }, []);
  const corpNo = corp?.bizno ?? memberNo;
  useEffect(() => {
    if (STATIC && CORP_API && corpNo && trialKey && trial?.status === "ok") syncTrialServer(CORP_API, corpNo, trialKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpNo, trialKey]);

  // 수의시담·지명경쟁처럼 정해진 업체만 참가하는 공고는 평가점수를 예측하지 않는다
  const profile = useMemo(() => (bid ? methodProfile(bid) : undefined), [bid]);
  const closedBid = !!profile && !profile.open;

  // 공고를 고르면 첨부 목록과, 첨부에서 미리 추출해 둔 평가표를 불러온다 (없으면 표준 평가표)
  const [docs, setDocs] = useState<BidDocs | null>(null);
  const [aiRead, setAiRead] = useState<AiRead>("idle");
  // 공고의 낙찰방법 세부·낙찰하한율·추정가격으로 그 공고에 맞는 기준표를 고른다
  const basis = docs?.qual?.basis;
  const template = useMemo(() => (bid ? templateSheet(bid, basis) : null), [bid, basis]);
  // 이 공고의 평가표: 공고 원문 배점표 > 공고서에 적힌 기준(통과점수·적용 기준·하한율·기준비율·실적 인정 범위) > 기준표
  const bidCriteria = useMemo(() => (bid && docs ? bidSheet(bid, basis, { extracted: docs.sheet, notice: docs.notice, quant: docs.quant }) : null), [bid, docs, basis]);
  const active = sheet ?? bidCriteria ?? template;
  // 공고서에 경영상태 기준비율이 있으면 입력 칸 기본값으로 쓴다
  const finBase = active?.financeBase;
  useEffect(() => {
    if (!finBase) return;
    setCo((c) => ({ ...c, equityBase: finBase.equity ?? c.equityBase, currentBase: finBase.current ?? c.currentBase }));
  }, [finBase]);
  // 투찰률 기본값이 이 공고의 낙찰하한율보다 낮으면 기준표의 기준 투찰률(가격 만점 지점)로 옮긴다
  const floorRate = active?.lowerLimit;
  const baseRate = active?.price?.base;
  useEffect(() => {
    if (floorRate === undefined) return;
    setCo((c) => (c.bidRate < floorRate ? { ...c, bidRate: Math.max(floorRate, baseRate ?? floorRate) } : c));
  }, [floorRate, baseRate]);
  const [validation, setValidation] = useState<Validation | null>(null);
  useEffect(() => {
    let alive = true;
    loadValidation().then((v) => alive && setValidation(v)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!bid) return;
    let alive = true;
    setDocs(null);
    setSheet(null);
    setAiRead("idle");
    if (!methodProfile(bid).open) return;
    loadBidDocs(bid)
      .then((d) => {
        if (!alive) return;
        setDocs(d);
        // 원문 배점표를 쓸 수 없으면 그 자리에서 읽는다: 판독 입력이 있으면 그 본문으로, 빌드가 첨부를 다 읽지 못했으면 중계 서버가 첨부를 받아서
        if (!STATIC || !CORP_API || (d.sheet && adoptable(d.sheet, d.qual?.basis))) return;
        if (!d.ai && (d.read || !d.files.length)) return;
        setAiRead("reading");
        loadAiSheet(bid)
          .then((s) => {
            if (!alive) return;
            if (s) { setDocs({ ...d, sheet: s, sheetFile: undefined }); setAiRead("done"); } else setAiRead("none");
          })
          .catch(() => alive && setAiRead("fail"));
      })
      .catch(() => alive && setDocs({ files: [] }));
    return () => { alive = false; };
  }, [bid]);

  // 전년도 낙찰률 통계: 고른 공고와 같은 업무·계약방법·금액대의 평균을 예상 최저 경쟁 투찰률 기본값으로 쓴다
  const [awardStats, setAwardStats] = useState<AwardStats | null>(null);
  useEffect(() => {
    let alive = true;
    loadAwardStats().then((s) => alive && setAwardStats(s)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const rivalEst = useMemo(() => (bid ? estimateRival(awardStats, bid) : undefined), [awardStats, bid]);

  // 낙찰 결과 분석 (전년도 같은 사업, 과거 같은 사업 추이, 비슷한 공고): 가격점수 기본값·경쟁 강도·낙찰 가능성에 반영한다
  const [analysis, setAnalysis] = useState<AwardAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  useEffect(() => {
    if (!bid) return;
    let alive = true;
    setAnalysis(null);
    setAnalysisLoading(true);
    loadAwardAnalysis(bid.id)
      .then((a) => confirmRelated(bid, a))
      .then((a) => alive && setAnalysis(a))
      .catch(() => undefined)
      .finally(() => alive && setAnalysisLoading(false));
    return () => { alive = false; };
  }, [bid]);
  const fc = useMemo(() => (bid ? forecast(analysis, bid, floorRate) : {}), [analysis, bid, floorRate]);
  // 협상: 예상 최저 경쟁 투찰률 = 과거 같은 사업·비슷한 공고의 개찰 1위 투찰률 > 같은 기관 유사 공고·같은 조건 평균 낙찰률 > 기본값
  const rivalDefault = fc.rival?.value ?? rivalEst?.rate;
  useEffect(() => {
    setCo((c) => ({ ...c, rivalRate: rivalDefault ? Math.min(100, Math.max(80, Math.round(rivalDefault * 100) / 100)) : DEFAULT_COMPANY.rivalRate }));
  }, [rivalDefault]);
  // 적격: 투찰률 기본값 = 이 공고 하한율 + 과거 낙찰자가 하한율보다 높게 쓴 폭 (중앙값)
  const suggestRate = fc.suggestRate?.value;
  useEffect(() => {
    if (suggestRate === undefined) return;
    setCo((c) => ({ ...c, bidRate: Math.min(100, Math.round(Math.max(floorRate ?? 0, suggestRate) * 1000) / 1000) }));
  }, [suggestRate, floorRate]);

  // 실적 = 나라장터에서 찾은 유사 낙찰(추정) + 직접 입력(수의계약·민간·하도급 등)
  const coEff = useMemo<CompanyInput>(() => ({
    ...co,
    pastPerformance: autoPerf.amount + manualPerf,
    perfSource: autoPerf.count ? `나라장터 낙찰 ${autoPerf.count}건 추정${manualPerf ? " + 직접 입력" : ""}` : undefined,
  }), [co, autoPerf, manualPerf]);
  // 공동수급 구성원 (적격심사·공동도급 허용 공고): 실적 합산, 신용·경영상태 지분율 가중
  const [members, setMembers] = useState<JointMember[]>([]);
  useEffect(() => { setMembers([]); }, [bidId]);
  const jointOk = !!bid?.jointContract && active?.method === "적격심사";
  const result = useMemo(() => (active && bid ? (jointOk && members.length ? jointPredict(active, bid, coEff, members) : predict(active, bid, coEff)) : null), [active, bid, coEff, jointOk, members]);
  const chance = useMemo(() => {
    if (!bid || !analysis || !result) return undefined;
    const price = result.items.find((i) => i.kind === "price");
    return winChance({
      method: bid.contractMethod, fc, similar: analysis.similar?.stat, history: analysis.history, bidRate: co.bidRate,
      floor: active?.lowerLimit ?? bid.lowerLimitRate, passed: result.passed, proposal: co.proposal, priceRatio: price ? price.ratio : undefined,
    });
  }, [bid, analysis, result, fc, co.bidRate, co.proposal, active]);
  // 참가자격 판정: 사업자번호를 조회하고 공고 자료가 오면 판정한다. 불가면 예상 점수 대신 사유를 보여 준다
  const eligibility = useMemo(() => (corp && docs && bid ? judgeEligibility(docs.qual, corp, bid.bizType ?? "용역", new Date(), { itemNo: bid.cls?.no, itemName: bid.cls?.nm, smallBizOnly: bid.smallBizOnly }) : null), [corp, docs, bid]);
  /** 예상 점수를 보여 줄 단계: 조회 기능이 없는 미리보기는 직접 입력값으로 바로 계산한다 */
  const scoreStage: "criteria" | "checking" | "blocked" | "score" = !CORP_API
    ? "score"
    : !corp ? "criteria" : !eligibility ? "checking" : eligibility.verdict === "불가" ? "blocked" : "score";
  /** 이 평가표가 쓰는 업체 자료만 입력 칸을 보여 준다 */
  const needs = useMemo(() => {
    const it = active?.items ?? [];
    return {
      smallFirm: it.some((i) => i.smallFirmFull || i.kind === "performance"),
      credit: it.some((i) => i.kind === "credit"),
      capability: it.some((i) => i.kind === "capability"),
      techGrade: it.some((i) => i.kind === "techGrade"),
      finance: it.some((i) => i.kind === "finance"),
    };
  }, [active]);
  const sheetPeriod = useMemo(() => active
    ? sheetPerfPeriod(active.items.filter((i) => i.kind === "performance").flatMap((i) => [i.label, i.basis ?? "", ...(i.recognition ?? [])]), active.recognition ?? [])
    : undefined, [active]);

  const { matches, matchTotal } = useMemo(() => {
    if (!bids || !query.trim()) return { matches: [], matchTotal: 0 };
    const q = query.trim().toLowerCase();
    const all = bids.filter((b) => b.title.toLowerCase().includes(q) || b.agency.includes(q) || b.bidNtceNo.toLowerCase().includes(q));
    return { matches: all.slice(0, MAX_MATCHES), matchTotal: all.length };
  }, [bids, query]);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setCo((c) => ({ ...c, [k]: v }));

  async function onCreditFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setCreditMsg("읽는 중…");
    try {
      const d = await readDocument(f);
      const g = findCreditGrade(d.text);
      if (g) {
        set("creditGrade", g);
        setAuto((a) => ({ ...a, creditGrade: { value: g, from: `서류 '${f.name}'` } }));
        setCreditMsg(`${f.name}에서 신용평가등급 ${g}를 확인했습니다.`);
      }
      else setCreditMsg("문서에서 등급을 찾지 못했습니다. 아래에서 직접 선택해 주세요.");
    } catch (e) {
      setCreditMsg(e instanceof UnsupportedDocError ? e.message : "파일을 읽지 못했습니다.");
    }
  }

  async function lookup() {
    const no = normalizeBizno(bizno);
    if (!validBizno(no)) { setCorpMsg("올바른 사업자등록번호가 아닙니다. 숫자를 다시 확인해 주세요."); return; }
    setCorpLoading(true);
    setCorp(null);
    setTrustAuto({});
    setPerfBizno("");
    setAutoPerf({ amount: 0, count: 0 });
    setCorpMsg("국세청·나라장터·금융위원회 정보를 조회하는 중…");
    try {
      const r = await fetch(`${CORP_API}?bizno=${no}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const c = j as CorpLookup;
      setCorp(c);
      if (PERF_API && (c.corpName || c.nts?.registered)) setPerfBizno(c.bizno);
      // 공공데이터로 얻을 수 있는 값을 1차로 채운다. 고객이 증빙 기준으로 고치면 '수정됨'으로 표시한다
      const opened = c.nara?.openedAt ?? c.fsc?.establishedAt ?? c.openedAt;
      const fin = c.finance.find((f) => f.equity !== undefined && f.assets);
      const equityRatio = fin && fin.assets ? Math.round(((fin.equity ?? 0) / fin.assets) * 1000) / 10 : undefined;
      const facts: Partial<Record<FactKey, AutoFact>> = {};
      if (opened) facts.years = { value: yearsSince(opened), from: `${c.nara?.openedAt ? "나라장터 개업일" : "금융위원회 설립일"} ${opened.slice(0, 10)}` };
      if (c.employees !== undefined) facts.employees = { value: c.employees, from: c.nara?.employees !== undefined ? "나라장터 조달업체 정보" : "금융위원회 기업기본정보" };
      if (equityRatio !== undefined && fin) facts.equityRatio = { value: equityRatio, from: `금융위원회 ${fin.year} ${fin.basis} 재무제표` };
      setAuto(facts);
      const ta = trustFromCorp(c);
      setTrustAuto(ta);
      setCo((prev) => ({
        ...prev,
        trustItems: applyTrustAuto(prev.trustItems ?? [], ta),
        corpName: c.corpName ?? prev.corpName,
        bizno: c.bizno,
        years: facts.years ? Number(facts.years.value) : prev.years,
        employees: facts.employees ? Number(facts.employees.value) : prev.employees,
        equityRatio: facts.equityRatio ? Number(facts.equityRatio.value) : prev.equityRatio,
      }));
      const filled = [facts.years && "업력", facts.employees && "종업원 수", facts.equityRatio && "자기자본비율", Object.keys(ta).length && "신뢰도 가감점 일부 항목"].filter(Boolean);
      setCorpMsg(c.corpName || c.nts?.registered
        ? filled.length ? `${filled.join("·")}를 공공데이터 조회 결과로 1차로 채웠습니다. 증빙 서류와 다르면 고쳐 주세요.` : "조회 결과에 업력·종업원 수가 없어 직접 입력해 주세요."
        : "조회된 기업 정보가 없습니다. 번호를 확인하거나 직접 입력해 주세요.");
    } catch (e) {
      setCorpMsg((e as Error).message || "조회에 실패했습니다.");
    } finally {
      setCorpLoading(false);
    }
  }

  function editItem(id: string, patch: Partial<EvalItem>) {
    if (!active) return;
    setSheet({ ...active, source: active.source, items: active.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }
  function removeItem(id: string) {
    if (!active) return;
    setSheet({ ...active, items: active.items.filter((i) => i.id !== id) });
  }

  const searchBox = (
          <div className={`relative ${bid ? "mt-3" : "mt-4"}`}>
            <input className="input" placeholder={bid ? "다른 공고 찾기: 공고명·기관명·공고번호" : "공고명·기관명·공고번호로 검색"} value={query} onChange={(e) => setQuery(e.target.value)} />
            {matches.length > 0 && (
              <div className="card absolute inset-x-0 top-full z-20 mt-1 overflow-hidden">
                <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500">
                  {matchTotal > matches.length
                    ? `검색 결과 ${matchTotal.toLocaleString("ko-KR")}건 중 ${matches.length}건 표시 · 검색어를 더 입력하면 좁혀집니다`
                    : `검색 결과 ${matchTotal.toLocaleString("ko-KR")}건`}
                </p>
                <ul className="max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain p-1">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-paper" onClick={() => { setBidId(m.id); setQuery(""); }}>
                        <span className="line-clamp-2 font-semibold sm:line-clamp-1"><CloseDdayBadge iso={m.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={m.closeAt} />{m.title}</span>
                        <span className="text-xs text-ink-500">{m.agency} · {m.contractMethod} · {won(m.baseAmount)}{closedLabel(m) && <span className="text-coral"> · {closedLabel(m)}</span>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
  );

  if (error) return <p className="card p-6 text-sm text-coral">공고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>;
  if (!bids) return <p className="card p-6 text-sm text-ink-300">공고 목록을 불러오는 중…</p>;

  // 정해진 업체만 참가하는 공고: 평가표·점수 대신 까닭과 낙찰 방식을 보여 준다
  if (bid && profile && closedBid) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">{bid.bizType ?? "용역"} · {bid.category} · {bid.contractType ?? "계약방법 미상"} · {bid.awardRaw ?? bid.contractMethod} · 공고번호 {bid.bidNtceNo}</p>
            <p className="mt-1 font-bold leading-snug"><CloseDay iso={bid.closeAt} />{bid.title}</p>
            <p className="mt-1 text-sm text-ink-500">{bid.agency} · 기초금액 {won(bid.baseAmount)}</p>
          </div>
          {searchBox}
        </section>
        <aside className="card min-w-0 p-6">
          <p className="font-bold text-coral">평가점수 예측 대상이 아닌 공고</p>
          <p className="mt-2 text-sm text-ink-700">{profile.closedReason}입니다. 나라장터도 이런 공고는 정보공개 차원에서 올리는 것이며 계약대상자가 아닌 업체는 참가할 수 없다고 안내합니다.</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div><dt className="text-xs text-ink-500">참가할 수 있는 업체</dt><dd>{profile.who}</dd></div>
            <div><dt className="text-xs text-ink-500">낙찰자 결정</dt><dd>{profile.decide}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-ink-500">공개 경쟁 공고(일반·제한경쟁, 소액수의견적)를 골라 주세요.</p>
        </aside>
      </div>
    );
  }

  // 무료 체험 3건을 다 쓴 뒤 새 공고를 고른 경우
  if (trialLocked && pickedBid && trial) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">{pickedBid.bizType ?? "용역"} · {pickedBid.category} · {pickedBid.contractMethod} · 공고번호 {pickedBid.bidNtceNo}</p>
            <p className="mt-1 font-bold leading-snug"><CloseDdayBadge iso={pickedBid.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={pickedBid.closeAt} />{pickedBid.title}</p>
            <p className="mt-1 text-sm text-ink-500">{pickedBid.agency} · 기초금액 {won(pickedBid.baseAmount)}</p>
          </div>
          {searchBox}
        </section>
        <TrialLocked used={trial.used} onPick={pickTrial} />
      </div>
    );
  }

  // 공고를 고르기 전: 검색만 보이고, 결과 자리에는 안내만 둔다
  if (!bid || !active || !result) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="card min-w-0 p-6">
          <Step n={1} title="공고 선택" />
          <p className="mt-2 text-sm text-ink-500">분석할 공고를 검색해 고르세요. 고른 공고의 첨부파일에서 평가기준을 확인해 평가표를 바로 적용합니다.</p>
          {searchBox}
          <TrialIntro />
        </section>
        <aside className="card grid min-h-[12rem] min-w-0 place-items-center p-6 text-center">
          <div>
            <p className="font-bold">평가 기준</p>
            <p className="mt-2 text-sm text-ink-500">공고를 고르면 평가항목과 배점이 나옵니다. 사업자번호를 조회하면 참가자격을 확인하고 예상 평가점수를 계산합니다.</p>
          </div>
        </aside>
      </div>
    );
  }

  const isNego = active.method === "협상에 의한 계약" || active.method === "종합심사";

  return (
    <div className="space-y-6">
    {/* 입력과 결과: 결과 패널은 스크롤을 따라다니지 않고 제자리에 둔다 */}
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="min-w-0 space-y-6">
        {/* 1. 공고 */}
        <section className="card p-6">
          <Step n={1} title="공고 선택" />
          <div className="mt-4 rounded-2xl bg-paper p-4">
            <p className="text-xs text-ink-500">{bid.bizType ?? "용역"} · {bid.category} · {bid.contractMethod} · 공고번호 {bid.bidNtceNo}</p>
            <p className="mt-1 font-bold leading-snug"><CloseDdayBadge iso={bid.closeAt} className="mr-1.5 align-[1px]" /><CloseDay iso={bid.closeAt} />{bid.title}</p>
            <p className="mt-1 text-sm text-ink-500">{bid.agency} · 기초금액 {won(bid.baseAmount)}{bid.lowerLimitRate ? ` · 낙찰하한율 ${bid.lowerLimitRate}%` : ""}</p>
          </div>
          <TrialNote state={trial} />
          {searchBox}
          {/* 고른 공고의 첨부파일을 자동으로 확인해 평가표를 적용한다 (첨부가 없으면 표시하지 않는다) */}
          {(!docs || docs.sheet || docs.files.length > 0) && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            {!docs ? (
              <p className="text-sm text-ink-300">첨부파일 확인 중…</p>
            ) : (
              <>
                {aiRead === "reading" ? (
                  <div className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-500">
                    <p>공고 첨부의 배점표를 읽고 있습니다. 처음 읽는 공고는 첨부를 모두 받아 읽느라 10초~1분 걸립니다. 그동안은 기준표로 계산합니다.</p>
                    <LoadingBar label="배점표 판독 중" />
                  </div>
                ) : (docs.sheet || docs.files.length > 0) && (
                  <p className={`rounded-xl px-3 py-2 text-sm ${docs.sheet ? "bg-mint-50 text-mint-700" : "bg-paper text-ink-500"}`}>
                    {docs.sheet?.reader?.by === "ai"
                      ? `공고 첨부의 배점표에서 평가항목 ${docs.sheet.items.length}개를 읽었습니다. 원문 문구와 배점 합계 확인을 통과해 원문 배점으로 계산합니다.`
                      : docs.sheet && !docs.sheetFile
                        ? `공고 첨부에서 평가항목 ${docs.sheet.items.length}개를 읽어 원문 배점으로 계산합니다.`
                      : docs.sheet
                        ? `첨부 '${docs.sheetFile}'에서 평가항목 ${docs.sheet.items.length}개를 읽어 원문 배점으로 계산합니다.`
                        : `이 공고의 첨부에서 평가 배점표를 ${aiRead === "fail" ? "읽지 못했습니다(판독 일시 오류)" : "찾지 못했습니다"}. 공고의 낙찰방법·금액에 맞는 기준표(${template?.criteria?.name ?? bid.contractMethod})로 계산합니다.`}
                  </p>
                )}
                {docs.files.length > 0 && (
                  <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {docs.files.map((f) => (
                      <li key={f.url} className="min-w-0">
                        <a href={f.url} target="_blank" rel="noreferrer" className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-ink-100/60 ${f.name === docs.sheetFile ? "bg-mint-50 font-semibold" : "bg-paper"}`}>
                          <span className="min-w-0 truncate">{f.name}</span>
                          <span className="shrink-0 text-xs text-ink-300">{f.name === docs.sheetFile ? "평가표 출처" : f.kind}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          )}
        </section>

        {/* 2. 기업 정보 */}
        <section className="card p-6">
          <Step n={2} title="기업 정보와 신용평가 서류" />
          <div className="mt-4 grid gap-x-3 gap-y-4 sm:grid-cols-3">
            <div className="min-w-0 sm:col-span-3">
              <span className="label">사업자등록번호</span>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
                <input className="input" inputMode="numeric" placeholder="000-00-00000" value={bizno} onChange={(e) => setBizno(e.target.value)} />
                <button className="btn-primary btn-sm shrink-0" disabled={!CORP_API || corpLoading || normalizeBizno(bizno).length !== 10}>{corpLoading ? "조회 중" : "조회"}</button>
              </form>
              {corpLoading ? <LoadingBar label="국세청·나라장터·금융위원회 기업 정보를 조회하는 중" /> : <p className="mt-1 text-xs text-ink-500">
                {corpMsg || (CORP_API
                  ? "국세청 사업자 상태, 나라장터 조달업체 등록 정보, 금융위원회 기업기본정보·재무정보를 한 번에 조회합니다."
                  : "공개 미리보기에서는 직접 입력합니다.")}
              </p>}
              {corp && <EligibilityPanel result={eligibility} />}
              {corp && <CorpPanel corp={corp} />}
              {perfBizno && <PerfLookup api={PERF_API} bid={bid} bizno={perfBizno} since={corp?.nara?.registeredAt} sheetPeriod={sheetPeriod} onChange={onPerf} />}
            </div>
            <p className="text-xs leading-relaxed text-ink-500 sm:col-span-3">
              값마다 출처를 표시합니다. <b className="text-mint-700">자동</b>은 공공데이터로 1차로 채운 값, <b className="text-ink">수정됨</b>은 고객이 증빙 서류 기준으로 고친 값, <b className="text-ink">직접 입력</b>은 공공데이터에 없어 고객이 넣는 값입니다. 심사에서는 증빙 서류 값이 기준입니다.
            </p>
            <Num label="업력 (년)" value={co.years} onChange={(v) => set("years", v)} tag={<FactTag auto={auto.years} current={co.years} onReset={(v) => set("years", Number(v))} />} hint={EVIDENCE.years} />
            <Num label="종업원 수 (명)" value={co.employees} onChange={(v) => set("employees", v)} tag={<FactTag auto={auto.employees} current={co.employees} onReset={(v) => set("employees", Number(v))} />} hint={EVIDENCE.employees} />
            <Num label="분야 기술인력 (명)" value={co.techStaff} onChange={(v) => set("techStaff", v)} tag={<FactTag />} hint={EVIDENCE.techStaff} />
            <div>
              <span className="label flex flex-wrap items-center gap-1.5">{perfBizno ? "직접 추가 실적 (억원)" : "유사 실적 합계 (억원)"} <FactTag /></span>
              <input className="input" inputMode="decimal" placeholder="예: 6.5" value={perfEok} onChange={(e) => { setPerfEok(e.target.value); setManualPerf(Math.round((Number(e.target.value) || 0) * 1e8)); }} />
              <p className="mt-1 text-xs text-ink-500">{perfBizno ? "자동 조회에 없는 실적: 수의계약·민간·하도급, 조회 기간 이전 실적. " : ""}증빙: {EVIDENCE.perf}</p>
            </div>
            {needs.credit && <div className="sm:col-span-2">
              <span className="label flex flex-wrap items-center gap-1.5">신용평가등급 <FactTag auto={auto.creditGrade} current={co.creditGrade} onReset={(v) => set("creditGrade", v as CreditGrade)} /></span>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto" value={co.creditGrade} onChange={(e) => set("creditGrade", e.target.value as CreditGrade | "없음")}>
                  {CREDIT_GRADES.map((g) => <option key={g}>{g}</option>)}
                  <option value="없음">없음 (미제출)</option>
                </select>
                <label className="btn-ghost btn-sm cursor-pointer">
                  신용평가등급확인서로 읽기
                  <input type="file" accept=".pdf,.hwpx,.docx,.txt" className="sr-only" onChange={(e) => { onCreditFile(e.target.files); e.target.value = ""; }} />
                </label>
              </div>
              <p className="mt-1 text-xs text-ink-500">{creditMsg || "신용평가등급은 공공데이터로 제공되지 않아 확인서에서 읽거나 직접 고릅니다."} 증빙: {EVIDENCE.creditGrade}</p>
            </div>}
            {needs.smallFirm && (
              <label className="flex items-start gap-2 text-sm sm:col-span-3">
                <input type="checkbox" className="mt-1" checked={co.smallFirm} onChange={(e) => set("smallFirm", e.target.checked)} />
                <span>
                  <span className="flex flex-wrap items-center gap-1.5 font-semibold">창업기업·소기업·소상공인 <FactTag /></span>
                  <span className="block text-xs text-ink-500">
                    {corp?.fsc?.smallBusiness !== undefined ? `금융위원회 기업기본정보: ${corp.fsc.smallBusiness ? "중소기업" : "중소기업 아님"} (소기업 여부는 확인서로 판단). ` : ""}
                    물품 고시금액 미만은 신용평가 만점, 일반용역 실적 인정기간 7년. 증빙: {EVIDENCE.smallFirm}
                  </span>
                </span>
              </label>
            )}
            {needs.capability && <Num label="사업수행능력 평가점수 (0~100)" value={co.pqScore} onChange={(v) => set("pqScore", Math.min(100, v))} tag={<FactTag />} hint={EVIDENCE.pqScore} />}
            {needs.techGrade && (
              <div>
                <span className="label flex flex-wrap items-center gap-1.5">기술등급 <FactTag /></span>
                <select className="input" value={co.techGrade} onChange={(e) => set("techGrade", e.target.value)}>
                  {TECH_GRADES.map((g) => <option key={g}>{g}</option>)}
                </select>
                <p className="mt-1 text-xs text-ink-500">확인서가 없으면 최저등급(T8). 증빙: {EVIDENCE.techGrade}</p>
              </div>
            )}
            {needs.finance && (<>
              <Num label="자기자본비율 (%)" value={co.equityRatio ?? 0} onChange={(v) => set("equityRatio", v)} tag={<FactTag auto={auto.equityRatio} current={co.equityRatio ?? 0} onReset={(v) => set("equityRatio", Number(v))} />} hint={EVIDENCE.equityRatio} />
              <Num label="유동비율 (%)" value={co.currentRatio ?? 0} onChange={(v) => set("currentRatio", v)} tag={<FactTag />} hint={`공시 요약재무제표에 유동자산·부채가 없어 직접 입력. 증빙: ${EVIDENCE.currentRatio}`} />
              <div className="grid grid-cols-2 gap-3">
                <Num label="기준 자기자본비율" value={co.equityBase} onChange={(v) => set("equityBase", v)} />
                <Num label="기준 유동비율" value={co.currentBase} onChange={(v) => set("currentBase", v)} />
                <p className="col-span-2 -mt-2 text-xs text-ink-500">공고서에 적힌 기준비율(한국은행 기업경영분석)을 넣으세요. 기본값은 추정입니다.</p>
              </div>
            </>)}
            <div>
              <span className="label">제안서 준비 수준</span>
              <div className="flex gap-2">
                {(["상", "중", "하"] as Level[]).map((l) => (
                  <button key={l} type="button" onClick={() => set("proposal", l)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${co.proposal === l ? "border-ink bg-ink text-white" : "border-ink-100 bg-white text-ink-500"}`}>{l}</button>
                ))}
              </div>
            </div>
            {jointOk && <div className="min-w-0 sm:col-span-3"><JointMembers members={members} onChange={setMembers} ourPerf={coEff.pastPerformance} showFinance={needs.finance} /></div>}
            <TrustPicker rule={result?.trust?.rule ?? active?.trust} selected={co.trustItems ?? []} onChange={(ids) => set("trustItems", ids)} score={result?.trust} auto={trustAuto} checked={!!corp} />
            <Range
              label="투찰률 (예정가격 대비)"
              value={co.bidRate}
              onChange={(v) => set("bidRate", v)}
              base={bid?.baseAmount ?? 0}
              hint={!isNego && fc.suggestRate
                ? `기본값 = 과거 낙찰자 투찰률 (낙찰 결과 분석). ${fc.suggestRate.basis}. 가운데 절반 ${fc.suggestRate.low}~${fc.suggestRate.high}%.`
                : !isNego && rivalEst ? `참고: ${rivalBasis(rivalEst)}입니다.` : undefined}
            />
            {isNego && (
              <Range
                label="예상 최저 경쟁 투찰률"
                value={co.rivalRate}
                onChange={(v) => set("rivalRate", v)}
                base={bid?.baseAmount ?? 0}
                hint={fc.rival
                  ? `기본값 = ${fc.rival.basis} (낙찰 결과 분석). 슬라이더로 바꿀 수 있습니다.`
                  : rivalEst
                  ? `기본값 = ${rivalBasis(rivalEst)}${!rivalEst.prior && awardStats && awardStats.coverage.weeks < awardStats.coverage.totalWeeks ? ` (연간 ${awardStats.coverage.totalWeeks}주 중 ${awardStats.coverage.weeks}주 자료)` : ""}. 슬라이더로 바꿀 수 있습니다.`
                  : `같은 수요기관의 과거 유사 공고가 없고 같은 조건 낙찰 표본도 ${MIN_SAMPLES}건 미만이라 기본값 ${DEFAULT_COMPANY.rivalRate}%를 씁니다. 슬라이더로 바꿀 수 있습니다.`}
              />
            )}
          </div>
        </section>
      </div>

      {/* 결과: 사업자번호 조회 전에는 평가 기준만, 조회 후 참가 가능하면 예상 점수, 불가면 사유 */}
      <aside className="min-w-0 lg:self-start">
        {scoreStage === "criteria" && <CriteriaPanel sheet={active} passLabel={result.passLabel} />}
        {scoreStage === "checking" && (
          <section className="card p-6">
            <p className="font-bold">참가자격 확인 중</p>
            <p className="mt-2 text-sm text-ink-500">공고의 업종·지역 제한과 조회한 기업 정보를 대조하고 있습니다. 끝나면 예상 평가점수가 나옵니다.</p>
          </section>
        )}
        {scoreStage === "blocked" && eligibility && <BlockedPanel result={eligibility} corpName={corp?.corpName} />}
        {scoreStage === "score" && (<>
        {eligibility?.verdict === "확인 필요" && <ReviewNotice result={eligibility} />}
          <section className="overflow-hidden rounded-3xl bg-ink-900 text-white shadow-lift">
            <div className="p-6">
              <p className="text-sm text-ink-300">예상 평가점수</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-6xl font-extrabold tabular-nums tracking-tight">{result.total}<span className="text-xl text-ink-300">/{result.max}</span></p>
                {result.passed !== undefined ? (
                  <span className={`rounded-lg px-3 py-1.5 text-sm font-bold ${result.passed ? "bg-mint text-white" : "bg-coral text-white"}`}>
                    {result.passed ? "통과 예상" : "미달 예상"}
                  </span>
                ) : result.pending > 0 && result.passLabel && (
                  <span className="rounded-lg bg-amber px-3 py-1.5 text-sm font-bold text-ink">확인 필요</span>
                )}
              </div>
              {result.pending > 0 && (
                <p className="mt-2 text-sm text-amber">확인 필요 항목 {result.pending}점 제외 · 그 항목까지 받으면 최대 {Math.round((result.total + result.pending) * 10) / 10}점</p>
              )}
              {result.passLabel && (
                <p className="mt-2 text-sm text-ink-300">
                  기준 {result.passLabel}{result.gap !== undefined && ` · ${result.gap >= 0 ? `${result.gap}점 여유` : `${Math.abs(result.gap)}점 부족`}`}
                </p>
              )}
              {isNego && <p className="mt-1 text-sm text-ink-300">기술 {result.techScore}/{result.techMax} · 가격 {Math.round((result.total - result.techScore) * 10) / 10}</p>}
              {result.rateWindow && <PassAmount bid={bid} window={result.rateWindow} info={docs?.qual?.info} analysis={analysis} />}
            </div>
            <ul className="space-y-4 border-t border-white/10 p-6">
              {result.items.map((i) => (
                <li key={i.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="font-semibold">{i.label}</span>
                    <span className="tabular-nums text-xs text-ink-300">
                      현재: {i.unknown ? <b className="text-sm text-amber">확인 필요</b> : <b className="text-sm text-white">{i.score}점</b>}
                      <span className="mx-1.5 text-white/30">|</span>
                      공고 평가항목 기준: {i.max > 0 ? `총 ${i.max}점 만점` : "가·감점 항목"}
                    </span>
                  </div>
                  {i.max > 0 && !i.unknown && <ScoreBar value={Math.max(0, i.score)} max={i.max} />}
                  <p className="mt-1 text-xs text-ink-300">
                    {i.unknown ? `확인 필요: ${i.reason}` : <>{i.max > 0 && i.score >= i.max ? "만점 기준" : "산정 기준"}: {i.reason}{i.max > 0 ? ` ${pct(i.score, i.max)}%` : ""}</>}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {active.method === "적격심사" && <PerfCapCard sheet={active} bid={bid} co={jointOk && members.length ? { ...coEff, pastPerformance: coEff.pastPerformance + members.reduce((a, m) => a + m.perf, 0) } : coEff} />}
          {result.tips.length > 0 && (
            <section className="card mt-4 p-6">
              <h3 className="font-bold">점수를 올릴 수 있는 곳</h3>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed">
                {result.tips.map((t, n) => (
                  <li key={t} className="flex gap-2"><span className="font-bold text-mint-600 tabular-nums">{n + 1}</span>{t}</li>
                ))}
              </ol>
            </section>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-300">
            {active.source === "extracted" && active.items.some((i) => i.bands || i.recognition || i.criteria) || active.scale
              ? "점수 구간·서류 인정 범위·정성 등급은 공고 첨부에서 읽은 기준을 적용했습니다. 정성평가는 위원이 제안서와 발표를 보고 매기므로, 제안 준비 수준으로 고른 등급은 예상치입니다. 실제로 인정되는 서류는 제출 전 공고 원문으로 확인하세요."
              : "예측값은 평가표와 입력한 기업 정보로 계산한 추정치입니다. 공고 첨부에서 세부기준을 읽지 못한 항목은 기준표 규칙으로 계산했고, 정성평가는 위원 판단에 따라 달라집니다."}
            {active.criteria && ` 적용 기준표: ${active.criteria.name} (${active.criteria.status}).`}
          </p>
          {validation && <ValidationNote v={validation} />}
        </>)}
        {(scoreStage === "criteria" || scoreStage === "score") && (
          <ForecastCard fc={fc} chance={scoreStage === "score" ? chance : undefined} isNego={isNego} bidRate={co.bidRate} baseAmount={bid.baseAmount} analysis={analysis} />
        )}
      </aside>
    </div>

    {/* 평가표 (전체 폭) */}
    <section className="card min-w-0 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{active.title}</h3>
          <div className="flex items-center gap-2">
            <span className="chip">{active.source === "extracted" ? `공고 원문 배점 · 신뢰도 ${active.confidence}` : active.noticeFacts?.length ? `기준표 + 공고서 기준 ${active.noticeFacts.length}가지` : "기준표"}</span>
            {sheet && <button type="button" className="text-xs font-semibold text-ink-500 hover:text-ink" onClick={() => setSheet(null)}>공고 기준으로 되돌리기</button>}
          </div>
        </div>
        {active.reader?.by === "ai" && <AiReadNote />}
        <NoticeFacts sheet={active} />
        <CriteriaInfo sheet={active} />
        <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {active.items.map((i) => (
            <li key={i.id} className="min-w-0 rounded-2xl border border-ink-100 px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-semibold">{i.label}</p>
                  <p className="truncate text-xs text-ink-300">{i.group}{active.source === "template" && i.basis ? ` · ${i.basis}` : ""}</p>
                </div>
                <select aria-label="항목 유형" className="shrink-0 rounded-lg border border-ink-100 bg-white px-2 py-1 text-xs" value={i.kind} onChange={(e) => editItem(i.id, { kind: e.target.value as ItemKind })}>
                  {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                <input aria-label="배점" type="number" step="0.5" min={0} className="w-16 shrink-0 rounded-lg border border-ink-100 px-2 py-1 text-right text-sm tabular-nums" value={i.max} onChange={(e) => editItem(i.id, { max: Number(e.target.value) || 0 })} />
                <button type="button" className="shrink-0 text-xs text-ink-300 hover:text-coral" onClick={() => removeItem(i.id)}>삭제</button>
              </div>
              <ItemDetail item={i} />
            </li>
          ))}
        </ul>
        <SheetDetail sheet={active} />
        <AddItem onAdd={(label, max) => active && setSheet({ ...active, items: [...active.items, { id: `u${Date.now()}`, label, max, kind: kindOf(label), group: "추가 항목" }] })} />
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-ink-500">
          {active.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>

    {/* 평가 기준 아래: 전년도·과거 같은 사업·비슷한 공고의 낙찰 결과 */}
    <AwardAnalysisSection analysis={analysis} loading={analysisLoading} fc={fc} bidRate={co.bidRate} floor={active.lowerLimit ?? bid.lowerLimitRate} isNego={isNego} baseAmount={bid.baseAmount} />
    </div>
  );
}

/** 재무 금액: 1조 이상은 조 단위로 줄여 표 폭을 지킨다 */
const fmtWon = (n?: number): string => {
  if (n === undefined) return "-";
  if (n < 0) return `-${fmtWon(-n)}`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1).replace(/\.0$/, "")}조원`;
  return won(n);
};
/** 영문 네트워크 오류는 그대로 보이지 않는다 */
const friendly = (e: string) => (/등록되지 않은 서비스키/.test(e) ? "이 자료의 공공데이터포털 활용신청이 아직 승인되지 않았습니다." : /[가-힣]/.test(e) ? e : "잠시 후 다시 시도해 주세요");

/** 사업자번호 조회 결과: 출처별로 나눠 보여 준다 */
const VERDICT_TONE: Record<Verdict, string> = {
  가능: "bg-mint-50 text-mint-700",
  불가: "bg-coral-100 text-ink",
  "확인 필요": "bg-amber-100 text-ink",
};
const VERDICT_SOLID: Record<Verdict, string> = { 가능: "bg-mint text-white", 불가: "bg-coral text-white", "확인 필요": "bg-amber text-ink" };
const VERDICT_TITLE: Record<Verdict, string> = {
  가능: "업종·지역 기준 참가 가능",
  불가: "현재 등록 정보로는 참가 불가",
  "확인 필요": "참가 가능 여부 확인 필요",
};

/** 사업자번호 조회 결과와 공고의 업종·지역 제한을 대조한 참가자격 1차 판정 */
function EligibilityPanel({ result }: { result: Eligibility | null }) {
  if (!result) return <p className="mt-3 text-sm text-ink-300">공고의 참가자격 자료를 확인하는 중…</p>;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-ink-100 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
        <p className="font-bold">입찰 참가자격</p>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${VERDICT_SOLID[result.verdict]}`}>{VERDICT_TITLE[result.verdict]}</span>
      </div>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {result.checks.map((c) => (
          <li key={c.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[7.5rem_1fr]">
            <div className="flex items-center justify-between gap-2 sm:block">
              <p className="font-semibold">{c.label}</p>
              <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold sm:mt-1 ${VERDICT_TONE[c.verdict]}`}>{c.verdict}</span>
            </div>
            <DetailLines text={c.detail} className="min-w-0 break-keep leading-relaxed text-ink-500" />
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-100 bg-ink-50 px-4 py-2.5 text-xs leading-relaxed text-ink-500">
        나라장터에 입력된 업종·지역 제한과 기업의 나라장터 등록 정보로 판정했습니다. 중소기업·직접생산·실적·등급 제한처럼 공고서 본문에만 있는 조건은 포함하지 않으니, 투찰 전 공고서의 참가자격을 함께 확인하세요.
      </p>
    </div>
  );
}

/** 판정 사유를 문장마다 한 줄로 나눠 보여 준다 (필요 업종 / 등록 여부 / 마감 안내처럼) */
function DetailLines({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.split(/(?<=[.])\s+(?=\S)/).filter(Boolean);
  return (
    <span className={`block space-y-0.5 ${className}`}>
      {lines.map((l, n) => <span key={n} className="block">{l}</span>)}
    </span>
  );
}

/** AI가 첨부에서 읽은 배점표일 때 붙이는 안내 */
function AiReadNote() {
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-500">
      공고 첨부의 배점표를 읽어 정리했습니다. 항목 이름이 원문에 있는지, 배점 합계가 100점이고 나라장터에 등록된 기술·가격 배점과 맞는지 확인을 통과한 경우에만 씁니다. 제출 전 공고 원문으로 한 번 더 확인하세요.
    </p>
  );
}

/** 사업자번호 조회 전: 공고의 평가항목과 배점, 통과 기준만 보여 준다 */
function CriteriaPanel({ sheet, passLabel }: { sheet: EvalSheet; passLabel?: string }) {
  const max = Math.round(sheet.items.reduce((s, i) => s + Math.max(0, i.max), 0) * 10) / 10;
  return (
    <section className="card overflow-hidden">
      <div className="p-6">
        <p className="text-sm text-ink-500">평가 기준</p>
        <p className="mt-1 text-lg font-bold">{sheet.source === "extracted" ? "공고 첨부의 평가표" : sheet.criteria?.name ?? `${sheet.method} 기준표`} · {max}점 만점</p>
        {sheet.criteria && <p className="mt-1 text-xs text-ink-500">{sheet.criteria.status} · {sheet.criteria.source}</p>}
        {passLabel && <p className="mt-1 text-sm text-ink-500">통과 기준 {passLabel}</p>}
        {sheet.reader?.by === "ai" && <AiReadNote />}
        <NoticeFacts sheet={sheet} />
      </div>
      <ul className="divide-y divide-ink-100 border-t border-ink-100">
        {sheet.items.map((i) => (
          <li key={i.id} className="flex min-w-0 items-baseline justify-between gap-3 px-6 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold">{i.label}</span>
              {i.group && <span className="block truncate text-xs text-ink-300">{i.group}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-ink-500">{i.max > 0 ? `${i.max}점` : "가·감점"}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-ink-100 bg-ink-50 px-6 py-3 text-sm leading-relaxed text-ink-500">
        사업자번호를 조회하면 참가자격을 먼저 확인하고, 참가할 수 있는 경우 항목별 예상 평가점수를 계산합니다.
      </p>
    </section>
  );
}

/** 참가 불가: 예상 점수 대신 불가 사유를 보여 준다 */
function BlockedPanel({ result, corpName }: { result: Eligibility; corpName?: string }) {
  const blocked = result.checks.filter((c) => c.verdict === "불가");
  const review = result.checks.filter((c) => c.verdict === "확인 필요");
  return (
    <section className="card overflow-hidden border-coral/40">
      <div className="p-6">
        <span className="inline-block rounded-lg bg-coral px-2.5 py-1 text-xs font-bold text-white">참가 불가</span>
        {corpName && <p className="mt-3 text-sm text-ink-500">{corpName}</p>}
        <p className={`${corpName ? "mt-0.5" : "mt-3"} text-lg font-bold leading-snug`}>현재 등록 정보로는 이 공고에 참가할 수 없습니다</p>
        <p className="mt-1 text-sm text-ink-500">참가할 수 없는 공고라 예상 평가점수는 계산하지 않았습니다.</p>
      </div>
      <ol className="space-y-3 border-t border-ink-100 p-6 text-sm">
        {blocked.map((c, n) => (
          <li key={c.label} className="flex gap-3">
            <span className="font-bold tabular-nums text-coral">{n + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{c.label}</span>
              <DetailLines text={c.detail} className="mt-0.5 break-keep leading-relaxed text-ink-500" />
            </span>
          </li>
        ))}
      </ol>
      {review.length > 0 && (
        <p className="border-t border-ink-100 px-6 py-3 text-xs leading-relaxed text-ink-500">
          함께 확인할 것: {review.map((c) => c.label).join(", ")}. 자세한 내용은 왼쪽 입찰 참가자격 표에 있습니다.
        </p>
      )}
    </section>
  );
}

/** 확인 필요: 점수는 보여 주되 무엇을 확인해야 하는지 위에 적는다 */
function ReviewNotice({ result }: { result: Eligibility }) {
  const review = result.checks.filter((c) => c.verdict === "확인 필요");
  return (
    <section className="mb-4 rounded-2xl bg-amber-100 p-4 text-sm text-ink">
      <p className="font-bold">참가 가능 여부 확인 필요</p>
      <ul className="mt-2 space-y-1.5 leading-relaxed">
        {review.map((c) => <li key={c.label} className="break-keep"><b>{c.label}</b><DetailLines text={c.detail} className="mt-0.5" /></li>)}
      </ul>
      <p className="mt-2 text-xs text-ink-500">아래 점수는 참가할 수 있다고 보고 계산한 예상치입니다.</p>
    </section>
  );
}

function CorpPanel({ corp }: { corp: CorpLookup }) {
  const { nts, nara, fsc, finance, errors } = corp;
  const ntsTone = !nts ? "" : !nts.registered || nts.state === "폐업자" ? "text-coral" : nts.state === "휴업자" ? "text-amber" : "text-mint-600";
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-ink-100 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-ink-50 px-4 py-3">
        <p className="font-bold">{corp.corpName ?? "상호 정보 없음"}</p>
        <p className="text-xs tabular-nums text-ink-500">
          {corp.bizno.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")}{corp.ceoName ? ` · 대표 ${corp.ceoName}` : ""}
        </p>
      </div>
      <dl className="divide-y divide-ink-100">
        <Row title="사업자 상태" source="국세청" error={errors.nts}>
          {nts && <><span className={`font-semibold ${ntsTone}`}>{nts.registered ? nts.state || "확인 불가" : "미등록"}</span>{nts.registered && nts.taxType ? ` · ${nts.taxType}` : ""}{nts.closedAt ? ` · 폐업일 ${nts.closedAt}` : ""}{!nts.registered ? ` · ${nts.taxType}` : ""}</>}
        </Row>
        <Row title="조달업체 등록" source="나라장터" error={errors.nara} empty="나라장터 조달업체로 등록되어 있지 않습니다.">
          {nara && (
            <>
              <p>개업 {nara.openedAt ?? "-"} · 종업원 {nara.employees?.toLocaleString("ko-KR") ?? "-"}명{nara.manufacturer ? ` · ${nara.manufacturer}` : ""}{nara.registeredAt ? ` · 등록 ${nara.registeredAt}` : ""}</p>
              {nara.bizDivisions.length > 0 && <p className="text-ink-500">참여 분야 {nara.bizDivisions.join(", ")}</p>}
              {nara.address && <p className="text-ink-500">{nara.address}</p>}
              {nara.industries.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {nara.industries.map((i) => (
                    <span key={i.code + i.name} className={`rounded-md px-1.5 py-0.5 text-xs ${i.representative ? "bg-ink text-white" : "bg-ink-50 text-ink-500"}`}>{i.name || `업종코드 ${i.code}`}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </Row>
        <Row title="기업 기본정보" source="금융위원회" error={errors.fsc} empty="법인 공시 정보가 없습니다. 개인사업자나 비공시 법인은 조회되지 않습니다.">
          {fsc && (
            <>
              <p>설립 {fsc.establishedAt ?? "-"}{fsc.employees ? ` · 종업원 ${fsc.employees.toLocaleString("ko-KR")}명` : ""}{fsc.smallBusiness !== undefined ? ` · ${fsc.smallBusiness ? "중소기업" : "중소기업 아님"}` : ""}{fsc.market ? ` · ${fsc.market}` : ""}</p>
              <p className="text-ink-500">법인등록번호 {fsc.crno.replace(/(\d{6})(\d{7})/, "$1-$2")}{fsc.auditOpinion ? ` · 감사의견 ${fsc.auditOpinion}` : ""}{fsc.auditor ? ` (${fsc.auditor})` : ""}{fsc.mainBank ? ` · 주거래은행 ${fsc.mainBank}` : ""}</p>
            </>
          )}
        </Row>
        {fsc && (
          <Row title="재무 요약" source="금융위원회" error={errors.finance} empty="공시된 재무제표가 없습니다. 외부감사 대상이 아니면 재무제표 서류로 확인합니다.">
            {finance.length > 0 && (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-right text-[11px] tabular-nums sm:text-xs">
                  <thead className="text-ink-300">
                    <tr><th className="px-1 py-1 text-left font-medium">연도</th><th className="px-1 font-medium">매출</th><th className="px-1 font-medium">영업이익</th><th className="px-1 font-medium">순이익</th><th className="px-1 font-medium">부채비율</th></tr>
                  </thead>
                  <tbody>
                    {finance.map((f) => (
                      <tr key={f.year} className="border-t border-ink-100">
                        <td className="whitespace-nowrap px-1 py-1 text-left">{f.year} <span className="text-ink-300">{f.basis}</span></td>
                        <td className="px-1">{fmtWon(f.sales)}</td>
                        <td className={`px-1 ${(f.operatingProfit ?? 0) < 0 ? "text-coral" : ""}`}>{fmtWon(f.operatingProfit)}</td>
                        <td className={`px-1 ${(f.netIncome ?? 0) < 0 ? "text-coral" : ""}`}>{fmtWon(f.netIncome)}</td>
                        <td className="px-1 font-semibold">{f.debtRatio !== undefined ? `${f.debtRatio}%` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Row>
        )}
        <Row title="부정당제재" source="나라장터" error={errors.sanction} empty="부정당제재 이력이 없습니다.">
          {corp.sanctions && corp.sanctions.length > 0 && (
            <ul className="space-y-1">
              {corp.sanctions.slice(0, 5).map((x, i) => (
                <li key={i}>
                  <span className={`font-semibold ${x.active || x.upcoming ? "text-coral" : "text-ink-500"}`}>{x.active ? "제재 중" : x.upcoming ? "제재 예정" : x.state === "제재" ? "종료" : x.state || "종료"}</span>
                  {` · ${x.agency} · ${x.begin ?? ""}~${x.end ?? ""}`}
                  {x.reason && <span className="block text-xs text-ink-500">{x.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row title="공공구매 확인서" source="공공구매종합정보망" error={errors.disabledCert ?? errors.womenCert}>
          {(corp.certs?.disabled !== undefined || corp.certs?.women !== undefined) && (
            <>
              {corp.certs?.disabled !== undefined && <p>장애인기업확인서 {certText(corp.certs.disabled)}</p>}
              {corp.certs?.women !== undefined && <p>여성기업확인서 {certText(corp.certs.women)}</p>}
              {corp.directProduction && <p className="text-ink-500">직접생산확인증명 {corp.directProduction.filter((d) => d.valid).length ? `유효 ${corp.directProduction.filter((d) => d.valid).length}개 세부품명` : "없음"}</p>}
            </>
          )}
        </Row>
      </dl>
    </div>
  );
}

function certText(c: { valid: boolean; validTo?: string } | null) {
  if (!c) return "없음";
  return c.valid ? `유효${c.validTo ? ` (~${c.validTo})` : ""}` : `유효기간 지남${c.validTo ? ` (${c.validTo})` : ""}`;
}

function Row({ title, source, error, empty, children }: { title: string; source: string; error?: string; empty?: string; children?: React.ReactNode }) {
  const has = !!children && !(Array.isArray(children) && children.every((c) => !c));
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[7.5rem_1fr]">
      <dt>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-ink-300">{source}</p>
      </dt>
      <dd className="min-w-0 leading-relaxed">
        {has ? children : <p className="text-ink-500">{error ? `조회하지 못했습니다. ${friendly(error)}` : empty ?? "정보 없음"}</p>}
      </dd>
    </div>
  );
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs font-bold text-white tabular-nums">{n}</span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function Num({ label, value, onChange, hint, tag }: { label: string; value: number; onChange: (v: number) => void; hint?: string; tag?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="label flex flex-wrap items-center gap-1.5">{label}{tag}</span>
      <input className="input" type="number" min={0} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
      {hint && <p className="mt-1 text-xs text-ink-500">{tag ? "증빙: " : ""}{hint}</p>}
    </div>
  );
}

/** 값의 출처 표시: 공공데이터 자동 / 고객 수정 / 직접 입력 */
function FactTag({ auto, current, onReset }: { auto?: AutoFact; current?: number | string; onReset?: (v: number | string) => void }) {
  if (!auto) return <span className="rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">직접 입력</span>;
  if (String(auto.value) === String(current)) {
    return <span className="rounded-md bg-mint-50 px-1.5 py-0.5 text-[11px] font-semibold text-mint-700" title={auto.from}>자동 · {auto.from}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
      수정됨 · 자동값 {String(auto.value)}
      {onReset && <button type="button" className="font-semibold text-ink-500 underline" onClick={() => onReset(auto.value)}>되돌리기</button>}
    </span>
  );
}

/** 예상 투찰률 근거 문구: 전년도 유사 공고면 그 공고명, 아니면 같은 조건 평균 */
function rivalBasis(e: RivalEstimate) {
  const when = e.label ?? `${e.year}년`;
  if (e.prior?.length) {
    const first = `「${e.prior[0].title}」`;
    return e.prior.length === 1
      ? `같은 수요기관의 과거 유사 공고 ${first} 낙찰률 ${e.rate.toFixed(2)}%`
      : `같은 수요기관의 과거 유사 공고 ${e.prior.length}건(${first} 외) 평균 낙찰률 ${e.rate.toFixed(2)}%`;
  }
  return `${when} ${e.scope} 낙찰 ${e.n.toLocaleString()}건의 평균 낙찰률 ${e.rate.toFixed(2)}%`;
}

/** base: 금액 환산 기준(원). 예정가격은 개찰 때 정해지므로 공고 기초금액으로 계산한다 */
function Range({ label, value, onChange, hint, base }: { label: string; value: number; onChange: (v: number) => void; hint?: string; base?: number }) {
  const amount = base && base > 0 ? Math.floor((base * value) / 100) : undefined;
  return (
    <div className="sm:col-span-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="label">{label}</span>
        <span className="text-sm font-bold tabular-nums">
          {value.toFixed(2)}%{amount !== undefined && <span className="ml-2 text-ink">{wonFull(amount)}</span>}
        </span>
      </div>
      <input type="range" min={80} max={100} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#12B886]" />
      {amount !== undefined && <p className="mt-1 text-xs text-ink-500">금액 = 기초금액 {wonFull(base!)} × {value.toFixed(2)}% (예정가격은 개찰 때 정해지므로 기초금액 기준)</p>}
      {base !== undefined && amount === undefined && <p className="mt-1 text-xs text-ink-500">공고에 기초금액이 없어 금액은 계산하지 않았습니다.</p>}
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function AddItem({ onAdd }: { onAdd: (label: string, max: number) => void }) {
  const [label, setLabel] = useState("");
  const [max, setMax] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => { e.preventDefault(); if (label.trim() && Number(max) > 0) { onAdd(label.trim(), Number(max)); setLabel(""); setMax(""); } }}
    >
      <input className="input py-2 text-sm" placeholder="빠진 항목 추가 (예: 안전관리 계획)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="input w-24 py-2 text-sm" placeholder="배점" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
      <button className="btn-ghost btn-sm shrink-0">추가</button>
    </form>
  );
}

const STATUS_TONE: Record<string, string> = { "공식 대조": "bg-mint-50 text-mint-700", "일부 추정": "bg-amber-100 text-ink", 추정: "bg-coral-100 text-ink" };

/** 공고서에서 읽어 기준표보다 우선 적용한 이 공고의 기준 (원문 문장과 함께) */
function NoticeFacts({ sheet }: { sheet: EvalSheet }) {
  const f = sheet.noticeFacts;
  if (!f?.length) return null;
  return (
    <div className="mt-4 rounded-2xl bg-mint-50 px-4 py-3 text-xs leading-relaxed">
      <p className="text-sm font-semibold">이 공고의 기준 (공고서에서 읽어 우선 적용)</p>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[7.5rem_1fr]">
        {f.map((x, n) => (
          <div key={x.label} className="contents">
            <dt className="font-semibold text-ink">{x.label}</dt>
            <dd className="min-w-0 break-keep text-ink-500">
              <span className="text-ink">{x.value}</span>
              {/* 같은 문장에서 읽은 값은 원문을 한 번만 보여 준다 */}
              {x.quote && x.quote !== x.value && f.findIndex((y) => y.quote === x.quote) === n && <span className="mt-0.5 block text-ink-300">원문: {x.quote}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 적용한 기준표와 근거, 추정한 값 */
function CriteriaInfo({ sheet }: { sheet: EvalSheet }) {
  const c = sheet.criteria;
  if (!c) return null;
  return (
    <div className="mt-4 rounded-2xl border border-ink-100 px-4 py-3 text-xs leading-relaxed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">적용 기준표: {c.name}</p>
        <span className={`rounded-md px-1.5 py-0.5 font-semibold ${STATUS_TONE[c.status]}`}>{c.status}</span>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-ink-500 sm:grid-cols-[6.5rem_1fr]">
        <dt className="font-semibold text-ink">근거</dt><dd className="min-w-0">{c.source}</dd>
        {c.methodText && (<><dt className="font-semibold text-ink">공고 낙찰방법</dt><dd className="min-w-0 break-keep">{c.methodText}</dd></>)}
        {sheet.pass && (<><dt className="font-semibold text-ink">통과 기준</dt><dd>{sheet.pass.kind === "total" ? `${sheet.method === "적격심사" ? "종합평점" : "합산점수"} ${sheet.pass.score}점 이상` : `기술점수 배점의 ${Math.round(sheet.pass.ratio * 100)}% 이상`}</dd></>)}
        {sheet.lowerLimit !== undefined && (<><dt className="font-semibold text-ink">낙찰하한율</dt><dd>{sheet.lowerLimit}%</dd></>)}
        {sheet.price && (<><dt className="font-semibold text-ink">가격 산식</dt><dd className="min-w-0">{sheet.price.text}{sheet.price.derived ? " (계수 역산)" : ""}</dd></>)}
      </dl>
      {c.estimates.length > 0 && (
        <div className="mt-2 border-t border-ink-100 pt-2 text-ink-500">
          <p className="font-semibold text-ink">추정한 부분</p>
          <ul className="mt-0.5 space-y-0.5">{c.estimates.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** 실제 공고·낙찰 결과와 대조한 검증 요약 */
function ValidationNote({ v }: { v: Validation }) {
  const p = v.byKind["조달청"];
  const t = v.total;
  const d = (x: string) => `${Number(x.slice(4, 6))}.${Number(x.slice(6, 8))}`;
  if (!p) return null;
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-300">
      검증 ({d(v.period.notices[0])}~{d(v.period.notices[1])} 나라장터 적격심사 공고 {t.notices.toLocaleString()}건): 조달청 기준표 공고 {p.lwltCompared.toLocaleString()}건 중 기준표 낙찰하한율이 공고 값과 일치 {pct(p.lwltMatched, p.lwltCompared)}%, 실제 낙찰자 투찰률이 예측 통과 구간 안 {p.winnersInside.toLocaleString()}/{p.winners.toLocaleString()}건. 행정안전부·기관 자체 기준 공고는 기준표 원문을 대조하지 못해 공고 낙찰하한율로 맞춘 추정입니다 (낙찰자 {(t.winnersInside - p.winnersInside).toLocaleString()}/{(t.winners - p.winners).toLocaleString()}건 구간 안).
    </p>
  );
}

/** 항목별 세부기준: 공고의 점수 구간, 인정 범위, 평가 요소 */
function ItemDetail({ item }: { item: EvalItem }) {
  if (!item.bands && !item.recognition && !item.criteria) return null;
  return (
    <div className="mt-2 space-y-1.5 border-t border-ink-100 pt-2 text-xs leading-relaxed">
      {item.bands && (
        <div className="flex flex-wrap gap-1">
          {item.bands.map((b) => (
            <span key={b.cond + b.points} className="rounded-md bg-ink-50 px-1.5 py-0.5 tabular-nums text-ink-500">{b.cond} <b className="text-ink">{b.points}</b></span>
          ))}
        </div>
      )}
      {item.recognition?.map((r) => <p key={r} className="text-ink-500"><span className="font-semibold text-ink">인정 범위</span> {r}</p>)}
      {item.criteria && <p className="text-ink-500"><span className="font-semibold text-ink">평가 요소</span> {item.criteria.join(" / ")}</p>}
    </div>
  );
}

/** 평가표 전체 기준: 정성 등급표, 위원 점수 처리, 서류 인정 기준 */
function SheetDetail({ sheet }: { sheet: EvalSheet }) {
  if (!sheet.scale && !sheet.panelRule && !sheet.recognition) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
      {(sheet.scale || sheet.panelRule) && (
        <div className="rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-relaxed">
          <p className="text-sm font-semibold">정성평가 방식</p>
          {sheet.scale && <p className="mt-1 tabular-nums text-ink-500">등급 {sheet.scale.map((l) => `${l.label} ${Math.round(l.ratio * 100)}%`).join(" · ")}</p>}
          {sheet.panelRule && <p className="mt-1 text-ink-500">{sheet.panelRule}</p>}
          <p className="mt-1 text-ink-300">제안 준비 수준 상·중·하를 이 등급에 대응시켜 계산합니다. 위원별 실제 판단은 알 수 없어 예상치입니다.</p>
        </div>
      )}
      {sheet.recognition && (
        <div className="rounded-2xl bg-ink-50 px-4 py-3 text-xs leading-relaxed">
          <p className="text-sm font-semibold">서류 인정 기준</p>
          <ul className="mt-1 space-y-0.5 text-ink-500">{sheet.recognition.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
