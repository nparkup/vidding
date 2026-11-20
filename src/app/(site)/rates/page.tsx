import type { Metadata } from "next";
import { RateExplorer } from "@/components/RateExplorer";
import { standardTiers } from "@/lib/criteria";
import { getRateTable } from "@/lib/store";

export const metadata: Metadata = { title: "낙찰하한율·실적 기준표" };
export const revalidate = 600;

export default async function RatesPage() {
  const table = await getRateTable();
  const tiers = standardTiers();
  return (
    <div className="container-x py-10 sm:py-14">
      <p className="eyebrow">발주처 기준·금액 구간별</p>
      <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.04em]">낙찰하한율·실적 기준표</h1>
      <p className="mt-3 max-w-2xl text-ink-500">
        적격심사 공고는 발주처가 어떤 기준을 쓰는지와 추정가격 구간에 따라 낙찰하한율, 통과점수, 실적 평가 방법이 달라집니다.
        조달청 세부기준의 값과, 실제 나라장터 공고가 기준별로 쓴 낙찰하한율을 함께 정리했습니다. 공고 상세 화면에는 그 공고에 맞는 줄이 자동으로 붙습니다.
      </p>
      <RateExplorer table={table} tiers={tiers} />
    </div>
  );
}
