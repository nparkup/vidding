import type { Digest, KeywordSection, WatchedChange } from "../digest";
import { changeSummary } from "../noticeChanges";
import type { MatchResult } from "../analysis";
import { rank } from "../analysis";
import { date, dday, shortDate, won } from "../format";
import type { Bid, ClientProfile } from "../types";

/** 메일 클라이언트 호환을 위해 인라인 스타일 + 테이블 레이아웃 사용 */
const C = { ink: "#0E1B2C", sub: "#4A5B73", line: "#E3E8EF", mint: "#0FA37F", mintBg: "#EEFAF5", coral: "#E0614A", paper: "#F6F5F1" };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function profileQs(c: ClientProfile) {
  return new URLSearchParams({ lic: c.licenses.join(","), rg: c.regions.join(","), min: String(c.minAmount), max: String(c.maxAmount) }).toString();
}

function shell(title: string, body: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:${C.paper};font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${C.line};border-radius:16px;overflow:hidden">
<tr><td style="background:${C.ink};padding:20px 24px;color:#fff;font-size:18px;font-weight:800">비드매트릭스</td></tr>
<tr><td style="padding:24px">${body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${C.line};font-size:12px;color:${C.sub};line-height:1.6">
본 메일의 분석은 참고용이며 최종 판단은 공고문 원문으로 확인해 주세요.<br>수신 조건 변경은 이 메일에 회신해 주세요.</td></tr>
</table></td></tr></table></body></html>`;
}

function bidRow(r: MatchResult, i: number, qs: string) {
  const b = r.bid;
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.line}">
<a href="${siteUrl()}/bids/${encodeURIComponent(b.id)}?${qs}" style="color:${C.ink};text-decoration:none;font-weight:700;font-size:15px">${i + 1}. ${esc(b.title)}</a>
<div style="font-size:13px;color:${C.sub};margin-top:4px">${esc(b.demandAgency)} · ${won(b.baseAmount)} · ${esc(b.contractMethod)} · ${b.region === "전국" ? "지역제한 없음" : esc(b.region) + " 제한"}</div>
<div style="font-size:13px;margin-top:4px"><b style="color:${C.mint}">가능성 ${r.grade}등급 ${r.score}점</b> · <span style="color:${r.daysLeft <= 3 ? C.coral : C.sub}">마감 ${dday(r.daysLeft)} (${shortDate(b.closeAt)})</span></div>
</td></tr>`;
}

/** 정정·취소 한 건 (바뀐 항목 전후 값) */
function changeRow(w: WatchedChange, qs: string) {
  const c = w.change;
  const link = c.bidId ? `${siteUrl()}/bids/${encodeURIComponent(c.bidId)}?${qs}` : c.detailUrl || "https://www.g2b.go.kr";
  const tag = c.kind === "취소"
    ? `<span style="display:inline-block;background:#FBE3DE;color:${C.coral};font-weight:700;font-size:12px;padding:2px 8px;border-radius:999px">취소</span>`
    : `<span style="display:inline-block;background:#FDF0DA;color:${C.ink};font-weight:700;font-size:12px;padding:2px 8px;border-radius:999px">정정 ${Number(c.ord)}차</span>`;
  const fields = c.fields.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px;font-size:13px">${c.fields.map((f) => `<tr><td style="padding:2px 10px 2px 0;color:${C.sub};white-space:nowrap">${esc(f.field)}</td><td style="padding:2px 0"><span style="color:${C.sub};text-decoration:line-through">${esc(f.before)}</span> → <b>${esc(f.after)}</b></td></tr>`).join("")}</table>`
    : `<div style="font-size:13px;color:${C.sub};margin-top:4px">${esc(changeSummary(c))}</div>`;
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.line}">
<div>${tag} <span style="font-size:12px;color:${C.sub}">${esc(w.reason)} · ${esc(c.demandAgency || c.agency)}</span></div>
<a href="${link}" style="display:block;margin-top:4px;color:${C.ink};text-decoration:none;font-weight:700;font-size:15px">${esc(c.title)}</a>
${fields}</td></tr>`;
}

function changeSection(list: WatchedChange[], qs: string) {
  if (!list.length) return "";
  return `<h2 style="font-size:16px;margin:24px 0 0">관심·추천 공고 정정·취소 ${list.length}건</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list.slice(0, 10).map((w) => changeRow(w, qs)).join("")}</table>
${list.length > 10 ? `<p style="margin:8px 0 0;font-size:13px"><a href="${siteUrl()}/changes" style="color:${C.mint}">외 ${list.length - 10}건 정정·취소 공고 보기</a></p>` : ""}`;
}

function keywordSection(list: KeywordSection[], qs: string) {
  if (!list.length) return "";
  const rows = list.map((k) => {
    const head = `<tr><td style="padding:14px 0 4px"><b style="font-size:14px">"${esc(k.keyword)}"</b> <span style="font-size:13px;color:${C.sub}">새 공고 ${k.fresh}건 · 진행 중 ${k.total}건</span>
<a href="${siteUrl()}/bids?${qs}&q=${encodeURIComponent(k.keyword)}" style="font-size:12px;color:${C.mint};margin-left:6px">전체 보기</a></td></tr>`;
    const items = k.items.length
      ? k.items.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line}">
<a href="${siteUrl()}/bids/${encodeURIComponent(r.bid.id)}?${qs}" style="color:${C.ink};text-decoration:none;font-weight:600;font-size:14px">${esc(r.bid.title)}</a>
<div style="font-size:12px;color:${C.sub};margin-top:2px">${esc(r.bid.demandAgency)} · ${won(r.bid.baseAmount)} · 마감 ${dday(r.daysLeft)} (${shortDate(r.bid.closeAt)}) · ${r.eligible ? `<b style="color:${C.mint}">참가 가능</b>` : `<span style="color:${C.coral}">${esc(r.blockers[0] ?? "조건 확인 필요")}</span>`}</div></td></tr>`).join("")
      : `<tr><td style="padding:6px 0;font-size:13px;color:${C.sub};border-bottom:1px solid ${C.line}">최근 하루 사이 새 공고는 없습니다.</td></tr>`;
    return head + items;
  }).join("");
  return `<h2 style="font-size:16px;margin:24px 0 0">관심 키워드 공고</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

export function dailyDigestMail(d: Digest) {
  const qs = profileQs(d.client);
  const subject = `[비드매트릭스] ${date(new Date().toISOString())} ${d.client.company} 맞춤 공고 ${d.recommended.length}건`;
  const stat = (n: number, label: string, color: string, bg: string) =>
    `<td width="50%" style="padding:4px"><div style="background:${bg};border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:${color}">${n}</div><div style="font-size:12px;color:${C.sub}">${label}</div></div></td>`;
  const body = `
<p style="margin:0 0 4px;font-size:13px;color:${C.sub}">${esc(d.client.contactName || d.client.company)}님, 좋은 아침입니다.</p>
<h1 style="margin:0 0 16px;font-size:20px">오늘 확인하실 공고 ${d.recommended.length}건</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${stat(d.newToday, "신규 적합 공고", C.mint, C.mintBg)}${stat(d.closingSoon.length, "3일 내 마감", C.coral, "#FBE3DE")}
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
${d.recommended.length ? d.recommended.map((r, i) => bidRow(r, i, qs)).join("") : `<tr><td style="padding:16px 0;color:${C.sub}">오늘은 조건에 맞는 신규 공고가 없습니다.</td></tr>`}
</table>
${d.preSpecs.length ? `<h2 style="font-size:16px;margin:24px 0 4px">새로 공개된 사전규격 ${d.preSpecs.length}건</h2>
<p style="margin:0 0 8px;font-size:12px;color:${C.sub}">본공고 전 단계입니다. 규격서를 미리 보고 준비를 시작하세요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.preSpecs.map((p) => `<tr><td style="padding:8px 0;border-top:1px solid #E5E9F0"><div style="font-weight:700;font-size:14px">${esc(p.title)}</div><div style="font-size:12px;color:${C.sub}">${esc(p.demand)}${p.budget ? ` · 배정예산 ${won(p.budget)}` : ""}${p.opinionBy ? ` · 의견 마감 ${esc(p.opinionBy.slice(0, 10))}` : ""}</div></td></tr>`).join("")}</table>
<p style="margin:8px 0 0;font-size:13px"><a href="${siteUrl()}/prespecs" style="color:${C.mint}">사전규격 전체 보기</a></p>` : ""}
${d.orderPlans.length ? `<h2 style="font-size:16px;margin:24px 0 4px">새로 올라온 발주계획 ${d.orderPlans.length}건</h2>
<p style="margin:0 0 8px;font-size:12px;color:${C.sub}">공고 전 예정 단계입니다. 발주 시기와 금액은 바뀔 수 있습니다.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${d.orderPlans.map((p) => `<tr><td style="padding:8px 0;border-top:1px solid #E5E9F0"><div style="font-weight:700;font-size:14px">${esc(p.title)}</div><div style="font-size:12px;color:${C.sub}">${esc(p.agency)} · ${p.month.slice(0, 4)}년 ${Number(p.month.slice(5))}월 발주 예정${p.amount ? ` · ${won(p.amount)}` : ""} · ${esc(p.method)}</div></td></tr>`).join("")}</table>
<p style="margin:8px 0 0;font-size:13px"><a href="${siteUrl()}/plans" style="color:${C.mint}">발주계획 전체 보기</a></p>` : ""}
${changeSection(d.changes, qs)}
${keywordSection(d.keywords, qs)}
<p style="margin:20px 0 0"><a href="${siteUrl()}/bids?${qs}&ok=1" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">전체 추천 공고 보기</a></p>`;
  const text = [
    subject, "",
    ...d.recommended.map((r, i) => `${i + 1}. ${r.bid.title} / ${won(r.bid.baseAmount)} / ${r.grade}등급 / 마감 ${dday(r.daysLeft)}\n   ${siteUrl()}/bids/${r.bid.id}?${qs}`),
    ...(d.changes.length ? ["", `[관심·추천 공고 정정·취소 ${d.changes.length}건]`, ...d.changes.map((w) => `- ${w.change.kind === "취소" ? "취소" : `정정 ${Number(w.change.ord)}차`} ${w.change.title}: ${changeSummary(w.change)}`)] : []),
    ...d.keywords.flatMap((k) => ["", `[키워드 "${k.keyword}" 새 공고 ${k.fresh}건]`, ...k.items.map((r) => `- ${r.bid.title} / ${won(r.bid.baseAmount)} / 마감 ${dday(r.daysLeft)}${r.eligible ? "" : " / 조건 확인 필요"}`)]),
    ...(d.preSpecs.length ? ["", `새로 공개된 사전규격 ${d.preSpecs.length}건`, ...d.preSpecs.map((p) => `- ${p.title} / ${p.demand}${p.budget ? ` / ${won(p.budget)}` : ""}`), `${siteUrl()}/prespecs`] : []),
    ...(d.orderPlans.length ? ["", `새로 올라온 발주계획 ${d.orderPlans.length}건`, ...d.orderPlans.map((p) => `- ${p.title} / ${p.agency} / ${p.month} 발주 예정${p.amount ? ` / ${won(p.amount)}` : ""}`), `${siteUrl()}/plans`] : []),
  ].join("\n");
  return { subject, html: shell(subject, body), text };
}

export function weeklyReportMail(client: ClientProfile, bids: Bid[], weekLabel: string, note: string) {
  const qs = profileQs(client);
  const ok = rank(bids, client).filter((r) => r.eligible);
  const top = ok.slice(0, 5);
  const subject = `[비드매트릭스] ${weekLabel} 주간 분석보고서 · ${client.company}`;
  const body = `
<p style="margin:0;font-size:13px;color:${C.mint};font-weight:700">주간 분석보고서 · ${esc(weekLabel)}</p>
<h1 style="margin:4px 0 16px;font-size:20px">${esc(client.company)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:${C.sub}">참가 가능 공고 <b style="color:${C.ink}">${ok.length}건</b> · 총 규모 <b style="color:${C.ink}">${won(ok.reduce((s, r) => s + r.bid.baseAmount, 0))}</b> · A등급 이상 <b style="color:${C.ink}">${ok.filter((r) => r.grade === "S" || r.grade === "A").length}건</b></p>
${note ? `<div style="border-left:4px solid ${C.mint};background:${C.mintBg};padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.6;margin-bottom:16px"><b style="font-size:12px;color:${C.mint}">담당 매니저 코멘트</b><br>${esc(note)}</div>` : ""}
<h2 style="font-size:16px;margin:0">이번 주 꼭 볼 공고 TOP ${top.length}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top.map((r, i) => bidRow(r, i, qs)).join("")}</table>`;
  return { subject, html: shell(subject, body), text: `${subject}\n\n${top.map((r, i) => `${i + 1}. ${r.bid.title} (${r.grade}등급)`).join("\n")}` };
}

/** 관심·추천 공고가 정정·취소되면 바로 보내는 알림 */
export function changeAlertMail(client: ClientProfile, list: WatchedChange[]) {
  const qs = profileQs(client);
  const cancel = list.filter((w) => w.change.kind === "취소").length;
  const subject = `[비드매트릭스] 관심 공고 ${cancel ? `취소 ${cancel}건${list.length - cancel ? `, 정정 ${list.length - cancel}건` : ""}` : `정정 ${list.length}건`} · ${client.company}`;
  const body = `
<p style="margin:0 0 4px;font-size:13px;color:${C.sub}">${esc(client.contactName || client.company)}님, 살펴보시던 공고가 바뀌었습니다.</p>
<h1 style="margin:0 0 8px;font-size:20px">정정·취소 공고 ${list.length}건</h1>
<p style="margin:0;font-size:13px;color:${C.sub}">금액·마감·참가 자격이 바뀌었으면 투찰 금액과 제출서류를 다시 확인해 주세요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${list.map((w) => changeRow(w, qs)).join("")}</table>`;
  const text = [subject, "", ...list.map((w) => `- ${w.change.kind === "취소" ? "취소" : `정정 ${Number(w.change.ord)}차`} ${w.change.title}\n  ${changeSummary(w.change)}`)].join("\n");
  return { subject, html: shell(subject, body), text };
}
