import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ToolTabs } from "@/components/tools/ToolTabs";
import { JointCalc } from "@/components/tools/JointCalc";

export const metadata: Metadata = {
  title: "공동도급 지분 계산기",
  description: "공고의 시공능력평가액·실적·지역의무 조건과 구성원 시평액·실적·지분율로 단독 참가 가능 여부, 구성원별 최대 참여비율, 충족 여부를 계산합니다.",
};

export default function JointToolPage() {
  return (
    <>
      <PageHero
        eyebrow="실무 도구 · 공동도급"
        title={<>혼자 안 되면,<br />지분을 어떻게 나눌까.</>}
        lead="공고 조건과 함께할 업체의 시공능력평가액, 실적, 지분율을 넣으면 단독으로 들어갈 수 있는지, 구성원마다 몇 %까지 참여할 수 있는지, 조건을 다 채우는지 바로 계산합니다."
      />
      <ToolTabs active="joint" />
      <JointCalc />
    </>
  );
}
