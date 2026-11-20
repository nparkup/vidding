import type { Metadata } from "next";
import { NoticeChangesList } from "@/components/NoticeChangesList";

export const metadata: Metadata = { title: "정정·취소 공고" };

export default function ChangesPage() {
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow">나라장터 정정·취소 공고 최근 14일</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">정정·취소 공고</h1>
      <p className="mt-3 max-w-2xl text-ink-500">
        공고가 정정되면 바로 앞 차수와 비교해 금액, 입찰 마감, 개찰, 참가 지역, 투찰 가능 업종, 낙찰방법 중 바뀐 항목을 전후 값으로 보여 드립니다.
        관심공고와 맞춤공고 메일 고객의 추천 공고가 바뀌면 메일로 바로 알려 드립니다.
      </p>
      <NoticeChangesList />
    </div>
  );
}
