"use server";

import { redirect } from "next/navigation";
import { addInquiry } from "@/lib/store";
import { LICENSES, REGIONS, type License, type Region } from "@/lib/types";

export async function submitInquiry(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "").trim().slice(0, 500);
  const licenses = form.getAll("licenses").map(String).filter((l): l is License => (LICENSES as readonly string[]).includes(l));
  const regions = form.getAll("regions").map(String).filter((r): r is Region => (REGIONS as string[]).includes(r));
  const [minAmount, maxAmount] = s("size").split("-").map(Number);
  if (!s("company") || !s("email") || !s("phone")) redirect("/apply?error=1");
  const q = addInquiry({
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
