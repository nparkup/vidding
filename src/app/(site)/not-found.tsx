import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x py-24 text-center">
      <p className="text-6xl font-extrabold text-ink-100">404</p>
      <p className="mt-4 text-xl font-bold">페이지를 찾을 수 없습니다.</p>
      <p className="mt-2 text-ink-500">마감되었거나 삭제된 공고일 수 있습니다.</p>
      <Link href="/bids" className="btn-primary mt-8">공고 검색으로</Link>
    </div>
  );
}
