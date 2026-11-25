/**
 * 업종별 분석의 기간별 낙찰 업체·발주기관 화면 자료를 R2에서 받아 정적 파일로 나눈다.
 * R2 stats/industry-period/{id}.json.gz (scripts/awards/collect.ts buildIndustries) →
 *   {출력}/{id}-{기간}.json (요약, 기관 검색 목록 제외), {출력}/{id}-{기간}-ag.json (업종 안 모든 발주기관 검색 목록),
 *   {출력}/{id}-{기간}-firms.json (자주 낙찰받은 업체 더 보기·검색 목록)
 * 화면: src/components/analysis/IndustryExplorer.tsx. 배포마다(자료 재사용 배포 포함) 정적 빌드 앞에서 돈다. 실패해도 배포는 계속한다.
 * 사용: npx tsx scripts/awards/industryFiles.ts public/industry-period
 */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import { r2Get } from "./r2";
import { industryId, type IndustryPeriodFile } from "../../src/lib/awards/industry";
import { CATEGORIES } from "../../src/lib/types";

async function main() {
  const out = process.argv[2] || "public/industry-period";
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let files = 0, bytes = 0;
  for (const cat of CATEGORIES) {
    const id = industryId(cat);
    const gz = await r2Get(`stats/industry-period/${id}.json.gz`).catch(() => null);
    if (!gz) { console.log(`업종 기간 자료 없음: ${cat}`); continue; }
    const f = JSON.parse(gunzipSync(gz).toString("utf8")) as IndustryPeriodFile;
    for (const [p, { list, firmList, ...d }] of Object.entries(f.periods)) {
      const a = JSON.stringify(d), b = JSON.stringify(list);
      writeFileSync(join(out, `${id}-${p}.json`), a);
      writeFileSync(join(out, `${id}-${p}-ag.json`), b);
      files += 2; bytes += a.length + b.length;
      // 자주 낙찰받은 업체 더 보기·검색용 (건수 상위·금액 상위 FIRM_LIST곳씩)
      if (firmList) { const c = JSON.stringify(firmList); writeFileSync(join(out, `${id}-${p}-firms.json`), c); files++; bytes += c.length; }
    }
  }
  console.log(`업종 기간 자료: 파일 ${files}개, ${Math.round(bytes / 1024 / 1024)}MB(글자 수)`);
}
main().catch((e) => { console.warn("업종 기간 자료 건너뜀:", e instanceof Error ? e.message : e); });
