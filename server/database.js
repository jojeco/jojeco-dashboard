import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

let SQL, db;

// Initialize database
async function initDB() {
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
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
    db.run('CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_health_checks_service_id ON health_checks(service_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_metrics_service_id ON service_metrics(service_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON service_metrics(timestamp)');
  } catch (e) {
    // Indexes may already exist
  }

  // Auto-save every 5 seconds
  setInterval(saveDB, 5000);

  console.log('✅ Database initialized');
}

function saveDB() {
  if (db) {
    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
  }
}

// Export database wrapper
export default {
  async init() {
    await initDB();
  },

  prepare(sql) {
    return {
      run: (...params) => {
        try {
          db.run(sql, params);
          saveDB(); // Save immediately after write operations
        } catch (error) {
          console.error('Query error:', error, sql, params);
          throw error;
        }
      },
      get: (...params) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return null;
      },
      all: (...params) => {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      },
    };
  },

  get name() {
    return dbPath;
  },

  close() {
    if (db) {
      saveDB();
      db.close();
    }
  },
};
