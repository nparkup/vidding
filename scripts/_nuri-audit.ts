/**
 * (임시) 민간 공고 배점표 점검 2: 규칙으로 못 읽은 공고의 판독 입력을 만들고 15건을 실제로 판독해 본다.
 * 미리보기 자료(audit/out/nuri-fixture.json)도 다시 만든다. PR 전에 지운다.
 */
import { mkdirSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNuriBids } from "../src/lib/nara/nuri";
import { extractNuriSheets } from "../src/lib/nara/nuriSheets";
import { makeAiInputs } from "./aiSheets";
import { readAiInput } from "../src/lib/nara/aiSheet";

async function main() {
  const mem = new Map<string, string>();
  const cache = { get: (k: string) => mem.get(k), set: (k: string, t: string) => void mem.set(k, t) };
  const { file, log } = await fetchNuriBids();
  console.log(log);
  const ai = makeAiInputs({});
  const st = await extractNuriSheets(file.items, cache, 15 * 60_000, (bid, text) => ai.collect(bid, text, undefined));
  console.log(`배점표: 대상 ${st.targets}, 읽음 ${st.read}, 찾음 ${st.found}, 판독 입력 ${st.ai}, 실패 ${st.failed}, 시간초과 ${st.timedOut}`);
  mkdirSync("audit/out", { recursive: true });
  const ids = Object.keys(st.docs).filter((id) => st.docs[id].ai);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  const lines: string[] = [];
  const count: Record<string, number> = {};
  const sample = ids.slice(0, 15);
  const results: Record<string, unknown> = {};
  for (const id of sample) {
    const input = ai.inputs[id];
    const r = await readAiInput(client, input, undefined);
    count[r.status] = (count[r.status] ?? 0) + 1;
    results[id] = r;
    const b = file.items.find((x) => `${x.no}-${x.ord}` === id)!;
    lines.push(`## ${id} [${b.award}] ${b.title}\n${r.status} ${r.reason ?? ""} · 토큰 ${r.usage?.input ?? 0}/${r.usage?.output ?? 0}\n${(r.sheet?.items ?? []).map((i) => `${i.group}/${i.label}=${i.max}${i.kind === "price" ? "(가격)" : ""}`).join(" | ")}\n`);
  }
  console.log(`판독 ${sample.length}건: ${JSON.stringify(count)}`);
  writeFileSync("audit/out/ai-read.md", lines.join("\n"));
  writeFileSync("audit/out/nuri-fixture.json", JSON.stringify({ nuriBids: file, nuriDocs: st.docs, aiResults: results, aiInputs: Object.fromEntries(sample.map((id) => [id, ai.inputs[id]])) }));
}
main().catch((e) => { console.error(e); process.exit(1); });
