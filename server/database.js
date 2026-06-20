import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'dashboard.db');

let db;

// Initialize database (file-backed, WAL mode — synchronous, durable)
function initDB() {
  db = new Database(dbPath);

  // WAL mode: concurrent reads while writing, far more crash-durable than the
  // old sql.js "whole DB in WASM memory, flushed every 5s" approach.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      lan_url TEXT,
      icon TEXT NOT NULL DEFAULT 'Server',
      color TEXT NOT NULL DEFAULT 'bg-blue-500',
      tags TEXT NOT NULL DEFAULT '[]',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      health_check_url TEXT,
      health_check_interval INTEGER DEFAULT 60,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      status TEXT NOT NULL,
      response_time INTEGER,
      status_code INTEGER,
      timestamp INTEGER NOT NULL,
      error TEXT,
      FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      response_time INTEGER NOT NULL,
      status_code INTEGER NOT NULL,
      is_online INTEGER NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
    );
  `);

  // Create indexes
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_health_checks_service_id ON health_checks(service_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_metrics_service_id ON service_metrics(service_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON service_metrics(timestamp)');
  } catch (e) {
    // Indexes may already exist
  }

  console.log('✅ Database initialized (better-sqlite3, WAL)');
}

// Export database wrapper.
// API is intentionally identical to the previous sql.js wrapper:
//   db.prepare(sql).run(...params) / .get(...params) / .all(...params)
// so server.js and auth.js need no changes. better-sqlite3 statements already
// expose .run/.get/.all with spread params, but we wrap them so that:
//   - DDL passed to .run() (CREATE TABLE IF NOT EXISTS ...) still works
//   - .get() returns null (not undefined) for parity with the old wrapper
//   - statements are prepared lazily / cached per sql string
const stmtCache = new Map();

function getStmt(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

export default {
  async init() {
    initDB();
  },

  prepare(sql) {
    return {
      run: (...params) => {
        try {
          // better-sqlite3 .run() works for both DML and DDL statements.
          return getStmt(sql).run(...params);
        } catch (error) {
          console.error('Query error:', error, sql, params);
          throw error;
        }
      },
      get: (...params) => {
        const row = getStmt(sql).get(...params);
        return row === undefined ? null : row;
      },
      all: (...params) => {
        return getStmt(sql).all(...params);
      },
    };
  },

  get name() {
    return dbPath;
  },

  close() {
    if (db) {
      db.close();
    }
  },
};
