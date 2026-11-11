import type { Metadata } from "next";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplyLayout } from "@/components/ApplyLayout";
import { submitInquiry } from "./actions";

export const metadata: Metadata = { title: "무료 진단 신청" };

export default async function Apply({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const sp = await searchParams;
  return (
    <ApplyLayout>
      <ApplyForm action={submitInquiry} error={!!sp.error} plan={sp.plan} />
    </ApplyLayout>
  );
}
