import type { Metadata } from "next";
import { NoticeChangesList } from "@/components/NoticeChangesList";

export const metadata: Metadata = { title: "정정·취소 공고" };

export default function ChangesPage() {
  return (
    <div className="container-x py-10 sm:py-14">
      <h1 className="text-4xl font-extrabold tracking-[-0.04em]">정정·취소 공고</h1>
      <p className="mt-3 max-w-2xl text-ink-500">
        공고가 정정되면 바로 앞 차수와 비교해 금액, 입찰 마감, 개찰, 참가 지역, 투찰 가능 업종, 낙찰방법 중 바뀐 항목을 전후 값으로 보여 드립니다.
        관심공고와 맞춤공고 메일 고객의 추천 공고가 바뀌면 메일로 바로 알려 드립니다.
      </p>
      <ul className="mt-4 max-w-2xl space-y-1 text-sm text-ink-500">
        <li><b className="text-ink">나라장터·누리장터</b> 정정·취소 공고를 바로 앞 차수와 비교합니다.</li>
        <li><b className="text-ink">공동주택 K-apt</b>는 차수가 없어, 이름에 수정·정정·취소 표시를 단 공고를 같은 단지의 앞선 공고와 비교하고, 같은 공고번호의 마감·현장설명·서류 마감·낙찰방법이 바뀐 것도 함께 보여 드립니다. 공고 금액은 K-apt 공고에 없어 비교하지 않습니다.</li>
      </ul>
      <NoticeChangesList />
    </div>
  );
}
