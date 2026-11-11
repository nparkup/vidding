"use server";

import { redirect } from "next/navigation";
import { addInquiry } from "@/lib/store";
import { REGIONS, type License, type Region } from "@/lib/types";
import { normalizeLicense } from "@/lib/licenses";

export async function submitInquiry(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "").trim().slice(0, 500);
  const licenses = [...new Set(form.getAll("licenses").map((l) => normalizeLicense(String(l))).filter((l) => l && l.length <= 60))].slice(0, 40) as License[];
  const regions = form.getAll("regions").map(String).filter((r): r is Region => (REGIONS as string[]).includes(r));
  const [minAmount, maxAmount] = s("size").split("-").map(Number);
  if (!s("company") || !s("email") || !s("phone")) redirect("/apply?error=1");
  const q = await addInquiry({
    company: s("company"),
    contactName: s("contactName"),
    email: s("email"),
    phone: s("phone"),
    licenses,
    regions,
    minAmount: minAmount || 0,
    maxAmount: maxAmount || 10_000_000_000,
    message: s("message"),
  });
  redirect(`/apply/done?id=${q.id}`);
}
