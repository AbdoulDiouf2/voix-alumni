import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString, max: 3 });
  return { pool, db: drizzle({ client: pool }) };
}

export async function pingDatabase(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 2000,
  });
  try {
    await pool.query("SELECT 1");
  } finally {
    await pool.end();
  }
}
