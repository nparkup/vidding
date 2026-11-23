import type { ReactNode } from "react";
import { won } from "@/lib/format";
import type { BidQual } from "@/lib/eligibility";
import type { NoticeInfo } from "@/lib/noticeInfo";
import { jointAllowed } from "@/lib/noticeInfo";
import type { Bid } from "@/lib/types";

interface Cell {
  k: string;
  v: ReactNode;
  /** 값 아래 작은 설명 */
  sub?: string;
  /** 두 칸 너비 */
  wide?: boolean;
}

/** 금액은 원 단위 전체로 쓰고, 1억 원 이상이면 한 줄에 들어가게 두 칸을 쓴다 */
function amount(n: number): { v: ReactNode; wide: boolean } {
  return { v: <span className="tabular-nums">{won(n)}</span>, wide: n >= 100_000_000 };
}

const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;

/** 대표 금액: 기초금액이 공개됐으면 기초금액, 아니면 배정예산, 그것도 없으면 추정가격 */
function headline(bid: Bid, info?: NoticeInfo): Cell {
  if (info?.base) return { k: "기초금액", ...amount(info.base) };
  if (info?.budget) return { k: "배정예산", ...amount(info.budget), sub: "기초금액 미공개" };
  if (info?.presmpt) return { k: "추정가격", ...amount(info.presmpt), sub: "부가세 별도 · 기초금액 미공개" };
  if (bid.source === "g2b") return bid.baseAmount ? { k: "배정예산·추정가격", ...amount(bid.baseAmount) } : { k: "금액", v: "공개 안 함", sub: "공고서·제안요청서 확인" };
  return { k: "기초금액", ...amount(bid.baseAmount) };
}

function priceCell(info: NoticeInfo): Cell | undefined {
  const m = info.priceMethod;
  if (!m && !info.baseRange) return undefined;
  if (m === "비예가") return { k: "예정가격", v: "비예가", sub: "예정가격 없이 평가" };
  const draw = info.priceDraw ? `${info.priceDraw[0]}개 중 ${info.priceDraw[1]}개 추첨` : undefined;
  const range = info.baseRange ? `기초금액 ${pct(info.baseRange[0])} ~ ${pct(info.baseRange[1])}` : undefined;
  return { k: "예정가격", v: m ?? "복수예가", sub: [draw, range].filter(Boolean).join(" · ") || undefined };
}

function jointCell(bid: Bid, info?: NoticeInfo): Cell {
  const ok = jointAllowed(info?.jointMethod) ?? bid.jointContract;
  const how = info?.jointMethod?.replace(/^\([^)]*\)/, "").trim();
  const notes = [
    ok && how && !/불허/.test(how) ? how : undefined,
    info?.jointRegionDuty ? "지역의무공동도급" : undefined,
    ok && info?.jointRegionLimit ? "구성원 지역 제한" : undefined,
  ].filter(Boolean);
  return { k: "공동도급", v: ok ? "허용" : "불가(단독)", sub: notes.join(" · ") || undefined };
}

/** 공고 상세 '핵심 요약' 칸들. info(입찰공고정보서비스 항목)가 아직 없거나 없는 공고는 공고 목록 값만 보여 준다 */
export function BidSummary({ bid, qual }: { bid: Bid; qual?: BidQual }) {
  const info = qual?.info;
  const biz = bid.bizType ?? "용역";
  const head = headline(bid, info);
  const cells: (Cell | undefined | false | 0 | "")[] = [
    head,
    info?.presmpt && head.k !== "추정가격" ? { k: "추정가격", v: won(info.presmpt), sub: "부가세 별도" } : undefined,
    info?.base && info.budget ? { k: "배정예산", v: won(info.budget) } : undefined,
    info && priceCell(info),
    { k: "업무 구분", v: info?.serviceDiv && biz === "용역" ? `${biz} · ${info.serviceDiv}` : biz },
    biz === "용역" && { k: "용역 기간", v: `${bid.periodMonths}개월` },
    info?.bidMethod && { k: "입찰방식", v: info.bidMethod, sub: info.international ? "국제입찰" : undefined },
    {
      k: "참가 지역",
      v: bid.region === "전국" ? "제한 없음" : `${(qual?.regions?.length ? qual.regions : bid.regions ?? [bid.region]).join("·")} 제한`,
      sub: bid.region !== "전국" && qual?.regionBasis ? `${qual.regionBasis.replace("본사또는참여지사소재지", "본사 또는 참여 지사 소재지").replace("본사소재지", "본사 소재지")} 기준` : undefined,
    },
    { k: "필요 면허", v: bid.licenseRaw || bid.licenses.join(", ") || "제한 없음" },
    { k: "낙찰하한율", v: bid.lowerLimitRate ? `${bid.lowerLimitRate}%` : "해당 없음" },
    info?.evalStd && { k: "적격심사 기준", v: info.evalStd === "행자부" ? "행정안전부" : info.evalStd, sub: info.evalStd === "행자부" ? "지자체 적격심사 기준" : undefined },
    info?.evalRatio && { k: "평가 배점", v: `${info.evalRatio[0]} : ${info.evalRatio[1]}`, sub: "기술 : 가격" },
    jointCell(bid, info),
    info?.performanceLimit && { k: "실적 제한", v: "실적제한 경쟁", sub: "공고서의 실적 기준 확인" },
    info?.nominated && { k: "지명경쟁", v: "지명 업체만 참가" },
    bid.smallBizOnly && { k: "중소기업 제한", v: "예" },
    info?.rebid !== undefined && { k: "재입찰", v: info.rebid ? "허용" : "불가" },
    info?.mainWork && { k: "주공종", v: info.mainWork },
    info?.site && { k: "공사 현장", v: info.site },
    info?.govSupply && { k: "관급자재", v: won(info.govSupply) },
    info?.product && { k: "세부품명", v: info.product, sub: info.quantity },
    (info?.deliverDays || info?.deliverTerms) && { k: "납품", v: info?.deliverDays ? `계약 후 ${info.deliverDays}일` : info!.deliverTerms!, sub: info?.deliverDays ? info.deliverTerms : undefined },
    info?.fee && { k: "입찰참가수수료", v: won(info.fee) },
    bid.stats && { k: "유사공고 평균 참여", v: `${bid.stats.avgBidders}개사` },
  ];
  const shown = cells.filter((c): c is Cell => !!c);
  const notice = info && (info.reNotice || (info.kind && info.kind !== "등록공고")) ? [info.reNotice ? "재공고" : "", info.kind && info.kind !== "등록공고" ? info.kind : ""].filter(Boolean).join(" · ") : "";

  return (
    <>
      {notice && (
        <p className="mt-3 rounded-xl bg-coral-100/60 px-4 py-2.5 text-sm">
          <span className="font-bold text-coral">{notice}</span>
          {info?.changeReason && <span className="text-ink-500"> · {info.changeReason.replace(/^\[[^\]]+\]\s*/, "")}</span>}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        {shown.map((c) => (
          <div key={c.k} className={`min-w-0 rounded-xl bg-paper p-3${c.wide ? " col-span-2" : ""}`}>
            <dt className="text-xs text-ink-500">{c.k}</dt>
            <dd className="mt-1 break-words font-bold">{c.v}</dd>
            {c.sub && <dd className="mt-0.5 text-xs text-ink-500">{c.sub}</dd>}
          </div>
        ))}
      </dl>
    </>
  );
}

/** 공고기관 담당자 연락처 (입찰공고정보서비스 ntceInsttOfcl*, 집행관) */
export function BidContact({ info }: { info?: NoticeInfo }) {
  const o = info?.officer;
  return (
    <>
      {(o || info?.executor) && (
        <div className="mt-4 rounded-xl border border-ink-100 p-4 text-sm">
          <p className="text-xs text-ink-500">공고 담당자</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {o?.name && <span className="font-bold">{o.name}</span>}
            {o?.tel && <a href={`tel:${o.tel.replace(/[^\d]/g, "")}`} className="tabular-nums hover:text-mint-600">{o.tel}</a>}
            {o?.email && <a href={`mailto:${o.email}`} className="break-all hover:text-mint-600">{o.email}</a>}
            {info?.executor && <span className="text-ink-500">집행관 {info.executor}</span>}
          </p>
        </div>
      )}
    </>
  );
}

/** 'YYYY-MM-DD HH:mm'(한국 시간) → ISO */
export function kstIso(s?: string): string | undefined {
  const m = s?.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d)/);
  return m ? `${m[1]}T${m[2]}:00+09:00` : undefined;
}
