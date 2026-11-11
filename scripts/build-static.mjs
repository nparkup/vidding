/**
 * GitHub Pages용 정적 사이트 빌드.
 * 서버가 필요한 부분(관리자, API, 미들웨어, 서버 액션)을 뺀 사본을 만들어 `next build`(output: export)한다.
 * 결과물: out/
 *
 * 환경변수: BIDS_FILE(필수, fetch-bids 결과), PAGES_BASE_PATH(예: /vidding), NEXT_PUBLIC_APPLY_EMAIL
 */
import { cpSync, existsSync, rmSync, symlinkSync } from "fs";
import { execSync } from "child_process";
import { join, resolve } from "path";
import { tmpdir } from "os";

const root = resolve(import.meta.dirname, "..");
const work = join(process.env.RUNNER_TEMP || tmpdir(), "ipchal-static-build");

rmSync(work, { recursive: true, force: true });
cpSync(root, work, {
  recursive: true,
  filter: (src) => !/[\\/](node_modules|\.next|out|\.git|data)([\\/]|$)/.test(src.slice(root.length)),
});
symlinkSync(join(root, "node_modules"), join(work, "node_modules"), "dir");

for (const p of [
  "src/app/admin",
  "src/app/api",
  "src/middleware.ts",
  "src/app/(site)/apply/actions.ts",
  "src/app/(site)/apply/done",
  "src/components/ClientForm.tsx",
  "src/lib/jobs.ts",
]) rmSync(join(work, p), { recursive: true, force: true });
cpSync(join(work, "src/static/apply-page.tsx"), join(work, "src/app/(site)/apply/page.tsx"));

if (!process.env.BIDS_FILE || !existsSync(process.env.BIDS_FILE)) {
  console.error("BIDS_FILE 이 없습니다. 먼저 scripts/fetch-bids.ts 를 실행하세요.");
  process.exit(1);
}
execSync("npx next build", { cwd: work, stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1", BIDS_FILE: resolve(process.env.BIDS_FILE) } });

rmSync(join(root, "out"), { recursive: true, force: true });
cpSync(join(work, "out"), join(root, "out"), { recursive: true });
console.log("정적 사이트 생성 완료 → out/");
