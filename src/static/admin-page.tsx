/**
 * GitHub Pages(정적 배포)용 관리자 화면: 회원정보·결제정보·회원 사용량 등 운영 관리 (src/components/admin/AdminConsole.tsx).
 * scripts/build-static.mjs 가 서버용 관리자(src/app/admin)를 뺀 뒤 이 파일을 app/admin/page.tsx 자리에 복사한다.
 * 회원 정보는 화면에 싣지 않고, 로그인하면 중계 서버(?admin=, Worker 비밀값 ADMIN_ID·ADMIN_PASSWORD)에서 받아 온다.
 */
import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/AdminConsole";

export const metadata: Metadata = { title: "관리자", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminConsole api={process.env.NEXT_PUBLIC_CORP_API ?? ""} />;
}
