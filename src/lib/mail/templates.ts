import type { Digest } from "../digest";
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
<tr><td style="background:${C.ink};padding:20px 24px;color:#fff;font-size:18px;font-weight:800">✔ 입찰파트너</td></tr>
<tr><td style="padding:24px">${body}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${C.line};font-size:12px;color:${C.sub};line-height:1.6">
본 메일의 분석은 참고용이며 최종 판단은 공고문 원문으로 확인해 주세요. 공고 데이터 출처: 조달청 나라장터(공공데이터포털).<br>수신 조건 변경은 담당 매니저에게 회신해 주세요.</td></tr>
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

export function dailyDigestMail(d: Digest) {
  const qs = profileQs(d.client);
  const subject = `[입찰파트너] ${date(new Date().toISOString())} ${d.client.company} 맞춤 공고 ${d.recommended.length}건`;
  const stat = (n: number, label: string, color: string, bg: string) =>
    `<td width="33%" style="padding:4px"><div style="background:${bg};border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:${color}">${n}</div><div style="font-size:12px;color:${C.sub}">${label}</div></div></td>`;
  const body = `
<p style="margin:0 0 4px;font-size:13px;color:${C.sub}">${esc(d.client.contactName || d.client.company)}님, 좋은 아침입니다.</p>
<h1 style="margin:0 0 16px;font-size:20px">오늘 확인하실 공고 ${d.recommended.length}건</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${stat(d.newToday, "신규 적합 공고", C.mint, C.mintBg)}${stat(d.closingSoon.length, "3일 내 마감", C.coral, "#FBE3DE")}${stat(d.excluded, "조건 불일치 제외", C.sub, C.paper)}
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
${d.recommended.length ? d.recommended.map((r, i) => bidRow(r, i, qs)).join("") : `<tr><td style="padding:16px 0;color:${C.sub}">오늘은 조건에 맞는 신규 공고가 없습니다.</td></tr>`}
</table>
<p style="margin:20px 0 0"><a href="${siteUrl()}/bids?${qs}&ok=1" style="display:inline-block;background:${C.ink};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">전체 추천 공고 보기</a></p>`;
  const text = [subject, "", ...d.recommended.map((r, i) => `${i + 1}. ${r.bid.title} / ${won(r.bid.baseAmount)} / ${r.grade}등급 / 마감 ${dday(r.daysLeft)}\n   ${siteUrl()}/bids/${r.bid.id}?${qs}`)].join("\n");
  return { subject, html: shell(subject, body), text };
}

export function weeklyReportMail(client: ClientProfile, bids: Bid[], weekLabel: string, note: string) {
  const qs = profileQs(client);
  const ok = rank(bids, client).filter((r) => r.eligible);
  const top = ok.slice(0, 5);
  const subject = `[입찰파트너] ${weekLabel} 주간 분석보고서 · ${client.company}`;
  const body = `
<p style="margin:0;font-size:13px;color:${C.mint};font-weight:700">주간 분석보고서 · ${esc(weekLabel)}</p>
<h1 style="margin:4px 0 16px;font-size:20px">${esc(client.company)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:${C.sub}">참가 가능 공고 <b style="color:${C.ink}">${ok.length}건</b> · 총 규모 <b style="color:${C.ink}">${won(ok.reduce((s, r) => s + r.bid.baseAmount, 0))}</b> · A등급 이상 <b style="color:${C.ink}">${ok.filter((r) => r.grade === "S" || r.grade === "A").length}건</b></p>
${note ? `<div style="border-left:4px solid ${C.mint};background:${C.mintBg};padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.6;margin-bottom:16px"><b style="font-size:12px;color:${C.mint}">담당 매니저 코멘트</b><br>${esc(note)}</div>` : ""}
<h2 style="font-size:16px;margin:0">이번 주 꼭 볼 공고 TOP ${top.length}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${top.map((r, i) => bidRow(r, i, qs)).join("")}</table>`;
  return { subject, html: shell(subject, body), text: `${subject}\n\n${top.map((r, i) => `${i + 1}. ${r.bid.title} (${r.grade}등급)`).join("\n")}` };
}
