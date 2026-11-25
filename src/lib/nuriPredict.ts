"use client";

/**
 * 민간 예측(/premium/nuri): 누리장터 민간 공고 중 첨부 배점표를 읽은 공고를 나라장터 예측 화면(ScorePredictor)이 쓰는 모양으로 바꾼다.
 * 공고 목록은 /nuri-bids-data.json, 평가표는 /nuri-docs-data.json (빌드가 첨부에서 읽은 전체 평가표·공고서 문장 기준).
 * 민간 공고는 조달청·행안부 공식 기준표나 공고 목록의 낙찰하한율이 없어, 원문 배점표가 있는 공고만 예측한다.
 */
import { useEffect, useState } from "react";
import type { BidQual } from "./eligibility";
import { agencyKey, type NuriBid, type NuriBidsFile, type NuriDocs, type NuriRateStat, type NuriResult } from "./nuri";
import { REGIONS, type Bid, type BidAttachment, type BizType, type Region, type ServiceCategory } from "./types";
import { loadSiteJson } from "./useSiteJson";

export interface NuriPredictDocs {
  files: BidAttachment[];
  sheet: NuriDocs["sheet"];
  sheetFile: string;
  notice?: NuriDocs["notice"];
  qual: BidQual;
}

export interface NuriPredictData {
  bids: Bid[];
  docs: Record<string, NuriPredictDocs>;
  rates: NuriRateStat[];
  /** 지난 개찰 결과 (최근 6개월, 상위 순위만) */
  results: NuriResult[];
  /** 고른 공고 id → 원래 민간 공고 (업무·낙찰방법 원문, 배정예산 여부) */
  raw: Record<string, NuriBid>;
  /** 결과 수집 시작일 (YYYY-MM-DD) */
  from?: string;
}

const nuriId = (b: Pick<NuriBid, "no" | "ord">) => `${b.no}-${b.ord}`;

export function nuriToBid(b: NuriBid): Bid {
  const regions = b.regions.filter((r): r is Region => (REGIONS as string[]).includes(r));
  return {
    id: nuriId(b),
    bidNtceNo: b.no,
    bidNtceOrd: b.ord,
    title: b.title,
    category: b.category as ServiceCategory,
    bizType: (b.biz === "기타" ? "용역" : b.biz) as BizType,
    agency: b.agency,
    demandAgency: b.agency,
    region: regions.length === 1 ? regions[0] : "전국",
    regions: regions.length ? regions : undefined,
    licenses: [...new Set(b.licenseGroups.flat().map((l) => l.name))],
    // 유사 실적 조회(PerfLookup)가 면허 이름으로 나라장터 낙찰을 찾는다. 분류(cls)는 나라장터 공고번호가 아니라 비워 둔다 (공고번호 분류 조회를 하지 않게)
    licenseRaw: [...new Set(b.licenseGroups.flat().map((l) => l.name))].join(", ") || undefined,
    cls: {},
    baseAmount: b.refAmount ?? b.budget ?? 0,
    contractMethod: /제안서/.test(b.award ?? "") ? "협상에 의한 계약" : "적격심사",
    awardRaw: b.award,
    contractType: b.contract,
    jointContract: false,
    smallBizOnly: false,
    periodMonths: 0,
    postedAt: b.postedAt,
    closeAt: b.closeAt,
    openAt: b.openAt ?? b.closeAt,
    briefingAt: b.briefingAt,
    detailUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/nuri-bids/view?no=${encodeURIComponent(b.no)}`,
    source: "g2b",
  };
}

/** 참가자격 판정용: 누리장터 면허제한·참가가능지역. 목록에 없으면 공고서로 확인할 값(null)으로 둔다 */
export function nuriQual(b: NuriBid): BidQual {
  return {
    licenseLimited: b.licenseGroups.length ? true : null,
    licenseGroups: b.licenseGroups.map((g) => [...g]),
    regionLimited: b.regions.length ? true : null,
    regions: b.regions,
  };
}

export function nuriAmountLabel(b?: NuriBid): string {
  return b && b.refAmount === undefined && b.budget ? "배정예산" : "기준금액";
}

/** 이 공고와 같은 업무·낙찰방법의 지난 개찰 1순위 투찰률 분포 */
export function nuriRateOf(rates: NuriRateStat[], b?: NuriBid): NuriRateStat | undefined {
  if (!b) return undefined;
  return rates.find((r) => r.biz === b.biz && r.award === b.award);
}

/** 같은 기관의 지난 개찰 결과 (최근 개찰 순, 이 공고 제외) */
export function nuriPastOf(results: NuriResult[], b?: NuriBid): NuriResult[] {
  if (!b) return [];
  const key = agencyKey(b.agency);
  return results.filter((r) => agencyKey(r.agency) === key && !(r.no === b.no && r.ord === b.ord)).sort((x, y) => y.openedAt.localeCompare(x.openedAt));
}

let cache: Promise<NuriPredictData> | null = null;

export function loadNuriPredict(): Promise<NuriPredictData> {
  cache ??= Promise.all([loadSiteJson<NuriBidsFile>("nuri-bids-data.json"), loadSiteJson<Record<string, NuriDocs>>("nuri-docs-data.json")])
    .then(([f, d]) => {
      const now = Date.now();
      const live = f.items.filter((b) => d[nuriId(b)] && new Date(b.closeAt).getTime() > now);
      const bids = live.map(nuriToBid);
      const docs: Record<string, NuriPredictDocs> = {};
      const raw: Record<string, NuriBid> = {};
      for (const b of live) {
        const id = nuriId(b);
        const x = d[id];
        raw[id] = b;
        docs[id] = { files: b.files.map((f0) => ({ name: f0.name, url: f0.url, kind: "규격서·기타" })), sheet: x.sheet, sheetFile: x.sheetFile, notice: x.notice, qual: nuriQual(b) };
      }
      return { bids, docs, rates: f.rates, results: f.results, raw, from: f.from };
    })
    .catch((e) => { cache = null; throw e; });
  return cache;
}

/** enabled 가 false 면 받지 않는다 (나라장터 예측 화면) */
export function useNuriPredict(enabled: boolean): { data: NuriPredictData | null; error: boolean } {
  const [data, setData] = useState<NuriPredictData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadNuriPredict().then((d) => alive && setData(d)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [enabled]);
  return { data, error };
}
