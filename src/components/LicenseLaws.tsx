import { lawUrl, type LicenseReq } from "@/lib/eligibility";

/**
 * 공고의 제한 업종과 근거 법령, 대신 인정되는 업종.
 * 묶음(그룹) 안은 모두 갖춰야 하고 묶음끼리는 '또는'이다 (나라장터 면허제한 기준).
 * 근거 법령은 조달청 업종 및 근거법규서비스, 포함 업종은 같은 서비스의 포함면허 값이다.
 */
export function LicenseLaws({ groups, title = "참가 업종과 근거 법령" }: { groups?: LicenseReq[][]; title?: string }) {
  if (!groups?.length) return null;
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">
        {groups.length > 1 ? "아래 묶음 중 하나를 갖추면 됩니다. 한 묶음 안의 업종은 모두 등록되어 있어야 합니다." : groups[0].length > 1 ? "아래 업종을 모두 등록해야 합니다." : "아래 업종을 등록한 업체가 참가할 수 있습니다."}
      </p>
      <ol className="mt-4 space-y-3">
        {groups.map((g, i) => (
          <li key={i} className="min-w-0">
            {i > 0 && <p className="mb-2 text-center text-xs font-bold text-ink-400">또는</p>}
            <div className="space-y-2 rounded-xl bg-paper p-3 sm:p-4">
              {g.map((r) => <Req key={r.code || r.name} r={r} />)}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">근거 법령·포함 업종: 조달청 나라장터 업종 및 근거법규 정보. 공고서의 참가자격이 우선합니다.</p>
    </section>
  );
}

function Req({ r }: { r: LicenseReq }) {
  const allowed = r.alt.filter((a) => !a.via);
  const incl = r.alt.filter((a) => a.via === "포함");
  const url = r.law && lawUrl(r.law);
  return (
    <div className="min-w-0 text-sm">
      <p className="font-bold [overflow-wrap:anywhere]">
        {r.name || "업종"}{r.code && <span className="ml-1 font-normal text-ink-400">({r.code})</span>}
      </p>
      {r.law?.law && (
        <p className="mt-0.5 text-ink-500">
          근거{" "}
          {url ? <a href={url} target="_blank" rel="noreferrer" className="underline decoration-ink-200 underline-offset-2 hover:text-mint-600">{r.law.law}{r.law.clause ? ` ${r.law.clause}` : ""}</a> : `${r.law.law}${r.law.clause ? ` ${r.law.clause}` : ""}`}
        </p>
      )}
      {allowed.length > 0 && <p className="mt-0.5 text-ink-500 [overflow-wrap:anywhere]">공고 허용업종 {allowed.map((a) => a.name || a.code).join(", ")}</p>}
      {incl.length > 0 && <p className="mt-0.5 text-ink-500 [overflow-wrap:anywhere]">이 업종을 포함하는 업종 {incl.map((a) => a.name || a.code).join(", ")}</p>}
    </div>
  );
}
