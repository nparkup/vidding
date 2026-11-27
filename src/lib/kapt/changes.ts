import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { aptDetailUrl, type AptBid } from "../apt";
import { CHANGE_DAYS, diffSnapshots, type ChangeSnapshot, type FieldChange, type NoticeChange } from "../noticeChanges";

/**
 * 공동주택(K-apt) 정정·취소 감지.
 *
 * K-apt 공고에는 나라장터 같은 차수가 없다. 2026-11-27 실사이트 자료로 확인한 결과 진행 중 공고 2,291건의 상태(bidState)는
 * 신규공고·재공고뿐이고 수정공고(2)는 0건이었으며, 정정은 새 입찰번호로 "…수정공고", "…공고(수정)" 같은 이름을 달고 올라왔다.
 * 그래서 두 가지로 찾는다.
 * 1. 공고명에 수정·정정·취소 표시가 있는 공고 → 같은 단지(aptCode)의 앞선 공고 중 이름이 가장 비슷한 것과 비교
 * 2. 같은 입찰번호 공고의 마감·현장설명·서류 마감·낙찰방법·공고명이 지난 빌드 때와 달라진 것 (지난 빌드 목록은 .cache/apt 에 둔다)
 * 조달청 번호(R…)로 올라온 공고는 나라장터·누리장터 쪽에서 이미 차수로 추적하므로 뺀다.
 * 목록에서 공고가 사라진 것만으로는 취소로 보지 않는다 (게이트웨이가 쪽을 빠뜨리는 일이 잦다).
 */
const CACHE = ".cache/apt";
const SNAP = "changes-snap-v1.json";
const FOUND = "changes-found-v1.json";

/** 공고명의 정정 표시: "수정공고", "수정 재 공고", "정정 입찰공고", "(수정)", "[정정공고]" */
const MARK = /(?:수정|정정|변경)\s*(?:재\s*)?(?:입찰\s*)?공\s*고|[([]\s*(?:수정|정정)(?:\s*공고)?\s*[)\]]/;
/** 공고명의 취소 표시: "취소공고", "공고 취소", "(취소)" */
const CANCEL = /취소\s*공\s*고|공고\s*취소|[([]\s*취소\s*[)\]]/;

const tracked = (b: AptBid) => !/^R\d/.test(b.no);

function readJson<T>(name: string): T | undefined {
  try { const f = join(CACHE, name); return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : undefined; } catch { return undefined; }
}
function writeJson(name: string, v: unknown) {
  try { mkdirSync(CACHE, { recursive: true }); writeFileSync(join(CACHE, name), JSON.stringify(v)); } catch { /* 캐시는 없어도 된다 */ }
}

const snap = (b: AptBid): ChangeSnapshot => ({
  title: b.title, closeAt: b.closeAt, award: b.award, contract: b.kind,
  briefingAt: b.briefingAt ?? null, docsBy: b.docsBy ?? null,
});

/** 비교용 이름: 정정·취소·재공고 표시와 흔한 낱말, 공백·괄호를 뺀다 */
export function baseTitle(t: string): string {
  return t.replace(MARK, "").replace(CANCEL, "").replace(/\(?\s*재\s*\)?\s*공\s*고|재입찰/g, "")
    .replace(/입찰|공고|선정|업체|사업자|모집|안내|[\s()[\]·,.\-_'"]/g, "");
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}
/** 두 이름이 얼마나 비슷한지 (0~1, 바이그램 다이스 계수. 한쪽이 다른 쪽을 품으면 1) */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const x = bigrams(a), y = bigrams(b);
  let hit = 0, n = 0;
  for (const [g, c] of x) { hit += Math.min(c, y.get(g) ?? 0); n += c; }
  for (const c of y.values()) n += c;
  return n ? (2 * hit) / n : 0;
}

/** K-apt 입찰번호(yyyyMMddHHmmssSSS)는 등록 시각이다. 아니면 공고일 */
function postedIso(b: AptBid): string {
  const m = b.no.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d{3}$/);
  if (m && m[1] >= "2000" && m[2] <= "12") return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`).toISOString();
  return new Date(`${b.postedAt}T00:00:00+09:00`).toISOString();
}

const bizOf = (b: AptBid): NoticeChange["bizType"] => (b.category === "공사" ? "공사" : b.category === "물품·기타" ? "물품" : "용역");

function toChange(b: AptBid, kind: "정정" | "취소", at: string, live: Set<string>, prev?: AptBid, fields: FieldChange[] = []): NoticeChange {
  return {
    source: "공동주택", no: b.no, ord: "", prevOrd: prev?.no, kind, at,
    title: b.title, agency: b.apt, demandAgency: b.apt,
    bizType: bizOf(b), category: b.category as NoticeChange["category"],
    closeAt: b.closeAt, fields,
    href: live.has(b.no) ? `/apt-bids/view?no=${encodeURIComponent(b.no)}` : undefined,
    detailUrl: b.link ?? aptDetailUrl(b.no),
  };
}

/** 공고명 표시로 찾은 정정·취소 (앞선 공고와 비교) */
export function markedChanges(all: AptBid[], live: Set<string>, now = Date.now()): NoticeChange[] {
  const since = now - CHANGE_DAYS * 864e5;
  const byApt = new Map<string, AptBid[]>();
  for (const b of all) if (b.aptCode && tracked(b)) (byApt.get(b.aptCode) ?? byApt.set(b.aptCode, []).get(b.aptCode)!).push(b);
  const out: NoticeChange[] = [];
  for (const b of all) {
    if (!tracked(b)) continue;
    const kind = CANCEL.test(b.title) ? "취소" : MARK.test(b.title) || b.state === "수정공고" ? "정정" : null;
    if (!kind) continue;
    const at = postedIso(b);
    if (new Date(at).getTime() < since) continue;
    const me = baseTitle(b.title);
    let best: { b: AptBid; s: number } | undefined;
    for (const c of byApt.get(b.aptCode) ?? []) {
      if (c.no === b.no || postedIso(c) > at) continue;
      const s = similarity(me, baseTitle(c.title)) + (c.category === b.category ? 0.05 : 0);
      if (s >= 0.6 && (!best || s > best.s || (s === best.s && postedIso(c) > postedIso(best.b)))) best = { b: c, s };
    }
    const prev = best?.b;
    out.push(toChange(b, kind, at, live, prev, kind === "정정" && prev ? diffSnapshots(snap(prev), snap(b)).filter((f) => f.field !== "공고명") : []));
  }
  return out;
}

/**
 * 같은 입찰번호 공고가 지난 빌드 때와 달라진 것. 찾은 내역은 CHANGE_DAYS 동안 캐시에 남겨 다음 빌드에도 보여 준다.
 * complete 가 아니면(이번 조회에서 빠진 쪽이 있으면) 목록을 저장하지 않는다.
 */
export function detectedChanges(open: AptBid[], complete: boolean, live: Set<string>, now = Date.now()): { items: NoticeChange[]; compared: number; hadSnapshot: boolean } {
  const prev = readJson<{ at: string; items: Record<string, ChangeSnapshot> }>(SNAP);
  const found = (readJson<NoticeChange[]>(FOUND) ?? []).filter((c) => new Date(c.at).getTime() >= now - CHANGE_DAYS * 864e5);
  const at = new Date(now).toISOString();
  let compared = 0;
  const cur: Record<string, ChangeSnapshot> = {};
  for (const b of open) {
    if (!tracked(b)) continue;
    const s = snap(b);
    cur[b.no] = s;
    const p = prev?.items[b.no];
    if (!p) continue;
    compared++;
    const fields = diffSnapshots(p, s);
    if (!fields.length) continue;
    const sig = `${b.no}|${JSON.stringify(fields)}`;
    if (found.some((c) => `${c.no}|${JSON.stringify(c.fields)}` === sig)) continue;
    found.push({ ...toChange(b, "정정", at, live, undefined, fields), prevOrd: undefined, detected: true });
  }
  if (complete) writeJson(SNAP, { at, items: cur });
  writeJson(FOUND, found);
  // 진행 중 여부·상세 주소는 이번 빌드 기준으로 다시 붙인다
  const items = found.map((c) => ({ ...c, href: live.has(c.no) ? `/apt-bids/view?no=${encodeURIComponent(c.no)}` : undefined }));
  return { items, compared, hadSnapshot: !!prev };
}

/** 공동주택 정정·취소 전체. 공고명 표시로 찾은 것과 같은 공고번호의 변경으로 찾은 것을 모두 돌려준다 */
export function aptChanges(all: AptBid[], open: AptBid[], complete: boolean, now = Date.now()): { items: NoticeChange[]; log: string } {
  const live = new Set(open.map((b) => b.no));
  const marked = markedChanges(all, live, now);
  const det = detectedChanges(open, complete, live, now);
  const items = [...marked, ...det.items].sort((a, b) => b.at.localeCompare(a.at));
  const log = `공동주택 정정·취소: 공고명 수정 표시 ${marked.filter((c) => c.kind === "정정").length}건(앞선 공고 찾음 ${marked.filter((c) => c.prevOrd).length}건, 바뀐 항목 비교 ${marked.filter((c) => c.fields.length).length}건), 취소 표시 ${marked.filter((c) => c.kind === "취소").length}건, 같은 공고번호 변경 ${det.items.length}건(지난 빌드와 비교 ${det.compared.toLocaleString()}건${det.hadSnapshot ? "" : ", 지난 목록 없음: 다음 빌드부터 비교"}${complete ? "" : ", 이번 조회에 빠진 쪽이 있어 목록 저장 안 함"})`;
  return { items, log };
}
