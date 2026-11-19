/**
 * 배포 빌드: 첨부 본문 캐시. 한 번 읽은 첨부의 본문을 .cache/attach-text/{주소 해시}.txt.gz 에 두고
 * GitHub Actions 캐시(pages.yml)로 다음 빌드에 넘긴다. 첨부를 모두 읽어도 빌드마다 새로 올라온 첨부만 받으면 된다.
 * 이번 빌드의 공고에 없는 첨부는 지워 캐시가 계속 커지지 않게 한다.
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import type { TextCache } from "../src/lib/nara/docExtract";

/** 본문 추출 방식(attachText.ts·hwpText.ts)을 바꾸면 올린다 (예전 본문을 버리고 다시 받는다) */
const TEXT_CACHE_VERSION = 1;

export function makeTextCache(dir = ".cache/attach-text"): TextCache & { prune(keep: Iterable<string>): number; stats(): { hit: number; added: number } } {
  const root = join(dir, `v${TEXT_CACHE_VERSION}`);
  mkdirSync(root, { recursive: true });
  const file = (url: string) => join(root, `${createHash("sha1").update(url).digest("hex")}.txt.gz`);
  const mem = new Map<string, string>();
  let hit = 0, added = 0;
  return {
    get(url) {
      if (mem.has(url)) return mem.get(url);
      const f = file(url);
      if (!existsSync(f)) return undefined;
      try {
        const t = gunzipSync(readFileSync(f)).toString("utf8");
        mem.set(url, t);
        hit++;
        return t;
      } catch { return undefined; }
    },
    set(url, text) {
      mem.set(url, text);
      writeFileSync(file(url), gzipSync(text));
      added++;
    },
    prune(keep) {
      const want = new Set([...keep].map((u) => file(u).split("/").pop()));
      let n = 0;
      for (const name of readdirSync(root)) if (!want.has(name)) { unlinkSync(join(root, name)); n++; }
      return n;
    },
    stats: () => ({ hit, added }),
  };
}
