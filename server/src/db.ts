import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

export type Db = Database.Database;

const schemaSql = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');

function runMigrations(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null;
  };
  if (row.v === null) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, Date.now());
  }
  // Future migrations: append {version: n, up(db)} entries here, applied in order.
}

/** Open a fresh database connection (file path or ':memory:'). */
export function openDb(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(schemaSql);
  runMigrations(db);
  return db;
}

let defaultDb: Db | null = null;
let testDb: Db | null = null;

/** Override for tests: call `setTestDb(openDb(':memory:'))` before running routes. */
export function setTestDb(db: Db | null): void {
  testDb = db;
}

/** App-wide default connection (config.dbPath), or the test override if set. */
export function getDb(): Db {
  if (testDb) return testDb;
  if (!defaultDb) defaultDb = openDb(config.dbPath);
  return defaultDb;
}
