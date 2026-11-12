import Link from "next/link";
import { ITArt } from "@/components/art/Sectors";

export default function NotFound() {
  return (
    <div className="container-x py-20 text-center">
      <ITArt className="mx-auto w-full max-w-xs" />
      <p className="mt-6 text-sm font-bold text-mint-600">404</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">페이지를 찾을 수 없습니다.</p>
      <p className="mt-3 text-ink-500">마감되었거나 삭제된 공고일 수 있습니다.</p>
      <Link href="/bids" className="btn-primary mt-8">공고 검색으로</Link>
    </div>
  );
}
