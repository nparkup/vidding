"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminPassword, sessionToken } from "@/lib/auth";
import {
  addReport, getClient, getInquiry, setInquiryStatus, syncBids, toggleWatch, updateSettings, upsertClient,
} from "@/lib/store";
import { runDailyDigest, sendDigestTo, sendWeeklyReport } from "@/lib/jobs";
import { normalizeLicense } from "@/lib/licenses";
import { REGIONS, CATEGORIES, type ClientProfile, type Inquiry, type License, type Region, type ServiceCategory, type PlanId } from "@/lib/types";

async function guard() {
  const c = await cookies();
  if (c.get(ADMIN_COOKIE)?.value !== (await sessionToken())) redirect("/admin/login");
}

export async function login(form: FormData) {
  const pw = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");
  if (pw !== adminPassword()) redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(ADMIN_COOKIE, await sessionToken(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function runSync() {
  await guard();
  await syncBids();
  revalidatePath("/admin", "layout");
}

export async function toggleWatchAction(clientId: string, bidId: string) {
  await guard();
  await toggleWatch(clientId, bidId);
  revalidatePath(`/admin/clients/${clientId}`);
}

function parseClient(form: FormData, base?: ClientProfile): ClientProfile {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  return {
    id: base?.id ?? `c-${Date.now().toString(36)}`,
    company: s("company"),
    contactName: s("contactName"),
    email: s("email"),
    phone: s("phone"),
    licenses: [...new Set(form.getAll("licenses").map((l) => normalizeLicense(String(l))).filter((l) => l && l.length <= 60))].slice(0, 40) as License[],
    regions: form.getAll("regions").map(String).filter((r): r is Region => (REGIONS as string[]).includes(r)),
    categories: form.getAll("categories").map(String).filter((c): c is ServiceCategory => (CATEGORIES as string[]).includes(c)),
    minAmount: Number(s("minAmount")) * 10000 || 0,
    maxAmount: Number(s("maxAmount")) * 10000 || 10_000_000_000,
    pastPerformance: Number(s("pastPerformance")) * 10000 || 0,
    creditGrade: (s("creditGrade") || "BBB") as ClientProfile["creditGrade"],
    plan: (s("plan") || "basic") as PlanId,
    status: (s("status") || "체험") as ClientProfile["status"],
    joinedAt: base?.joinedAt ?? new Date().toISOString(),
    watchlist: base?.watchlist ?? [],
  };
}

export async function saveClient(form: FormData) {
  await guard();
  const id = String(form.get("id") ?? "");
  const base = id ? await getClient(id) : undefined;
  const c = parseClient(form, base);
  await upsertClient(c);
  const fromInquiry = String(form.get("fromInquiry") ?? "");
  if (fromInquiry) await setInquiryStatus(fromInquiry, "체험전환");
  revalidatePath("/admin", "layout");
  redirect(`/admin/clients/${c.id}`);
}

export async function setInquiryStatusAction(id: string, status: Inquiry["status"]) {
  await guard();
  if (await getInquiry(id)) await setInquiryStatus(id, status);
  revalidatePath("/admin/inquiries");
}

export async function createReport(form: FormData) {
  await guard();
  const r = await addReport({
    clientId: String(form.get("clientId")),
    weekLabel: String(form.get("weekLabel") || "이번 주"),
    note: String(form.get("note") ?? ""),
    status: "초안",
    highlightBidIds: [],
  });
  revalidatePath("/admin/reports");
  redirect(`/admin/reports/${r.id}`);
}

export async function sendReport(id: string) {
  await guard();
  await sendWeeklyReport(id);
  revalidatePath(`/admin/reports/${id}`);
  revalidatePath("/admin/reports");
}

export async function saveSettings(form: FormData) {
  await guard();
  await updateSettings({ sendHour: Number(form.get("sendHour") ?? 7), sendOnWeekdaysOnly: form.get("weekdays") === "on" });
  revalidatePath("/admin/settings");
}

export async function sendTestDigest(clientId: string) {
  await guard();
  await sendDigestTo(clientId);
  revalidatePath("/admin", "layout");
}

export async function runDailyNow() {
  await guard();
  await runDailyDigest({ force: true });
  revalidatePath("/admin", "layout");
}
