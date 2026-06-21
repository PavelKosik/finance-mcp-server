#!/usr/bin/env node
/**
 * Creates an empty SQLite database from schema/schema.sql.
 *
 * Usage:
 *   npm run init-db                 # creates ./data/finance.db
 *   DATABASE_PATH=/path/db.sqlite npm run init-db
 */
import Database from "better-sqlite3";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "finance.db");
const schemaPath = join(__dirname, "..", "schema", "schema.sql");

mkdirSync(dirname(dbPath), { recursive: true });

if (existsSync(dbPath)) {
  console.error(`Refusing to overwrite existing database at ${dbPath}.`);
  console.error("Delete it first if you really want a fresh database.");
  process.exit(1);
}

const schema = readFileSync(schemaPath, "utf-8");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(schema);
db.close();

console.log(`Created empty database at ${dbPath}`);
