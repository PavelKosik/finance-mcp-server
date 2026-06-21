import Database from "better-sqlite3";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Resolve the SQLite database path.
 *
 * The path is taken from the DATABASE_PATH environment variable. If it is not
 * set, we fall back to `./data/finance.db` relative to the process working
 * directory. This keeps the server portable and free of any machine-specific
 * or user-specific paths.
 */
function findDatabase() {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  return join(process.cwd(), "data", "finance.db");
}

let db;

export function getDb() {
  if (!db) {
    const dbPath = findDatabase();
    if (!existsSync(dbPath)) {
      throw new Error(
        `Database not found at "${dbPath}". Run "npm run init-db" to create an ` +
          `empty database, or set DATABASE_PATH to point at an existing one.`
      );
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
