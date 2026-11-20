import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MyBox } from "@/components/MyBox";

export const metadata: Metadata = {
  title: "내 서류함",
  description: "관심 공고를 담아 마감·개찰 일정을 달력으로 보고, 라벨·메모·제출서류 준비 상황을 한곳에서 관리합니다.",
};

export default function MyBoxPage() {
  return (
    <>
      <PageHero eyebrow="내 서류함" title={<>담아 둔 공고,<br />마감 순으로 챙기세요.</>} lead="공고 상세에서 담은 공고를 마감·개찰 일정과 함께 모았습니다. 라벨과 메모로 나누고, 제출서류 체크 진행도 같이 봅니다." />
      <MyBox />
    </>
  );
}
