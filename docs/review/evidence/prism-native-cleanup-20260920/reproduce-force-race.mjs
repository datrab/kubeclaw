// Deterministic reproduction of the retired test teardown ordering.
// Only a new random database is touched. No PostgreSQL results are mocked.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const { Pool } = createRequire(path.resolve('package.json'))('pg');
const url = new URL(process.env.PRISM_BACKUP_TEST_SOURCE_URL);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const admin = new Pool({ connectionString: url.href });
const database = `prism_race_${randomUUID().replaceAll('-', '')}`;
let owned = false;
let pool;
try {
  await admin.query(`CREATE DATABASE ${database}`); owned = true;
  url.pathname = `/${database}`;
  pool = new Pool({ connectionString: url.href });
  const emitted = new Promise(resolve => pool.once('error', resolve));
  const client = await pool.connect(); await client.query('SELECT 1');
  const originalEnd = client.end.bind(client);
  let delayed = false;
  // Hold first close until the forceful server-side termination occurs.
  // On the error path pg-pool removes/ends it again: use the real close then.
  client.end = (...args) => {
    if (!delayed) { delayed = true; return; }
    return originalEnd(...args);
  };
  client.release();
  await pool.end();
  const stillPresent = (await admin.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1', [database])).rows[0].count;
  assert.equal(stillPresent, 1);
  console.log(JSON.stringify({ poolEndResolved: pool.ended, realBackendStillPresent: stillPresent }));
  await admin.query(`DROP DATABASE ${database} WITH (FORCE)`); owned = false;
  const error = await emitted;
  assert.equal(error.code, '57P01');
  assert.match(error.message, /terminating connection due to administrator command/);
  console.log(JSON.stringify({ capturedRealPoolError: error.code, message: error.message }));
} finally {
  if (owned) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
}
