import type { Metadata } from "next";
import { LICENSES, REGIONS } from "@/lib/types";
import { submitInquiry } from "./actions";

export const metadata: Metadata = { title: "무료 진단 신청" };

const SIZES = [
  ["0-100000000", "1억 이하"],
  ["50000000-500000000", "5천만 ~ 5억"],
  ["300000000-2000000000", "3억 ~ 20억"],
  ["1000000000-10000000000", "10억 이상"],
];

export default async function Apply({ searchParams }: { searchParams: Promise<{ error?: string; plan?: string }> }) {
  const sp = await searchParams;
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

      <form action={submitInquiry} className="card space-y-5 p-6 sm:p-8">
        {sp.error && <p className="rounded-xl bg-coral-100 p-3 text-sm text-coral">회사명, 이메일, 연락처는 꼭 입력해 주세요.</p>}
        {sp.plan && <input type="hidden" name="message" value={`관심 요금제: ${sp.plan}`} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="company">회사명 *</label><input id="company" name="company" required className="input" placeholder="(주)입찰클린" /></div>
          <div><label className="label" htmlFor="contactName">담당자</label><input id="contactName" name="contactName" className="input" placeholder="홍길동 대표" /></div>
          <div><label className="label" htmlFor="email">이메일 *</label><input id="email" name="email" type="email" required className="input" placeholder="공고를 받을 이메일" /></div>
          <div><label className="label" htmlFor="phone">연락처 *</label><input id="phone" name="phone" required className="input" placeholder="010-0000-0000" /></div>
        </div>
        <fieldset>
          <legend className="label">보유 면허·업종</legend>
          <div className="flex flex-wrap gap-2">
            {LICENSES.map((l) => (
              <label key={l} className="cursor-pointer">
                <input type="checkbox" name="licenses" value={l} className="peer sr-only" />
                <span className="inline-block rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-500 transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-mint-100">{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">영업 가능 지역</legend>
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((r) => (
              <label key={r} className="cursor-pointer">
                <input type="checkbox" name="regions" value={r} className="peer sr-only" />
                <span className="inline-block rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-500 transition peer-checked:border-mint peer-checked:bg-mint peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-mint-100">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">수행 가능한 용역 규모 (연간)</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SIZES.map(([v, l], i) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" name="size" value={v} defaultChecked={i === 1} className="peer sr-only" />
                <span className="block rounded-xl border border-ink-100 bg-white px-2 py-2.5 text-center text-sm text-ink-500 transition peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white">{l}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!sp.plan && (
          <div><label className="label" htmlFor="message">문의 내용</label><textarea id="message" name="message" rows={3} className="input" placeholder="주로 참여하고 싶은 공고, 어려운 점 등을 적어 주세요." /></div>
        )}
        <p className="text-xs text-ink-300">제출 시 상담 목적의 개인정보 수집·이용에 동의한 것으로 간주합니다.</p>
        <button className="btn-mint w-full text-base">무료 진단 결과 보기</button>
      </form>
    </div>
  );
}
