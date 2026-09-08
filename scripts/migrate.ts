import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { postgresTls } from "../src/records/tls.js";

const url = process.env.DIRECT_URL?.trim();
if (!url) throw new Error("DIRECT_URL is required to run migrations.");

const directory = resolve("supabase/migrations");
const files = (await readdir(directory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const pool = new Pool({
  connectionString: url,
  ssl: postgresTls(),
  max: 1,
});

try {
  await pool.query(`
    create table if not exists public.virgil_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  for (const file of files) {
    const applied = await pool.query(
      "select 1 from public.virgil_migrations where name = $1",
      [file],
    );
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(directory, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into public.virgil_migrations (name) values ($1)",
        [file],
      );
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
