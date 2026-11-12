import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BidDetailView } from "@/components/BidDetailView";
import { getBid } from "@/lib/store";

/** 서버 배포용 공고 상세 (예전 메일 링크 호환). 정적 배포에서는 /bids/view 가 대신한다 */
export const revalidate = 600;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bid = await getBid((await params).id);
  return { title: bid ? `${bid.title} 공고 분석` : "공고 분석" };
}

export default async function BidDetail({ params }: Props) {
  const bid = await getBid((await params).id);
  if (!bid) notFound();
  return <BidDetailView bid={bid} />;
}
