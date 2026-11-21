/**
 * GitHub Pages(정적 배포)용 관리자 화면: 무료 체험 가입자 목록.
 * scripts/build-static.mjs 가 서버용 관리자(src/app/admin)를 뺀 뒤 이 파일을 app/admin/page.tsx 자리에 복사한다.
 * 가입자 정보는 화면에 싣지 않고, 비밀번호를 넣으면 중계 서버(?members, Worker 비밀값 ADMIN_PASSWORD)에서 받아 온다.
 */
import type { Metadata } from "next";
import { MembersAdmin } from "@/components/admin/MembersAdmin";

export const metadata: Metadata = { title: "관리자", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <MembersAdmin api={process.env.NEXT_PUBLIC_CORP_API ?? ""} />;
}
