import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { hashPassword } from "./password";

// Images and videos are files on disk; everything else lives in PostgreSQL
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, brief TEXT NOT NULL, organisation TEXT NOT NULL, preset TEXT NOT NULL,
  platforms TEXT NOT NULL, model TEXT NOT NULL, mock INTEGER NOT NULL, telegram INTEGER NOT NULL,
  trap INTEGER NOT NULL, status TEXT NOT NULL, title TEXT, execution_id TEXT, error TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, platform TEXT NOT NULL,
  version INTEGER NOT NULL, text TEXT NOT NULL, hashtags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
  source TEXT NOT NULL, safety_flags TEXT NOT NULL DEFAULT '[]', safety_checked INTEGER NOT NULL DEFAULT 0,
  trap_planted INTEGER NOT NULL DEFAULT 0, trap_quote TEXT, trap_explanation TEXT,
  reason TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, source TEXT NOT NULL,
  original TEXT NOT NULL, facebook TEXT NOT NULL, linkedin TEXT NOT NULL, prompt TEXT, note TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL UNIQUE REFERENCES drafts(id) ON DELETE CASCADE, decision TEXT NOT NULL,
  reason TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE, run_id TEXT NOT NULL,
  platform TEXT NOT NULL, status TEXT NOT NULL, scheduled_at TEXT, published_at TEXT, external_id TEXT, url TEXT,
  mock INTEGER NOT NULL, error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY, run_id TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL,
  message TEXT, workflow TEXT, execution_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, numbers TEXT NOT NULL,
  period_start TEXT NOT NULL, period_end TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS costs (
  id SERIAL PRIMARY KEY, run_id TEXT, usd DOUBLE PRECISION NOT NULL, label TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL, user_agent TEXT
);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, source TEXT NOT NULL,
  file TEXT NOT NULL, poster TEXT NOT NULL, seconds DOUBLE PRECISION, bytes INTEGER NOT NULL, prompt TEXT, note TEXT,
  created_at TEXT NOT NULL
);
-- Added with video posts; existing databases get the columns on the next start
ALTER TABLE runs ADD COLUMN IF NOT EXISTS media TEXT NOT NULL DEFAULT 'image';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS video_seconds INTEGER;
CREATE INDEX IF NOT EXISTS drafts_run_idx ON drafts(run_id);
CREATE INDEX IF NOT EXISTS events_run_idx ON events(run_id);
CREATE INDEX IF NOT EXISTS posts_run_idx ON posts(run_id);
CREATE INDEX IF NOT EXISTS costs_created_idx ON costs(created_at);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
`;

const g = globalThis as unknown as { __ppPool?: Pool; __ppReady?: Promise<void> };
const txClient = new AsyncLocalStorage<PoolClient>();

export function pool(): Pool {
  if (!g.__ppPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    g.__ppPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return g.__ppPool;
}

// Creates the tables and the default login once per process
export function ready(): Promise<void> {
  if (!g.__ppReady) {
    g.__ppReady = migrate().catch((err) => {
      g.__ppReady = undefined;
      throw err;
    });
  }
  return g.__ppReady;
}

async function migrate() {
  const client = await pool().connect();
  try {
    // The lock stops two processes from creating the same tables at the same time
    await client.query("SELECT pg_advisory_lock(424242)");
    await client.query(SCHEMA);
    await seedAdmin(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    client.release();
  }
}

// The default login from .env is created only when there are no users yet
async function seedAdmin(client: PoolClient) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) return;
  const email = (process.env.ADMIN_EMAIL ?? "admin@postpilot.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "PostPilot2026!";
  await client.query(
    "INSERT INTO users (id, email, name, password_hash, must_change_password, created_at) VALUES ($1, $2, $3, $4, 1, $5)",
    [newId(), email, process.env.ADMIN_NAME ?? "Demonstrator", await hashPassword(password), now()],
  );
  console.log(`[postpilot] Default login created: ${email}`);
}

// SQL keeps "?" placeholders; PostgreSQL wants $1, $2…
const toPg = (sql: string) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

type Param = string | number | null;

async function exec(sql: string, params: Param[]) {
  await ready();
  return (txClient.getStore() ?? pool()).query(toPg(sql), params);
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await exec(sql, params)).rows as T[];
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await exec(sql, params)).rows[0] as T | undefined;
}

export async function run(sql: string, ...params: Param[]): Promise<{ changes: number }> {
  return { changes: (await exec(sql, params)).rowCount ?? 0 };
}

// Every query inside `fn` uses the same connection and transaction
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await txClient.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
