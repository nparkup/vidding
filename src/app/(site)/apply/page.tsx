import type { Metadata } from "next";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplyLayout } from "@/components/ApplyLayout";
import { submitInquiry } from "./actions";

export const metadata: Metadata = { title: "2주 무료 체험 신청" };

export default async function Apply({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const sp = await searchParams;
  return (
    <ApplyLayout>
      <ApplyForm action={submitInquiry} error={!!sp.error} plan={sp.plan} />
    </ApplyLayout>
  );
}
