import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BidRow } from "@/components/BidRow";
import { rank } from "@/lib/analysis";
import { getBids, getInquiry } from "@/lib/store";
import { bidHref } from "@/lib/links";

export const dynamic = "force-dynamic";

export default async function Done({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const q = id ? await getInquiry(id) : undefined;
  if (!q) notFound();
  const results = rank(await getBids(), q);
  const ok = results.filter((r) => r.eligible);
  const qs = new URLSearchParams({ lic: q.licenses.join(","), rg: q.regions.join(","), min: String(q.minAmount), max: String(q.maxAmount) });

  return (
    <div className="container-x py-14 sm:py-20">
      <div className="card p-8 text-center sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-white"><Check className="h-7 w-7" strokeWidth={3} /></span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{q.company}님, 신청이 접수되었습니다.</h1>
        <p className="mt-3 text-ink-500">영업일 기준 1일 이내 담당 매니저가 {q.phone}로 연락드립니다.</p>
        <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3">
          <div className="rounded-2xl bg-mint-50 p-5"><p className="text-4xl font-extrabold text-mint-600">{ok.length}</p><p className="mt-1 text-sm text-ink-500">지금 참가 가능한 공고</p></div>
          <div className="rounded-2xl bg-paper p-5"><p className="text-4xl font-extrabold text-ink-500">{results.length - ok.length}</p><p className="mt-1 text-sm text-ink-500">조건 불일치로 제외</p></div>
        </div>
      </div>
      {q.licenses.length > 0 ? (
        <>
          <h2 className="mt-12 text-xl font-bold">미리 보는 추천 공고</h2>
          <div className="mt-4 space-y-3">
            {ok.slice(0, 5).map((m) => <BidRow key={m.bid.id} bid={m.bid} match={m} href={bidHref(m.bid.id, qs.toString())} />)}
          </div>
          <div className="mt-6 text-center"><Link href={`/bids?${qs}&ok=1`} className="btn-primary">전체 추천 공고 보기</Link></div>
        </>
      ) : (
        <p className="mt-8 text-center text-ink-500">면허를 선택하지 않으셔서 상담 시 조건을 함께 정리해 드릴게요.</p>
      )}
    </div>
  );
}
