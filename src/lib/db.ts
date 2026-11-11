import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Pool } from "pg";

/**
 * 영구 저장소 어댑터.
 * - DATABASE_URL 이 있으면 PostgreSQL (테이블은 처음 접속 시 자동 생성)
 * - 없으면 로컬 JSON 파일 (data/runtime-db.json, 개발·단일 서버용)
 *
 * 각 컬렉션은 (id, data jsonb, created_at) 형태로 저장한다.
 */
export type CollectionName = "clients" | "inquiries" | "reports" | "mail_log" | "settings";
const COLLECTIONS: CollectionName[] = ["clients", "inquiries", "reports", "mail_log", "settings"];

interface Adapter {
  list<T>(col: CollectionName): Promise<T[]>;
  get<T>(col: CollectionName, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(col: CollectionName, item: T, createdAt?: string): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  isEmpty(col: CollectionName): Promise<boolean>;
  kind: "postgres" | "file";
}

/* ---------------- PostgreSQL ---------------- */
function pgAdapter(url: string): Adapter {
  let pool: Pool | null = null;
  let ready: Promise<void> | null = null;

  async function db(): Promise<Pool> {
    if (!pool) {
      const { Pool } = await import("pg");
      pool = new Pool({ connectionString: url, max: 5, ssl: /sslmode=require|neon|supabase/.test(url) ? { rejectUnauthorized: false } : undefined });
    }
    if (!ready) {
      ready = (async () => {
        for (const c of COLLECTIONS) {
          await pool!.query(
            `CREATE TABLE IF NOT EXISTS ip_${c} (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
          );
        }
      })();
    }
    await ready;
    return pool;
  }

  return {
    kind: "postgres",
    async list<T>(col: CollectionName) {
      const r = await (await db()).query(`SELECT data FROM ip_${col} ORDER BY created_at DESC`);
      return r.rows.map((x) => x.data as T);
    },
    async get<T>(col: CollectionName, id: string) {
      const r = await (await db()).query(`SELECT data FROM ip_${col} WHERE id = $1`, [id]);
      return r.rows[0]?.data as T | undefined;
    },
    async put(col, item, createdAt) {
      await (await db()).query(
        `INSERT INTO ip_${col} (id, data, created_at) VALUES ($1, $2, COALESCE($3::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [item.id, JSON.stringify(item), createdAt ?? null],
      );
    },
    async remove(col, id) {
      await (await db()).query(`DELETE FROM ip_${col} WHERE id = $1`, [id]);
    },
    async isEmpty(col) {
      const r = await (await db()).query(`SELECT 1 FROM ip_${col} LIMIT 1`);
      return r.rowCount === 0;
    },
  };
}

/* ---------------- JSON 파일 ---------------- */
type FileShape = Record<CollectionName, { id: string; createdAt: string; data: unknown }[]>;

function fileAdapter(file: string): Adapter {
  let cache: FileShape | null = null;
  let writing = Promise.resolve();

  async function load(): Promise<FileShape> {
    if (cache) return cache;
    try {
      cache = JSON.parse(await fs.readFile(file, "utf8")) as FileShape;
    } catch {
      cache = {} as FileShape;
    }
    for (const c of COLLECTIONS) cache[c] ??= [];
    return cache;
  }
  function save() {
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(cache, null, 2));
      await fs.rename(tmp, file);
    });
    return writing;
  }

  return {
    kind: "file",
    async list<T>(col: CollectionName) {
      const rows = [...(await load())[col]].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return rows.map((r) => r.data as T);
    },
    async get<T>(col: CollectionName, id: string) {
      return (await load())[col].find((r) => r.id === id)?.data as T | undefined;
    },
    async put(col, item, createdAt) {
      const rows = (await load())[col];
      const i = rows.findIndex((r) => r.id === item.id);
      if (i >= 0) rows[i].data = item;
      else rows.push({ id: item.id, createdAt: createdAt ?? new Date().toISOString(), data: item });
      await save();
    },
    async remove(col, id) {
      const d = await load();
      d[col] = d[col].filter((r) => r.id !== id);
      await save();
    },
    async isEmpty(col) {
      return (await load())[col].length === 0;
    },
  };
}

const g = globalThis as unknown as { __ipchalAdapter?: Adapter };

export function adapter(): Adapter {
  if (!g.__ipchalAdapter) {
    const url = process.env.DATABASE_URL;
    g.__ipchalAdapter = url
      ? pgAdapter(url)
      : fileAdapter(process.env.DATA_FILE || path.join(process.cwd(), "data", "runtime-db.json"));
  }
  return g.__ipchalAdapter;
}
