import { saveClient } from "@/app/admin/actions";
import { PLANS } from "@/lib/plans";
import { CATEGORIES, LICENSES, REGIONS, type ClientProfile } from "@/lib/types";

type Init = Partial<ClientProfile> & { fromInquiry?: string };

function Chips({ name, options, selected, tone = "ink" }: { name: string; options: readonly string[]; selected: string[]; tone?: "ink" | "mint" }) {
  const on = tone === "mint" ? "peer-checked:border-mint peer-checked:bg-mint" : "peer-checked:border-ink peer-checked:bg-ink";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o} className="cursor-pointer">
          <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="peer sr-only" />
          <span className={`inline-block rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-500 transition peer-checked:text-white ${on}`}>{o}</span>
        </label>
      ))}
    </div>
  );
}

export function ClientForm({ init = {} }: { init?: Init }) {
  return (
    <form action={saveClient} className="card space-y-6 p-6">
      {init.id && <input type="hidden" name="id" value={init.id} />}
      {init.fromInquiry && <input type="hidden" name="fromInquiry" value={init.fromInquiry} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">회사명</label><input name="company" required defaultValue={init.company} className="input" /></div>
        <div><label className="label">담당자</label><input name="contactName" defaultValue={init.contactName} className="input" /></div>
        <div><label className="label">수신 이메일</label><input name="email" type="email" required defaultValue={init.email} className="input" /></div>
        <div><label className="label">연락처</label><input name="phone" defaultValue={init.phone} className="input" /></div>
      </div>
      <div><p className="label">보유 면허</p><Chips name="licenses" options={LICENSES} selected={init.licenses ?? []} /></div>
      <div><p className="label">영업 지역</p><Chips name="regions" options={REGIONS} selected={init.regions ?? []} tone="mint" /></div>
      <div><p className="label">관심 업종</p><Chips name="categories" options={CATEGORIES} selected={init.categories ?? [...CATEGORIES]} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">최소 규모 (만원)</label><input name="minAmount" type="number" defaultValue={init.minAmount ? init.minAmount / 10000 : 0} className="input" /></div>
        <div><label className="label">최대 규모 (만원)</label><input name="maxAmount" type="number" defaultValue={init.maxAmount ? init.maxAmount / 10000 : 50000} className="input" /></div>
        <div><label className="label">최근 3년 유사실적 (만원)</label><input name="pastPerformance" type="number" defaultValue={init.pastPerformance ? init.pastPerformance / 10000 : 0} className="input" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">신용등급</label>
          <select name="creditGrade" defaultValue={init.creditGrade ?? "BBB"} className="input">{["A", "BBB", "BB", "B", "CCC"].map((g) => <option key={g}>{g}</option>)}</select></div>
        <div><label className="label">요금제</label>
          <select name="plan" defaultValue={init.plan ?? "basic"} className="input">{PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="label">상태</label>
          <select name="status" defaultValue={init.status ?? "체험"} className="input">{["활성", "체험", "일시중지"].map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <button className="btn-primary">저장</button>
    </form>
  );
}
