// 발주기관 CI 파일을 위키미디어 공용(Wikimedia Commons)에서 받아 public/agency-logos/ 에 저장한다.
// 대상은 sources.json (기관명 → 공용 파일명). 위키데이터 '로고 이미지(P154)'로 등록된 파일과
// 정부상징·교육청 등 공용에 올라온 공개 파일만 넣는다. 사람이 보고 고른 목록이며 자동으로 추측하지 않는다.
// 결과: public/agency-logos/<해시>.<확장자>, public/agency-logos/credits.json (기관명 → 파일·출처·라이선스),
//       src/lib/agencyLogos.data.json (기관명 → 파일, 화면 코드가 읽음)
// 정적 사이트 빌드 직전에 실행한다(.github/workflows/pages.yml). 받은 파일은 캐시에 두고 새 파일만 받는다.
// 공용에 닿지 않거나 일부가 실패해도 빌드는 계속한다(받은 기관만 CI, 나머지는 자체 유형 표시).
// 실행: node scripts/agency-logos/fetch.mjs   (--force 로 모두 다시 받기)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("./sources.json", import.meta.url);
const OUT_DIR = new URL("../../public/agency-logos/", import.meta.url);
const DATA = new URL("../../src/lib/agencyLogos.data.json", import.meta.url);
const CREDITS = new URL("../../public/agency-logos/credits.json", import.meta.url);
const UA = "naravidding-agency-logos/1.0 (https://github.com/nparkup/vidding)";
const force = process.argv.includes("--force");

const sources = JSON.parse(readFileSync(SRC, "utf8"));
const prev = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, "utf8")) : {};
mkdirSync(OUT_DIR, { recursive: true });

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (r.ok) return r;
    if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`);
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
  }
}

async function main() {
const strip = (s) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const out = {};
const files = [...new Set(Object.values(sources))];
const meta = {};
for (let i = 0; i < files.length; i += 40) {
  const titles = files.slice(i, i + 40).map((f) => "File:" + f).join("|");
  const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "360", titles,
  });
  const j = await (await get(u)).json();
  const norm = Object.fromEntries((j.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of Object.values(j.query.pages)) {
    const name = (norm[p.title] ?? p.title).replace(/^File:/, "");
    const ii = p.imageinfo?.[0];
    if (!ii) { console.warn("공용에 없음:", name); continue; }
    meta[name] = {
      thumb: ii.thumburl ?? ii.url,
      // 가로÷세로. 화면이 이미지를 받기 전에 자리를 잡아 두어 흐르는 띠가 덜컥이지 않게 한다
      ratio: Math.round(((ii.thumbwidth ?? ii.width) / (ii.thumbheight ?? ii.height)) * 1000) / 1000,
      page: ii.descriptionurl,
      license: strip(ii.extmetadata?.LicenseShortName?.value),
      artist: strip(ii.extmetadata?.Artist?.value).slice(0, 120),
    };
  }
}

let got = 0, skip = 0, fail = 0;
for (const [agency, file] of Object.entries(sources)) {
  const m = meta[file];
  if (!m) { fail++; continue; }
  const hash = createHash("sha1").update(file).digest("hex").slice(0, 12);
  const old = prev[agency];
  if (!force && old && old.source === file && existsSync(new URL(old.file, OUT_DIR))) {
    out[agency] = { ...old, ratio: m.ratio }; skip++; continue;
  }
  try {
    const r = await get(m.thumb);
    const type = r.headers.get("content-type") ?? "";
    const ext = type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : type.includes("gif") ? "gif" : type.includes("webp") ? "webp" : type.includes("svg") ? "svg" : null;
    if (!ext) throw new Error("알 수 없는 형식 " + type);
    const name = `${hash}.${ext}`;
    writeFileSync(new URL(name, OUT_DIR), Buffer.from(await r.arrayBuffer()));
    out[agency] = { file: name, ratio: m.ratio, source: file, page: m.page, license: m.license, artist: m.artist };
    got++;
  } catch (e) {
    console.warn("받기 실패:", agency, file, String(e));
    fail++;
  }
  await new Promise((s) => setTimeout(s, 300));
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "ko")));
writeFileSync(CREDITS, JSON.stringify(sorted, null, 1) + "\n");
writeFileSync(DATA, JSON.stringify(Object.fromEntries(Object.entries(sorted).map(([k, v]) => [k, [v.file, v.ratio || 1]]))) + "\n");
console.log(`발주기관 CI: 받음 ${got} · 그대로 ${skip} · 실패 ${fail} · 전체 ${Object.keys(sources).length}`);
}

main().catch((e) => {
  console.warn("발주기관 CI 받기를 건너뜀:", String(e));
  // 캐시에 남은 지난번 파일이 있으면 그것으로 표시한다
  const keep = Object.entries(prev).filter(([, v]) => existsSync(new URL(v.file, OUT_DIR)));
  writeFileSync(DATA, JSON.stringify(Object.fromEntries(keep.map(([k, v]) => [k, [v.file, v.ratio || 1]]))) + "\n");
});
