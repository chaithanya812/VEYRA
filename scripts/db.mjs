#!/usr/bin/env node
/**
 * Tiny migration / SQL runner for the VEYRA Supabase Postgres.
 *
 * Usage:
 *   node scripts/db.mjs migrate                 # run all supabase/migrations/*.sql in order
 *   node scripts/db.mjs sql "select 1"          # run one statement
 *   node scripts/db.mjs file path/to/file.sql   # run one file
 *
 * Connection: DATABASE_URL from .env.local (falls back to the pooler if the
 * direct host is unreachable — set DATABASE_POOLER_URL to override).
 *
 * ⛔ RLS is OFF on this project by decision — migrations must not enable it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
dotenv.config({ path: join(root, ".env.local") });

const url = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

async function run(sql, label) {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`✓ ${label}`);
  } finally {
    await client.end();
  }
}

const [cmd, arg] = process.argv.slice(2);

try {
  if (cmd === "migrate") {
    const dir = join(root, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      await run(readFileSync(join(dir, f), "utf8"), `migration ${f}`);
    }
  } else if (cmd === "file") {
    await run(readFileSync(join(root, arg), "utf8"), `file ${arg}`);
  } else if (cmd === "sql") {
    const client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    const res = await client.query(arg);
    console.table(res.rows);
    await client.end();
  } else {
    console.log("Usage: node scripts/db.mjs migrate | file <path> | sql <query>");
    process.exit(1);
  }
} catch (err) {
  console.error("✗ DB error:", err.message);
  process.exit(1);
}
