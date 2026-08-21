import pg from "pg";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(root, ".env.local") });

const REF = process.env.SUPABASE_PROJECT_REF || "vjupynmjzpdzrluwctzd";
// Secret must NOT be hardcoded. Set SUPABASE_DB_PASSWORD in .env.local to re-probe.
const PWD = process.env.SUPABASE_DB_PASSWORD || "";
if (!PWD) {
  console.error("Set SUPABASE_DB_PASSWORD in .env.local to run this pooler probe.");
  process.exit(1);
}
const regions = [
  "ap-south-1", "ap-southeast-1", "ap-northeast-1", "ap-southeast-2",
  "ap-south-2", "us-east-1", "us-east-2", "us-west-1", "eu-central-1",
  "eu-west-1", "eu-west-2", "sa-east-1",
];
const prefixes = ["aws-0", "aws-1"];

for (const prefix of prefixes) {
  for (const region of regions) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const client = new pg.Client({
      host,
      port: 5432,
      user: `postgres.${REF}`,
      password: PWD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      const r = await client.query("select current_database(), now()");
      console.log(`✓ CONNECTED  host=${host}  db=${r.rows[0].current_database}`);
      await client.end();
      console.log(`\nUSE THIS:\nDATABASE_POOLER_URL=postgresql://postgres.${REF}:<url-encoded-pwd>@${host}:5432/postgres`);
      process.exit(0);
    } catch (e) {
      const msg = e.message.split("\n")[0];
      // Only print interesting failures (auth reached vs DNS/timeout)
      if (!/ENOTFOUND|ETIMEDOUT|timeout/.test(msg)) {
        console.log(`… ${host}: ${msg}`);
      }
      try { await client.end(); } catch {}
    }
  }
}
console.log("No pooler region matched.");
process.exit(1);
