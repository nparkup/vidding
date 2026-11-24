/**
 * (임시) 사전규격 첨부 점검: 점검 표본 공고 중 사전규격 번호(bfSpecRgstNo)가 있는 공고의 사전규격 규격서를 받아 본문을 저장한다.
 * 사용: DATA_GO_KR_SERVICE_KEY=... npx tsx --conditions=react-server scripts/score/prespec-audit.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { gunzipSync, gzipSync } from "zlib";
import { textOf } from "../../src/lib/nara/attachText";
import { preSpecFileUrl } from "../../src/lib/preSpecs";

const KEY = process.env.DATA_GO_KR_SERVICE_KEY ?? "";

function fileName(cd: string | null): string | undefined {
  if (!cd) return undefined;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star) try { return decodeURIComponent(star[1].replace(/"/g, "")); } catch { /* 다음 */ }
  const m = /filename="?([^";]+)"?/i.exec(cd);
  if (!m) return undefined;
  const raw = m[1];
  try { return decodeURIComponent(raw); } catch { /* 다음 */ }
  return Buffer.from(raw, "latin1").toString("utf8");
}

const sniff = (b: Buffer) => b.subarray(0, 4).toString("latin1") === "%PDF" ? "pdf" : b[0] === 0xd0 && b[1] === 0xcf ? "hwp" : b[0] === 0x50 && b[1] === 0x4b ? "zip" : "bin";

async function main() {
  const dump = JSON.parse(gunzipSync(readFileSync("audit/out/coverage.json.gz")).toString("utf8")) as Record<string, { it: Record<string, string>; biz: string }>;
  const out: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(dump)) {
    const no = v.it.bfSpecRgstNo;
    if (!no) continue;
    // API 응답 (파일 이름)
    const op = v.biz === "공사" ? "getPublicPrcureThngInfoCnstwk" : v.biz === "물품" ? "getPublicPrcureThngInfoThng" : "getPublicPrcureThngInfoServc";
    let api: unknown;
    try { api = await (await fetch(`https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService/${op}?serviceKey=${KEY}&type=json&numOfRows=10&pageNo=1&inqryDiv=2&bfSpecRgstNo=${no}`, { signal: AbortSignal.timeout(60_000) })).json(); } catch (e) { api = String(e); }
    const files: { seq: number; name?: string; bytes?: number; chars?: number; text?: string; error?: string; status?: number }[] = [];
    for (let seq = 1; seq <= 5; seq++) {
      try {
        const r = await fetch(preSpecFileUrl(no, seq), { signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "Mozilla/5.0 (bid-analysis build)" } });
        const buf = Buffer.from(await r.arrayBuffer());
        let name = fileName(r.headers.get("content-disposition"));
        if (!r.ok || buf.length < 100) { files.push({ seq, status: r.status, bytes: buf.length, name }); if (buf.length < 100) break; continue; }
        const kind = sniff(buf);
        if (!name || !/\.[a-z0-9]{2,5}$/i.test(name)) name = `${name ?? `file${seq}`}.${kind === "zip" ? "hwpx" : kind}`;
        let text = "";
        try { text = await textOf({ name, url: "", kind: "규격서·기타" }, buf); } catch (e) { files.push({ seq, name, bytes: buf.length, error: (e as Error).message }); continue; }
        files.push({ seq, name, bytes: buf.length, chars: text.length, text });
      } catch (e) { files.push({ seq, error: (e as Error).message.slice(0, 120) }); }
    }
    console.log(`${id}\t${no}\t${files.map((f) => `${f.name ?? "?"}(${f.chars ?? f.error ?? f.status})`).join(" | ")}`);
    out[id] = { no, api, files };
  }
  writeFileSync("audit/out/prespec.json.gz", gzipSync(JSON.stringify(out)));
}
main().catch((e) => { console.error(e); process.exit(1); });
