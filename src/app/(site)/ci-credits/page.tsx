import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PageHero } from "@/components/PageHero";

export const metadata = { title: "발주기관 CI 출처 | 입찰메이트LAB" };

type Credit = { file: string; source: string; page: string; license: string; artist: string };

/** 빌드 때 받은 발주기관 CI의 출처·라이선스 목록 (scripts/agency-logos/fetch.mjs 가 만든 credits.json) */
function credits(): [string, Credit][] {
  const p = path.join(process.cwd(), "public/agency-logos/credits.json");
  if (!existsSync(p)) return [];
  return Object.entries(JSON.parse(readFileSync(p, "utf8")) as Record<string, Credit>);
}

export default function CiCreditsPage() {
  const list = credits();
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <>
      <PageHero
        eyebrow="발주기관 CI"
        title="발주기관 CI 출처"
        lead="공고 목록과 상세 화면의 발주기관 CI는 위키미디어 공용에 공개된 파일을 받아 이 사이트에 함께 올린 것입니다. 기관을 알아보기 쉽게 하려는 표시이며 고객사나 제휴 관계를 뜻하지 않습니다. 중앙행정기관과 소속기관은 모두 대한민국 정부상징을 씁니다."
      />
      <section className="container-x py-12">
        <p className="text-sm text-ink-500">CI {list.length}종. CI가 확인되지 않은 기관은 표시하지 않습니다. 잘못된 CI를 보시면 알려 주세요.</p>
        <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(([name, c]) => (
            <li key={name} className="flex min-w-0 items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3">
              <span className="flex h-10 w-24 shrink-0 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${base}/agency-logos/${c.file}`} alt={`${name} CI`} loading="lazy" className="max-h-10 max-w-24 object-contain" />
              </span>
              <span className="min-w-0 text-sm">
                <span className="block truncate font-semibold">{name === "정부상징" ? "대한민국 정부상징 (중앙행정기관)" : name}</span>
                <a href={c.page} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink-500 underline-offset-2 hover:underline">
                  {c.license || "라이선스 표기 없음"}{c.artist ? ` · ${c.artist}` : ""}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
