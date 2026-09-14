import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from '../../storage/index.ts';

const suites = {
  transactions: {
    file: 'tests/verification/contracts/check-prism-postgres-transactions.mts',
    variable: 'KUBECLAW_PRISM_TRANSACTION_TEST_DATABASE',
    migrate: false,
  },
  'worker-readiness': {
    file: 'skills/prism/tests/native/worker-readiness-gate.mts',
    variable: 'KUBECLAW_PRISM_READINESS_TEST_DATABASE',
    migrate: true,
  },
};

// CI supplies only a dedicated loopback service. Each original suite owns a new
// database; neither a developer database nor a preceding suite is reused.
async function main() {
  const name = process.argv[2];
  assert(process.argv.length === 3 && name && Object.hasOwn(suites, name),
    'Usage: native-postgres.mts transactions|worker-readiness');
  assert(process.env.PRISM_TEST_PG_URL, 'PRISM_TEST_PG_URL must identify an isolated local PostgreSQL service');
  const source = new URL(process.env.PRISM_TEST_PG_URL);
  assert(['postgres:', 'postgresql:'].includes(source.protocol), 'PostgreSQL URL required');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname), 'Dedicated loopback PostgreSQL required');
  const suite = suites[name as keyof typeof suites];
  const database = `prism_native_${randomUUID().replaceAll('-', '')}`;
  const owner = new pg.Client({ connectionString: source.href, connectionTimeoutMillis: 5000 });
  await owner.connect();
  let created = false;
  try {
    await owner.query(`CREATE DATABASE ${database}`);
    created = true;
    const target = new URL(source);
    target.pathname = `/${database}`;
    if (suite.migrate) {
      const pool = new pg.Pool({ connectionString: target.href, connectionTimeoutMillis: 5000 });
      try { await migrate(pool); }
      finally { await pool.end(); }
    }
    const result = spawnSync(process.execPath, [suite.file], {
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
      env: { ...process.env, [suite.variable]: target.href },
      stdio: 'inherit', timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.signal, null, 'Native suite terminated by signal');
    assert.equal(result.status, 0, 'Original native suite failed');
    process.stdout.write(JSON.stringify({ nativePostgresVerified: true, suite: name,
      databaseIsolation: 'fresh database', originalEntrypoint: suite.file }) + '\n');
  } finally {
    try { if (created) await owner.query(`DROP DATABASE ${database} WITH (FORCE)`); }
    finally { await owner.end(); }
  }
}

await main();
