import "server-only";
import type { Bid, ClientProfile, Inquiry, WeeklyReport } from "./types";
import { buildMockBids } from "./mock/bids";
import { SEED_CLIENTS, SEED_INQUIRIES, SEED_REPORTS } from "./mock/seed";
import { fetchFacilityBids, hasServiceKey } from "./nara/client";

/**
 * 간이 데이터 저장소 (프로세스 메모리).
 * 운영 전환 시 이 파일의 함수 시그니처를 유지한 채 DB(PostgreSQL 등)로 교체하면 된다.
 */
interface DB {
  clients: ClientProfile[];
  inquiries: Inquiry[];
  reports: WeeklyReport[];
  bids: { items: Bid[]; syncedAt: string; source: "mock" | "g2b"; error?: string };
  settings: { sendHour: number; sendOnWeekdaysOnly: boolean };
}

const g = globalThis as unknown as { __ipchalDB?: DB };

function db(): DB {
  if (!g.__ipchalDB) {
    g.__ipchalDB = {
      clients: structuredClone(SEED_CLIENTS),
      inquiries: structuredClone(SEED_INQUIRIES),
      reports: structuredClone(SEED_REPORTS),
      bids: { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock" },
      settings: { sendHour: 7, sendOnWeekdaysOnly: true },
    };
  }
  return g.__ipchalDB;
}

/* ---------- 공고 ---------- */
const STALE_MS = 30 * 60 * 1000;

export async function getBids(): Promise<Bid[]> {
  const d = db();
  const stale = Date.now() - new Date(d.bids.syncedAt).getTime() > STALE_MS;
  if (hasServiceKey() && (d.bids.source === "mock" || stale) && !d.bids.error) {
    await syncBids();
  } else if (!hasServiceKey() && stale) {
    d.bids = { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock" };
  }
  return d.bids.items;
}

export async function getBid(id: string): Promise<Bid | undefined> {
  return (await getBids()).find((b) => b.id === id);
}

export async function syncBids(): Promise<DB["bids"]> {
  const d = db();
  if (!hasServiceKey()) {
    d.bids = { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock" };
    return d.bids;
  }
  try {
    const items = await fetchFacilityBids(72);
    d.bids = { items, syncedAt: new Date().toISOString(), source: "g2b" };
  } catch (e) {
    // API 실패 시 목업으로 서비스 유지
    d.bids = { items: buildMockBids(), syncedAt: new Date().toISOString(), source: "mock", error: (e as Error).message };
  }
  return d.bids;
}

export function getSyncInfo() {
  const { syncedAt, source, error, items } = db().bids;
  return { syncedAt, source, error, count: items.length, hasKey: hasServiceKey() };
}

/* ---------- 고객사 ---------- */
export const listClients = () => db().clients;
export const getClient = (id: string) => db().clients.find((c) => c.id === id);

export function upsertClient(c: ClientProfile) {
  const d = db();
  const i = d.clients.findIndex((x) => x.id === c.id);
  if (i >= 0) d.clients[i] = c;
  else d.clients.unshift(c);
}

export function toggleWatch(clientId: string, bidId: string) {
  const c = getClient(clientId);
  if (!c) return;
  c.watchlist = c.watchlist.includes(bidId) ? c.watchlist.filter((x) => x !== bidId) : [...c.watchlist, bidId];
}

/* ---------- 상담 신청 ---------- */
export const listInquiries = () => db().inquiries;
export const getInquiry = (id: string) => db().inquiries.find((q) => q.id === id);

export function addInquiry(q: Omit<Inquiry, "id" | "createdAt" | "status">): Inquiry {
  const item: Inquiry = { ...q, id: `q-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), status: "신규" };
  db().inquiries.unshift(item);
  return item;
}

export function setInquiryStatus(id: string, status: Inquiry["status"]) {
  const q = getInquiry(id);
  if (q) q.status = status;
}

/* ---------- 주간 보고서 ---------- */
export const listReports = () => db().reports;
export const getReport = (id: string) => db().reports.find((r) => r.id === id);

export function addReport(r: Omit<WeeklyReport, "id" | "createdAt">): WeeklyReport {
  const item: WeeklyReport = { ...r, id: `r-${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  db().reports.unshift(item);
  return item;
}

export function setReportStatus(id: string, status: WeeklyReport["status"]) {
  const r = getReport(id);
  if (r) r.status = status;
}

/* ---------- 설정 ---------- */
export const getSettings = () => db().settings;
export function updateSettings(s: Partial<DB["settings"]>) {
  Object.assign(db().settings, s);
}
