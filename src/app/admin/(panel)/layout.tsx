import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { Logo } from "@/components/Logo";
import { getSyncInfo, listInquiries } from "@/lib/store";
import { logout } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "관리자", template: "%s | 입찰파트너 관리자" } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const newInq = (await listInquiries()).filter((q) => q.status === "신규").length;
  const sync = getSyncInfo();
  return (
    <div className="min-h-screen bg-[#F3F4F6] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-ink p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between lg:block">
          <Logo href="/admin" light />
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-mint lg:mt-2 lg:inline-block">ADMIN</span>
        </div>
        <div className="mt-4 lg:mt-8">
          <AdminNav badge={{ "/admin/inquiries": newInq }} />
        </div>
        <div className="mt-auto hidden space-y-3 lg:block">
          <div className="rounded-xl bg-white/5 p-3 text-xs text-ink-300">
            <p className="flex items-center gap-1.5 font-semibold text-white">
              <span className={`h-2 w-2 rounded-full ${sync.source === "g2b" ? "bg-mint" : "bg-amber"}`} />
              {sync.source === "g2b" ? "나라장터 연동 중" : "목업 데이터 모드"}
            </p>
            <p className="mt-1">공고 {sync.count}건</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="flex-1 rounded-lg border border-white/10 py-2 text-center text-xs text-ink-300 hover:text-white">사이트 보기</Link>
            <form action={logout} className="flex-1"><button className="w-full rounded-lg border border-white/10 py-2 text-xs text-ink-300 hover:text-white">로그아웃</button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 p-4 sm:p-8">{children}</div>
    </div>
  );
}
