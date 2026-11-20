import "server-only";
import { buildDigest, changesFor } from "./digest";
import { rank } from "./analysis";
import { keywordHits } from "./keywords";
import { isBusinessDay, kstDay } from "./holidays";
import { changeAlertMail, dailyDigestMail, weeklyReportMail } from "./mail/templates";
import { sendMail } from "./mail/send";
import { addMailLog, addReport, getBids, getClient, getNoticeChanges, getPreSpecs, getReport, getSettings, listClients, listMailLog, setReportStatus, syncBids } from "./store";

/** 영업일 아침 맞춤 공고 메일을 활성·체험 고객사 전체에 발송 */
export async function runDailyDigest(opts: { force?: boolean } = {}) {
  const settings = await getSettings();
  if (!opts.force && settings.sendOnWeekdaysOnly && !isBusinessDay()) {
    return { skipped: "영업일 아님", sent: 0 };
  }
  // 같은 날 중복 발송 방지
  const today = kstDay().ymd;
  const already = new Set((await listMailLog()).filter((m) => m.kind === "daily" && kstDay(new Date(m.createdAt)).ymd === today && m.status === "발송").map((m) => m.clientId));

  await syncBids();
  const bids = await getBids();
  const clients = (await listClients()).filter((c) => c.status !== "일시중지");
  const results = [];
  for (const c of clients) {
    if (already.has(c.id) && !opts.force) continue;
    results.push(await sendDigestTo(c.id, bids, "daily"));
  }
  return { sent: results.filter((r) => r?.status === "발송").length, total: results.length, results };
}

export async function sendDigestTo(clientId: string, bidsArg?: Awaited<ReturnType<typeof getBids>>, kind: "daily" | "test" = "test") {
  const c = await getClient(clientId);
  if (!c) return null;
  const bids = bidsArg ?? (await getBids());
  const d = buildDigest(c, bids, new Date(), await getPreSpecs(), await getNoticeChanges());
  const mail = dailyDigestMail(d);
  const r = await sendMail(c.email, mail.subject, mail.html, mail.text);
  return addMailLog({ kind, clientId: c.id, to: c.email, subject: mail.subject, status: r.status, error: r.error, itemCount: d.recommended.length });
}

/**
 * 정정·취소 바로 알림: 고객의 관심 공고·참가 가능 공고·관심 키워드 공고가 정정되거나 취소되면 알림 메일을 보낸다.
 * 매시 호출 권장 (/api/cron/changes). 같은 공고 차수는 한 번만 보낸다 (발송 기록의 refs).
 * 영업일 여부와 상관없이 보낸다 (주말에 마감이 당겨지는 정정도 있다).
 */
export async function runChangeAlerts(opts: { sinceHours?: number } = {}) {
  await syncBids();
  const bids = await getBids();
  const changes = await getNoticeChanges();
  const since = Date.now() - (opts.sinceHours ?? 48) * 3600 * 1000;
  const recent = changes.filter((c) => new Date(c.at).getTime() >= since);
  if (!recent.length) return { sent: 0, total: 0, changes: 0 };
  const log = await listMailLog();
  const results = [];
  for (const c of (await listClients()).filter((x) => x.status !== "일시중지")) {
    const done = new Set(log.filter((m) => m.clientId === c.id && m.kind === "change" && m.status !== "실패").flatMap((m) => m.refs ?? []));
    const eligible = new Set(rank(bids, c).filter((r) => r.eligible).map((r) => r.bid.id));
    const kwNos = new Set(keywordHits(bids, c.keywords ?? []).flatMap((h) => h.bids.map((b) => b.bidNtceNo)));
    const list = changesFor(c, recent, eligible, kwNos).filter((w) => !done.has(`${w.change.no}-${w.change.ord}`));
    if (!list.length) continue;
    const mail = changeAlertMail(c, list);
    const r = await sendMail(c.email, mail.subject, mail.html, mail.text);
    results.push(await addMailLog({ kind: "change", clientId: c.id, to: c.email, subject: mail.subject, status: r.status, error: r.error, itemCount: list.length, refs: list.map((w) => `${w.change.no}-${w.change.ord}`) }));
  }
  return { sent: results.filter((r) => r.status === "발송").length, total: results.length, changes: recent.length };
}

/** 주간 보고서 메일 발송 */
export async function sendWeeklyReport(reportId: string) {
  const r = await getReport(reportId);
  const c = r ? await getClient(r.clientId) : undefined;
  if (!r || !c) return null;
  const mail = weeklyReportMail(c, await getBids(), r.weekLabel, r.note);
  const res = await sendMail(c.email, mail.subject, mail.html, mail.text);
  if (res.status !== "실패") await setReportStatus(r.id, "발송완료");
  return addMailLog({ kind: "weekly", clientId: c.id, to: c.email, subject: mail.subject, status: res.status, error: res.error, itemCount: 5 });
}

/** 매주 월요일: 프로·파트너 고객사 보고서 초안 자동 생성 (매니저가 코멘트 후 발송) */
export async function createWeeklyDrafts() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const weekLabel = `${k.getUTCMonth() + 1}월 ${Math.ceil(k.getUTCDate() / 7)}주차`;
  const clients = (await listClients()).filter((c) => c.plan !== "basic" && c.status !== "일시중지");
  const made = [];
  for (const c of clients) made.push(await addReport({ clientId: c.id, weekLabel, note: "", status: "초안", highlightBidIds: [] }));
  return { created: made.length, weekLabel };
}
