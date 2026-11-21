import type { Metadata } from "next";
import { LoginForm } from "@/components/account/LoginForm";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <div className="container-x max-w-lg py-10 sm:py-16">
      <LoginForm email={process.env.NEXT_PUBLIC_APPLY_EMAIL || "hello@ipchalmatelab.kr"} />
    </div>
  );
}
