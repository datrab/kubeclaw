import { Pool } from "pg";
import { migrate } from "../storage/index.ts";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(pool, { infrastructure: "preprovisioned" });
} finally {
  await pool.end();
}
