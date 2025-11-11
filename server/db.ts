import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const hostname = Deno.env.get("DATABASE_HOST") ?? "localhost";
const port = Number(Deno.env.get("DATABASE_PORT") ?? "5432");
const user = Deno.env.get("DATABASE_USER") ?? "postgres";
const password = Deno.env.get("DATABASE_PASSWORD") ?? "";
const database = Deno.env.get("DATABASE_NAME") ?? "postgres";
const poolSize = Number(Deno.env.get("DATABASE_POOL_SIZE") ?? "3");

export const pool = new Pool(
  {
    hostname,
    port,
    user,
    password,
    database,
  },
  poolSize,
  true,
);

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS cards (
        text TEXT NOT NULL,
        requirements TEXT[] NOT NULL DEFAULT '{}',
        difficulty TEXT NOT NULL,
        expiring BOOLEAN NOT NULL DEFAULT FALSE,
        rarity TEXT NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}
