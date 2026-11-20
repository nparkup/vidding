/**
 * 낙찰 저장소(R2)에서 한 업체의 낙찰 건을 읽는다. Cloudflare Worker(worker/corp-lookup)가 R2 바인딩으로 부른다.
 * 조달청 API를 부르지 않으므로 호출 한도와 상관없이 저장 기간(10년) 전체를 한 번에 돌려준다.
 */
import { SHARD_COLS, firstLicense, shardOf, type AwardMeta, type ShardFile, type TopBidder } from "./format";
import type { NtceClass, PerfBiz, PerfWin } from "../perfLookup";

/** Worker R2 바인딩 중 쓰는 부분만 */
export interface R2BucketLike {
  get(key: string): Promise<{ body: ReadableStream; arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface AwardWin extends PerfWin {
  cls: NtceClass;
  /** 낙찰업체명 (2026-11-20 이전 중계 서버 응답에는 없다) */
  winner?: string;
  /** 업무 (2026-11-20 이전 중계 서버 응답에는 없다) */
  biz?: string;
  /** 낙찰률(%), 없으면 0 */
  rate: number;
  bidders: number;
  method: string;
  region: string;
  lic: string;
  /** 기초금액(원), 없으면 0 */
  base: number;
  /** 예정가격(원), 없으면 0 */
  plnprc: number;
  /** 낙찰하한율(%), 없으면 0 */
  lwlt: number;
  /** 예비가격 범위 (예: "-2~+2") */
  rng: string;
  /** 적격심사 기준 (행자부·조달청 등) */
  basis: string;
  /** 개찰 순위 1~5위 (아직 안 받은 공고는 빈 목록) */
  top: { rank: number; bizno: string; name: string; amount: number; rate: number }[];
}

export interface AwardLookup {
  /** 저장소가 연결돼 있고 수집 기록이 있으면 true */
  ready: boolean;
  meta?: AwardMeta;
  wins: AwardWin[];
}

async function gunzipJson<T>(obj: { body: ReadableStream }): Promise<T> {
  const stream = obj.body.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}

export async function readAwards(bucket: R2BucketLike | undefined, bizno: string, biz: string): Promise<AwardLookup> {
  if (!bucket) return { ready: false, wins: [] };
  const metaObj = await bucket.get("stats/meta.json");
  if (!metaObj) return { ready: false, wins: [] };
  const meta = JSON.parse(new TextDecoder().decode(await metaObj.arrayBuffer())) as AwardMeta;
  const no = bizno.replace(/\D/g, "");
  if (!no) return { ready: true, meta, wins: [] };
  if (no.length !== 10) throw new Error("올바른 사업자등록번호가 아닙니다.");

  const obj = await bucket.get(`shards/${shardOf(no)}.json.gz`);
  // 샤드가 없으면 저장소를 다시 만드는 중이다: 화면이 직접 조회로 가게 한다
  if (!obj) return { ready: false, meta, wins: [] };
  const file = await gunzipJson<ShardFile>(obj);
  const c = Object.fromEntries(file.cols.map((k, i) => [k, i])) as Record<(typeof SHARD_COLS)[number], number>;
  const want = biz === "공사" || biz === "물품" || biz === "용역" ? (biz as PerfBiz) : undefined;
  const wins: AwardWin[] = [];
  for (const r of file.rows) {
    if (r[c.bizno] !== no || (want && r[c.biz] !== want)) continue;
    wins.push({
      bidNtceNo: r[c.no] as string,
      bidNtceOrd: r[c.ord] as string,
      title: r[c.title] as string,
      winner: (r[c.winner] as string) || undefined,
      biz: r[c.biz] as string,
      amount: r[c.amount] as number,
      agency: r[c.agency] as string,
      date: r[c.date] as string,
      rate: r[c.rate] as number,
      bidders: r[c.bidders] as number,
      method: r[c.method] as string,
      region: r[c.region] as string,
      lic: r[c.lic] as string,
      // 2026-11-17 이전에 만든 샤드에는 이 열들이 없다
      base: c.base === undefined ? 0 : (r[c.base] as number) || 0,
      plnprc: c.plnprc === undefined ? 0 : (r[c.plnprc] as number) || 0,
      lwlt: c.lwlt === undefined ? 0 : (r[c.lwlt] as number) || 0,
      rng: c.rng === undefined ? "" : (r[c.rng] as string) || "",
      basis: c.basis === undefined ? "" : (r[c.basis] as string) || "",
      top: c.top === undefined ? [] : ((r[c.top] as TopBidder[]) || []).map(([rank, bizno, name, amount, rate]) => ({ rank, bizno, name, amount, rate })),
      cls: {
        bidNtceNo: r[c.no] as string,
        clsfcNo: (r[c.clsNo] as string) || undefined,
        clsfcNm: (r[c.clsNm] as string) || undefined,
        midNm: (r[c.mid] as string) || undefined,
        lrgNm: (r[c.lrg] as string) || undefined,
        mainWork: (r[c.work] as string) || undefined,
        lic: firstLicense(r[c.lic] as string) || undefined,
      },
    });
  }
  return { ready: true, meta, wins };
}
