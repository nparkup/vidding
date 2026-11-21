/**
 * 공고 수집(scripts/fetch-bids.ts)이 읽는 소스 파일 목록을 import 를 따라가며 찾는다.
 * 배포 워크플로(.github/workflows/pages.yml)가 머지 배포 때 이 목록과 바뀐 파일을 비교해,
 * 수집 코드가 바뀌었으면 자료를 새로 받고, 화면 코드만 바뀌었으면 직전 정기 배포 자료를 다시 쓴다.
 *
 * 사용: node scripts/fetch-deps.mjs            → 한 줄에 하나씩 저장소 기준 경로
 */
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";

const root = resolve(import.meta.dirname, "..");
const entries = ["scripts/fetch-bids.ts"];
const exts = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx", "/index.js"];

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // 패키지는 package-lock.json 으로 따로 본다
  for (const e of exts) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const seen = new Set();
const stack = entries.map((e) => join(root, e));
const re = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  if (!/\.(ts|tsx|js|mjs)$/.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    // 타입만 가져오는 import 는 실행 결과를 바꾸지 않는다
    if (/^(import|export)\s+type\s/.test(m[0])) continue;
    const p = resolveSpec(f, m[1] ?? m[2] ?? m[3] ?? m[4]);
    if (p && !seen.has(p)) stack.push(p);
  }
}
console.log([...seen].map((f) => relative(root, f)).sort().join("\n"));
