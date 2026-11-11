/**
 * GitHub Pages(정적 배포)용 무료 진단 신청 페이지.
 * scripts/build-static.mjs 가 빌드 시 app/(site)/apply/page.tsx 자리에 복사한다.
 * 서버가 없으므로 접수 저장 대신 브라우저에서 진단 결과를 보여주고 메일 앱으로 신청 내용을 보낸다.
 */
import type { Metadata } from "next";
import { ApplyForm } from "@/components/ApplyForm";
import { ApplyLayout } from "@/components/ApplyLayout";

export const metadata: Metadata = { title: "무료 진단 신청" };

export default function Apply() {
  return (
    <ApplyLayout>
      <ApplyForm email={process.env.NEXT_PUBLIC_APPLY_EMAIL || "hello@ipchalmatelab.kr"} />
    </ApplyLayout>
  );
}
