/**
 * 발주처 분석 업종·기간 선택용 자료 (src/lib/awards/agencyCut.ts): 정적 빌드가 끝난 뒤 out/agency-data/index.json 의 수요기관마다
 * R2 수요기관 색인(idx/agency)에서 줄을 줄여 out/agency-cut/{id}.json 으로 쓴다.
 * 사이트 용량을 지키려고 합계가 MAX_MB(기본 80MB)를 넘으면 그 뒤 기관은 쓰지 않는다(화면은 업종·기간 선택을 숨긴다). 실패해도 배포는 계속한다.
 * 사용: npx tsx scripts/awards/agencyCuts.ts out
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import { r2Get } from "./r2";
import { AGENCY_BUCKETS, agencyBucket, type AgencyIndexFile } from "../../src/lib/awards/analysis";
import { agencyCut } from "../../src/lib/awards/agencyCut";

async function main() {
  const outDir = process.argv[2] || "out";
  const idx = join(outDir, "agency-data", "index.json");
  if (!existsSync(idx)) { console.log("발주처 목록이 없어 건너뜀"); return; }
  const list = JSON.parse(readFileSync(idx, "utf8")) as [string, string, number][];
  const byBucket = new Map<string, [string, string][]>();
  for (const [name, id] of list) { const k = agencyBucket(name); (byBucket.get(k) ?? byBucket.set(k, []).get(k)!).push([name, id]); }
  const docs = new Map<string, string>();
  for (let i = 0; i < AGENCY_BUCKETS; i++) {
    const k = String(i).padStart(2, "0");
    const want = byBucket.get(k);
    if (!want) continue;
    const gz = await r2Get(`idx/agency/${k}.json.gz`).catch(() => null);
    if (!gz) continue;
    const f = JSON.parse(gunzipSync(gz).toString("utf8")) as AgencyIndexFile;
    for (const [name, id] of want) { const rows = f.agencies[name]; if (rows?.length) docs.set(id, JSON.stringify(agencyCut(rows))); }
  }
  const max = Number(process.env.MAX_MB || 80) * 1024 * 1024;
  const dir = join(outDir, "agency-cut");
  mkdirSync(dir, { recursive: true });
  let bytes = 0, files = 0, skipped = 0;
  for (const [, id] of list) {
    const d = docs.get(id);
    if (!d) continue;
    const b = Buffer.byteLength(d);
    if (bytes + b > max) { skipped++; continue; }
    writeFileSync(join(dir, `${id}.json`), d);
    bytes += b; files++;
  }
  console.log(`발주처 업종·기간 자료: ${files.toLocaleString()}곳, ${(bytes / 1024 / 1024).toFixed(1)}MB${skipped ? `, 용량 한도로 ${skipped}곳 뺌` : ""}`);
}
main().catch((e) => { console.warn("발주처 업종·기간 자료 건너뜀:", e instanceof Error ? e.message : e); });
