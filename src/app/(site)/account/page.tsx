import type { Metadata } from "next";
import { AccountView } from "@/components/account/AccountView";

export const metadata: Metadata = { title: "내 정보" };

export default function AccountPage() {
  return (
    <div className="container-x max-w-3xl py-10 sm:py-14">
      <h1 className="text-2xl font-extrabold sm:text-3xl">내 정보</h1>
      <div className="mt-6">
        <AccountView email={process.env.NEXT_PUBLIC_APPLY_EMAIL || "hello@bidmatrix.kr"} />
      </div>
    </div>
  );
}
