import Link from "next/link";

/** 공고 상세 위쪽 버튼 줄의 요금제 안내 (예전 오른쪽 '이 공고, 함께 준비할까요?' 카드) */
export function PlanCtaButton() {
  return (
    <Link
      href="/pricing"
      title="요금제를 이용하시면 같은 조건의 새 공고를 매일 아침 메일로 받고, 입찰점수 예측을 쓰실 수 있습니다."
      className="btn btn-sm bg-gradient-to-br from-mint to-mint-700 text-white shadow-glow hover:opacity-95"
    >
      이 공고, 함께 준비할까요?<span className="font-medium opacity-80">요금제 보기</span>
    </Link>
  );
}
