import { Logo } from "@/components/Logo";
import { usingDevPassword } from "@/lib/auth";
import { login } from "../actions";

export const metadata = { title: "관리자 로그인" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4">
      <form action={login} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card">
        <Logo />
        <p className="mt-6 text-xl font-bold">관리자 로그인</p>
        <p className="mt-1 text-sm text-ink-500">운영자 전용 페이지입니다.</p>
        <input type="hidden" name="next" value={sp.next ?? "/admin"} />
        <label className="label mt-6" htmlFor="password">비밀번호</label>
        <input id="password" name="password" type="password" required autoFocus className="input" />
        {sp.error && <p className="mt-2 text-sm text-coral">비밀번호가 올바르지 않습니다.</p>}
        <button className="btn-primary mt-6 w-full">로그인</button>
        {usingDevPassword() && (
          <p className="mt-4 rounded-lg bg-amber-100 p-3 text-xs text-[#9A6412]">개발 모드: ADMIN_PASSWORD 미설정. 기본 비밀번호 admin1234 사용 중입니다.</p>
        )}
      </form>
    </div>
  );
}
