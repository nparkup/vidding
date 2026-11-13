import "server-only";
import type { AppSettings, Bid, BidAttachment, ClientProfile, Inquiry, MailLog, WeeklyReport } from "./types";
import { adapter } from "./db";
import type { EvalSheet } from "./evalscore";
import type { AwardStats } from "./rivalRate";
import { buildMockBids } from "./mock/bids";
import { SEED_CLIENTS, SEED_INQUIRIES, SEED_REPORTS } from "./mock/seed";
import { fetchAllBids, hasServiceKey } from "./nara/client";

/**
 * 데이터 저장소.
 * - 고객사·상담·보고서·발송기록·설정: lib/db 어댑터(PostgreSQL 또는 JSON 파일)에 영구 저장
 * - 공고: 나라장터에서 다시 받을 수 있으므로 메모리 캐시
 */

/* ---------- 데모 시드 ---------- */
const g = globalThis as unknown as { __ipchalSeeded?: Promise<void>; __ipchalBids?: BidCache };

function ensureSeeded(): Promise<void> {
  if (process.env.SEED_DEMO === "false") return Promise.resolve();
  g.__ipchalSeeded ??= (async () => {
    const db = adapter();
    if (await db.isEmpty("clients")) for (const c of SEED_CLIENTS) await db.put("clients", c, c.joinedAt);
    if (await db.isEmpty("inquiries")) for (const q of SEED_INQUIRIES) await db.put("inquiries", q, q.createdAt);
    if (await db.isEmpty("reports")) for (const r of SEED_REPORTS) await db.put("reports", r, r.createdAt);
  })();
  return g.__ipchalSeeded;
}

async function col<T>(name: Parameters<ReturnType<typeof adapter>["list"]>[0]) {
  await ensureSeeded();
  return adapter().list<T>(name);
}
async function one<T>(name: Parameters<ReturnType<typeof adapter>["get"]>[0], id: string) {
  await ensureSeeded();
  return adapter().get<T>(name, id);
}

export const storageKind = () => adapter().kind;

/* ---------- 공고 ---------- */
interface BidCache { items: Bid[]; attachments?: Record<string, BidAttachment[]>; sheets?: Record<string, { sheet: EvalSheet; file: string }>; awardStats?: AwardStats; syncedAt: string; source: "mock" | "g2b"; error?: string }
const STALE_MS = 30 * 60 * 1000;

function bidCache(): BidCache {
  g.__ipchalBids ??= { items: buildMockBids(), syncedAt: new Date(0).toISOString(), source: "mock" };
  return g.__ipchalBids;
}

/** 정적 빌드(GitHub Pages): scripts/fetch-bids.ts 가 미리 받아 둔 파일을 그대로 사용 */
function fileBids(): BidCache | null {
  const f = process.env.BIDS_FILE;
  if (!f) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs") as typeof import("fs");
  return JSON.parse(fs.readFileSync(f, "utf8")) as BidCache;
}

export async function getBids(): Promise<Bid[]> {
  const fromFile = fileBids();
  if (fromFile) {
    g.__ipchalBids = fromFile;
    return fromFile.items;
  }
  const c = bidCache();
  const stale = Date.now() - new Date(c.syncedAt).getTime() > STALE_MS;
  if (stale) {
    const first = new Date(c.syncedAt).getTime() === 0;
    // 첫 수집만 기다리고, 이후에는 캐시를 바로 보여주며 백그라운드에서 갱신
    if (first) await syncBids();
    else void syncBids().catch(() => {});
  }
  return bidCache().items;
}

/** 공고별 첨부파일 목록 (정적 빌드에서 미리 받아 둔 것). 서버 배포에서는 /api/premium/attachments 로 공고마다 조회 */
let sheetMemo: Record<string, { sheet: EvalSheet; file: string }> | null = null;
/** 빌드 때 첨부에서 미리 추출한 평가표 */
export async function getExtractedSheets(): Promise<Record<string, { sheet: EvalSheet; file: string }>> {
  if (!process.env.BIDS_FILE) return {};
  sheetMemo ??= fileBids()?.sheets ?? {};
  return sheetMemo;
}

let awardMemo: AwardStats | null | undefined;
/** 빌드 때 만든 전년도 낙찰률 통계 (없으면 null) */
export async function getAwardStats(): Promise<AwardStats | null> {
  if (!process.env.BIDS_FILE) return null;
  if (awardMemo === undefined) awardMemo = fileBids()?.awardStats ?? null;
  return awardMemo;
}

let attachMemo: Record<string, BidAttachment[]> | null = null;
export async function getAttachments(): Promise<Record<string, BidAttachment[]>> {
  if (!process.env.BIDS_FILE) return {};
  attachMemo ??= fileBids()?.attachments ?? {};
  return attachMemo;
}

export async function getBid(id: string): Promise<Bid | undefined> {
  return (await getBids()).find((b) => b.id === id);
}

let inflight: Promise<BidCache> | null = null;

export function syncBids(): Promise<BidCache> {
  inflight ??= doSync().finally(() => { inflight = null; });
  return inflight;
}

async function doSync(): Promise<BidCache> {
  if (!hasServiceKey()) {
    g.__ipchalBids = { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock" };
    return g.__ipchalBids;
  }
  try {
    const items = await fetchAllBids();
    g.__ipchalBids = { items, syncedAt: new Date().toISOString(), source: "g2b" };
  } catch (e) {
    // API 실패 시 목업으로 서비스 유지 (오류는 관리자 화면에 표시)
    g.__ipchalBids = { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock", error: (e as Error).message };
  }
  return g.__ipchalBids;
}

export function getSyncInfo() {
  const { syncedAt, source, error, items } = bidCache();
  return { syncedAt, source, error, count: items.length, hasKey: hasServiceKey() };
}

/* ---------- 고객사 ---------- */
export const listClients = () => col<ClientProfile>("clients");
export const getClient = (id: string) => one<ClientProfile>("clients", id);

export async function upsertClient(c: ClientProfile) {
  await ensureSeeded();
  await adapter().put("clients", c, c.joinedAt);
}

export async function toggleWatch(clientId: string, bidId: string) {
  const c = await getClient(clientId);
  if (!c) return;
  c.watchlist = c.watchlist.includes(bidId) ? c.watchlist.filter((x) => x !== bidId) : [...c.watchlist, bidId];
  await upsertClient(c);
}

/* ---------- 상담 신청 ---------- */
export const listInquiries = () => col<Inquiry>("inquiries");
export const getInquiry = (id: string) => one<Inquiry>("inquiries", id);

export async function addInquiry(q: Omit<Inquiry, "id" | "createdAt" | "status">): Promise<Inquiry> {
  await ensureSeeded();
  const item: Inquiry = { ...q, id: `q-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), status: "신규" };
  await adapter().put("inquiries", item, item.createdAt);
  return item;
}

export async function setInquiryStatus(id: string, status: Inquiry["status"]) {
  const q = await getInquiry(id);
  if (q) await adapter().put("inquiries", { ...q, status });
}

/* ---------- 주간 보고서 ---------- */
export const listReports = () => col<WeeklyReport>("reports");
export const getReport = (id: string) => one<WeeklyReport>("reports", id);

export async function addReport(r: Omit<WeeklyReport, "id" | "createdAt">): Promise<WeeklyReport> {
  await ensureSeeded();
  const item: WeeklyReport = { ...r, id: `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() };
  await adapter().put("reports", item, item.createdAt);
  return item;
}

export async function setReportStatus(id: string, status: WeeklyReport["status"]) {
  const r = await getReport(id);
  if (r) await adapter().put("reports", { ...r, status });
}

/* ---------- 메일 발송 기록 ---------- */
export const listMailLog = () => col<MailLog>("mail_log");

export async function addMailLog(m: Omit<MailLog, "id" | "createdAt">): Promise<MailLog> {
  const item: MailLog = { ...m, id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() };
  await adapter().put("mail_log", item, item.createdAt);
  return item;
}

/* ---------- 설정 ---------- */
const DEFAULT_SETTINGS: AppSettings = { sendHour: 7, sendOnWeekdaysOnly: true };

export async function getSettings(): Promise<AppSettings> {
  const s = await adapter().get<AppSettings & { id: string }>("settings", "app");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function updateSettings(s: Partial<AppSettings>) {
  const cur = await getSettings();
  await adapter().put("settings", { id: "app", ...cur, ...s });
}
