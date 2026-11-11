export function ApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-x grid gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.3fr]">
      <div>
        <p className="eyebrow">무료 맞춤 진단</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">조건만 알려주세요.<br />나머지는 저희가 찾습니다.</h1>
        <p className="mt-5 leading-relaxed text-ink-500">신청 즉시 지금 참가 가능한 공고 목록을 보여드리고, 영업일 기준 1일 이내 담당 매니저가 연락드립니다.</p>
        <ul className="mt-8 space-y-4">
          {[
            ["즉시", "현재 참가 가능한 공고 수와 상위 공고 확인"],
            ["1영업일 내", "담당 매니저 전화 상담, 조건 세부 조정"],
            ["다음 날 아침", "첫 맞춤 공고 요약 이메일 발송, 2주 무료"],
          ].map(([k, v]) => (
            <li key={k} className="flex gap-4">
              <span className="w-24 shrink-0 text-sm font-bold text-mint-600">{k}</span>
              <span className="text-ink-700">{v}</span>
            </li>
          ))}
        </ul>
      </div>

      {children}
    </div>
  );
}
