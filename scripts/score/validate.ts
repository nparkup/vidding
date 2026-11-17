/**
 * 평가점수 예측 검증: 실제 공고·낙찰 결과와 기준표를 대조한다.
 *
 * 1. 기준표 선택: 적격심사 공고마다 고른 기준표의 낙찰하한율이 공고에 적힌 낙찰하한율과 같은지
 *    (하한율은 배점·가격 산식·통과점수로 정해지므로, 같으면 기준표 구조가 맞다는 뜻이다)
 * 2. 가격 산식: 실제 낙찰자의 투찰률이, 가격 외 점수를 만점으로 둔 예측 통과 구간 안에 있는지
 *    (통과한 낙찰자는 반드시 이 구간 안에 있어야 한다. 밖이면 산식이나 통과점수가 틀린 것이다)
 *
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx scripts/score/validate.ts <공고 시작일 YYYYMMDD> <공고 끝일> <낙찰 시작일> <낙찰 끝일> [출력 파일]
 * VALIDATE_CACHE=파일 을 주면 받은 공고·낙찰을 저장해 두고 다음 실행 때 다시 쓴다.
 * 결과는 public/score-validation.json (사이트의 평가점수 예측 화면에 요약을 보여 준다)
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { criteriaSheet, tableCheck, evalBasisOf, usableLwlt, type EvalBasis } from "../../src/lib/criteria";
import { predict, DEFAULT_COMPANY, type EvalSheet } from "../../src/lib/evalscore";
import type { Bid, BizType } from "../../src/lib/types";

type Item = Record<string, string | undefined>;
const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";
const OPS: Record<BizType, string> = { 용역: "Servc", 공사: "Cnstwk", 물품: "Thng", 외자: "Thng" };

async function call(path: string, op: string, params: Record<string, string>): Promise<{ items: Item[]; total: number }> {
  const q = new URLSearchParams({ type: "json", numOfRows: "999", ...params });
  const url = `https://apis.data.go.kr/1230000${path}/${op}?serviceKey=${KEY}&${q}`;
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      const j = await r.json();
      const body = j.response?.body;
      if (!body) throw new Error(JSON.stringify(j).slice(0, 200));
      const items = Array.isArray(body.items) ? body.items : body.items?.item ? [].concat(body.items.item) : [];
      return { items, total: Number(body.totalCount) || 0 };
    } catch (e) {
      if (t === 5) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (t + 1)));
    }
  }
  throw new Error("unreachable");
}

async function all(path: string, op: string, params: Record<string, string>): Promise<Item[]> {
  const first = await call(path, op, { ...params, pageNo: "1" });
  const out = [...first.items];
  for (let p = 2; p <= Math.ceil(first.total / 999); p++) out.push(...(await call(path, op, { ...params, pageNo: String(p) })).items);
  return out;
}

function days(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}T00:00:00Z`);
  const end = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  return out;
}

const CATEGORY_HINT = (title: string): Bid["category"] =>
  /청소|미화/.test(title) ? "청소" : /경비/.test(title) ? "경비" : /시설.*관리|시설물/.test(title) ? "시설관리" : /소독|방역/.test(title) ? "방역·소독"
    : /연구|조사|컨설팅|학술/.test(title) ? "연구·조사·컨설팅" : /소프트웨어|정보시스템|SW|유지보수|구축/.test(title) ? "IT·소프트웨어"
      : /폐기물/.test(title) ? "폐기물·환경" : /설계|감리|건설사업관리/.test(title) ? "설계·감리·엔지니어링" : /전기|통신|소방/.test(title) ? "전기·통신공사" : "기타 용역";

async function main() {
  const [nFrom, nTo, aFrom, aTo, out = "public/score-validation.json"] = process.argv.slice(2);
  if (!KEY || !aTo) throw new Error("사용법: DATA_GO_KR_SERVICE_KEY=... tsx scripts/score/validate.ts 공고시작 공고끝 낙찰시작 낙찰끝 [출력]");
  const cacheFile = process.env.VALIDATE_CACHE;
  const cached = cacheFile && existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : null;
  // 1. 적격심사 공고
  const notices = new Map<string, { biz: BizType; it: Item }>(cached?.notices ?? []);
  for (const biz of (cached ? [] : ["용역", "공사", "물품"]) as BizType[]) {
    for (const d of days(nFrom, nTo)) {
      const rows = await all("/ad/BidPublicInfoService02", `getBidPblancListInfo${OPS[biz]}02`, { inqryDiv: "1", inqryBgnDt: `${d}0000`, inqryEndDt: `${d}2359` });
      for (const it of rows) if (/^적격심사/.test(it.sucsfbidMthdNm ?? "")) notices.set(it.bidNtceNo ?? "", { biz, it });
    }
    console.log(`${biz} 적격심사 공고 누계 ${notices.size}건`);
  }
  // 2. 낙찰 결과 (개찰일 기준, 7일씩)
  const winners = new Map<string, number>(cached?.winners ?? []);
  const span = days(aFrom, aTo);
  for (const biz of (cached ? [] : ["용역", "공사", "물품"]) as BizType[]) {
    for (let i = 0; i < span.length; i += 7) {
      const s = span[i], e = span[Math.min(i + 6, span.length - 1)];
      const rows = await all("/as/ScsbidInfoService", `getScsbidListSttus${OPS[biz]}`, { inqryDiv: "1", inqryBgnDt: `${s}0000`, inqryEndDt: `${e}2359` });
      for (const r of rows) { const rate = Number(r.sucsfbidRate); if (r.bidNtceNo && rate > 0) winners.set(r.bidNtceNo, rate); }
    }
    console.log(`${biz} 낙찰 누계 ${winners.size}건`);
  }

  if (cacheFile && !cached) writeFileSync(cacheFile, JSON.stringify({ notices: [...notices], winners: [...winners] }));
  type Row = { group: string; kind: string; status: string; lwlt?: number; tableLower?: number; match?: boolean; win?: number; low?: number; high?: number; inside?: boolean };
  const rows: Row[] = [];
  for (const [no, { biz, it }] of notices) {
    const basis: EvalBasis = evalBasisOf(it) ?? {};
    const amount = basis.presmpt ?? Number(it.asignBdgtAmt) ?? 0;
    const bid = { id: no, contractMethod: "적격심사" as const, bizType: biz, baseAmount: amount, category: CATEGORY_HINT(it.bidNtceNm ?? ""), lowerLimitRate: undefined };
    const chk = tableCheck(bid, basis);
    const lwlt = usableLwlt(basis.lwlt);
    const sheet: EvalSheet = criteriaSheet(bid, basis);
    // 가격 외 점수 만점 (최선) 기준 통과 구간
    const best = { ...DEFAULT_COMPANY, creditGrade: "AAA" as const, pastPerformance: amount * 10, pqScore: 100, techGrade: "T1", techStaff: 99, smallFirm: true, equityRatio: 999, currentRatio: 999 };
    const pr = predict(sheet, { baseAmount: amount, lowerLimitRate: lwlt }, best);
    const win = winners.get(no);
    const group = `${biz} · ${chk.kind} · ${chk.kind === "조달청" ? chk.name : (basis.method ?? "").replace(/^적격심사제-/, "").slice(0, 60)}`;
    rows.push({
      group, kind: chk.kind, status: chk.status, lwlt, tableLower: chk.lowerLimit,
      match: lwlt !== undefined && chk.lowerLimit !== undefined ? Math.abs(lwlt - chk.lowerLimit) <= 0.02 : undefined,
      win, low: pr.rateWindow?.low, high: pr.rateWindow?.high,
      inside: win !== undefined && pr.rateWindow ? win >= pr.rateWindow.low - 0.01 && win <= pr.rateWindow.high + 0.01 : undefined,
    });
  }

  const summarize = (rs: Row[]) => {
    const m = rs.filter((r) => r.match !== undefined);
    const w = rs.filter((r) => r.inside !== undefined);
    return { notices: rs.length, lwltCompared: m.length, lwltMatched: m.filter((r) => r.match).length, winners: w.length, winnersInside: w.filter((r) => r.inside).length };
  };
  const groups = [...new Set(rows.map((r) => r.group))].map((g) => {
    const rs = rows.filter((r) => r.group === g);
    const outside = rs.filter((r) => r.inside === false).slice(0, 3).map((r) => ({ win: r.win, low: r.low, high: r.high }));
    return { group: g, kind: rs[0].kind, status: rs[0].status, ...summarize(rs), tableLower: rs[0].tableLower, lwlt: [...new Set(rs.map((r) => r.lwlt))].filter(Boolean).slice(0, 4), outside };
  }).sort((a, b) => b.notices - a.notices);
  const byKind = Object.fromEntries(["조달청", "행정안전부", "기관 자체", "모름"].map((k) => [k, summarize(rows.filter((r) => r.kind === k))]));
  const result = {
    builtAt: new Date().toISOString(),
    period: { notices: [nFrom, nTo], awards: [aFrom, aTo] },
    total: summarize(rows),
    byKind,
    groups,
  };
  writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ total: result.total, byKind }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
