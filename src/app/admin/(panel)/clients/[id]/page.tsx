import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead, Status } from "@/components/AdminUI";
import { GradeBadge } from "@/components/Badges";
import { EmailPreview } from "@/components/EmailPreview";
import { documentChecklist, rank } from "@/lib/analysis";
import { buildDigest } from "@/lib/digest";
import { dday, won } from "@/lib/format";
import { planName } from "@/lib/plans";
import { getBids, getClient } from "@/lib/store";
import { toggleWatchAction } from "../../../actions";

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getClient(id);
  if (!c) notFound();
  const bids = await getBids();
  const ranked = rank(bids, c);
  const ok = ranked.filter((r) => r.eligible);
  const digest = buildDigest(c, bids);
  const watched = ranked.filter((r) => c.watchlist.includes(r.bid.id));
  const qs = new URLSearchParams({ lic: c.licenses.join(","), rg: c.regions.join(","), min: String(c.minAmount), max: String(c.maxAmount) });

  return (
    <>
      <PageHead title={c.company} desc={`${c.contactName} · ${c.email} · ${c.phone}`}>
        <Link href={`/admin/clients/new?id=${c.id}`} className="btn-ghost btn-sm">조건 수정</Link>
        <Link href={`/admin/reports?client=${c.id}`} className="btn-primary btn-sm">주간 보고서 작성</Link>
      </PageHead>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="card grid gap-4 p-5 sm:grid-cols-4">
            {[
              ["요금제", planName(c.plan)],
              ["상태", <Status key="s" value={c.status} />],
              ["규모", `${won(c.minAmount)}~${won(c.maxAmount)}`],
              ["실적/신용", `${won(c.pastPerformance)} · ${c.creditGrade}`],
            ].map(([k, v]) => (
              <div key={String(k)}><p className="text-xs text-ink-500">{k}</p><div className="mt-1 text-sm font-bold">{v}</div></div>
            ))}
            <div className="sm:col-span-4 flex flex-wrap gap-1.5">
              {c.licenses.map((l) => <span key={l} className="chip border-ink bg-ink text-white">{l}</span>)}
              {c.regions.map((r) => <span key={r} className="chip border-mint-100 bg-mint-50 text-mint-600">{r}</span>)}
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <h2 className="font-bold">추천 공고 <span className="text-mint-600">{ok.length}</span><span className="text-ink-300"> / {ranked.length}</span></h2>
              <p className="text-xs text-ink-300">별표 = 관심 공고 (서류 체크리스트 제공)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table-x min-w-[640px]">
                <thead><tr><th></th><th>공고</th><th>규모</th><th>마감</th><th>가능성</th></tr></thead>
                <tbody>
                  {ok.map((r) => {
                    const on = c.watchlist.includes(r.bid.id);
                    return (
                      <tr key={r.bid.id}>
                        <td className="w-10">
                          <form action={toggleWatchAction.bind(null, c.id, r.bid.id)}>
                            <button className={`text-lg ${on ? "text-amber" : "text-ink-100 hover:text-ink-300"}`} aria-label="관심 공고 표시">★</button>
                          </form>
                        </td>
                        <td>
                          <Link href={`/bids/${r.bid.id}?${qs}`} target="_blank" className="font-semibold hover:text-mint-600">{r.bid.title}</Link>
                          <p className="text-xs text-ink-300">{r.bid.demandAgency} · {r.bid.contractMethod}</p>
                        </td>
                        <td className="tabular-nums">{won(r.bid.baseAmount)}</td>
                        <td className="text-xs">{dday(r.daysLeft)}</td>
                        <td><GradeBadge grade={r.grade} score={r.score} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">관심 공고 서류 준비 현황</h2>
            {watched.length === 0 ? (
              <p className="mt-3 text-sm text-ink-500">관심 공고가 없습니다. 위 목록에서 ★을 눌러 추가하세요.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100">
                {watched.map((r) => {
                  const docs = documentChecklist(r.bid);
                  const req = docs.flatMap((g) => g.items).filter((i) => i.required).length;
                  return (
                    <li key={r.bid.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.bid.title}</p><p className="text-xs text-ink-300">필수서류 {req}종 · {r.bid.contractMethod}</p></div>
                      <Link href={`/bids/${r.bid.id}?${qs}`} target="_blank" className="btn-ghost btn-sm shrink-0">체크리스트</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-ink-500">내일 아침 발송될 메일 미리보기</p>
          <EmailPreview digest={digest} />
        </div>
      </div>
    </>
  );
}
