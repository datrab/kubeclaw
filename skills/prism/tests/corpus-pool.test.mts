import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { migrate } from '../storage/index.ts';
const { ingest } = await import(process.env.PRISM_CORPUS_MODULE ? pathToFileURL(process.env.PRISM_CORPUS_MODULE).href : '../corpus/index.ts');

assert.ok(process.env.PRISM_TEST_PG_URL, 'PRISM_TEST_PG_URL must identify a dedicated local PostgreSQL server');
const url = new URL(process.env.PRISM_TEST_PG_URL);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'This test requires a dedicated local PostgreSQL server');
const owner = new pg.Client({ connectionString: url.href }); await owner.connect();
const database = `prism_corpus_test_${randomUUID().replaceAll('-', '')}`;
await owner.query(`CREATE DATABASE ${database}`);
url.pathname = `/${database}`;
const admin = new pg.Client({ connectionString: url.href }); await admin.connect();
const tables = ['rights_policy', 'corpus_item', 'corpus_revision', 'corpus_embedding'];
async function until(check: () => Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!await check()) {
    if (Date.now() >= deadline) throw new Error(`barrier timeout: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
try {
  const migrations = new pg.Pool({ connectionString: url.href, max: 1 });
  try { await migrate(migrations); } finally { await migrations.end(); }
  assert.equal((await admin.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows.length, 1);
  const faults = [...tables.slice(1).map((table) => [table, 'INSERT'] as const), ['corpus_item', 'UPDATE'] as const, ['rights_policy', 'INSERT'] as const];
  for (const [faultTable, faultOperation] of faults) {
    const application = `corpus-pool-${randomUUID()}`;
    const pool = new pg.Pool({ connectionString: url.href, max: 2, application_name: application, statement_timeout: 2_000 });
    const peers = await Promise.all([pool.connect(), pool.connect()]);
    const pids = await Promise.all(peers.map(async (client) => (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
    assert.notEqual(pids[0], pids[1]); peers.forEach((client) => client.release());
    const gate = 910001, occupied = 910002, stealing = 910003;
    await admin.query('SELECT pg_advisory_lock($1),pg_advisory_lock($2),pg_advisory_lock($3)', [gate, occupied, stealing]);
    await admin.query(`CREATE OR REPLACE FUNCTION prism.test_ingest_hook() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME='rights_policy' THEN PERFORM pg_advisory_xact_lock(${gate}); END IF;
        IF TG_TABLE_NAME='${faultTable}' AND TG_OP='${faultOperation}' THEN RAISE EXCEPTION 'injected-${faultTable}-${faultOperation}'; END IF;
        RETURN NEW;
      END $$`);
    for (const table of tables) await admin.query(`CREATE TRIGGER test_ingest AFTER INSERT OR UPDATE ON prism.${table} FOR EACH ROW EXECUTE FUNCTION prism.test_ingest_hook()`);
    const input = { sourceKind: 'internal-project', title: `failure ${faultTable} ${faultOperation}`, summary: 'atomic', tags: [], rights: 'full' };
    const evidence = { embedding: [1, 0], model: 'pool-test', modelVersion: '1', sourceDigest: `sha256:${'a'.repeat(64)}` };
    const operation = ingest(pool, input, evidence).then(() => null, (error: Error) => error);
    let blocker: Promise<unknown> | undefined; let thief: Promise<unknown> | undefined;
    try {
      await until(async () => (await admin.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'", [application])).rows.length === 1, 'rights insert reached native SQL gate');
      blocker = pool.query('SELECT pg_advisory_xact_lock($1) /* competing-request */', [occupied]).catch((error) => error);
      await until(async () => (await admin.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'", [application])).rows.length === 2, 'both actual pool connections occupied');
      thief = pool.query('SELECT pg_advisory_xact_lock($1) /* queued-request */', [stealing]).catch((error) => error);
      await until(async () => pool.waitingCount === 1, 'competing request queued');
      await admin.query('SELECT pg_advisory_unlock($1)', [gate]);
      await until(async () => (await admin.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND query LIKE '%queued-request%' AND wait_event='advisory'", [application])).rows.length === 1, 'next released connection belongs to queued request');
      await admin.query('SELECT pg_advisory_unlock($1)', [occupied]);
      const failure = await operation;
      assert.ok(failure); assert.match(failure.message, new RegExp(`injected-${faultTable}-${faultOperation}`));
      await admin.query('SELECT pg_advisory_unlock($1)', [stealing]);
      await Promise.all([blocker, thief]);
      const open = await admin.query("SELECT pid,state FROM pg_stat_activity WHERE application_name=$1 AND state LIKE 'idle in transaction%'", [application]);
      assert.deepEqual(open.rows, [], 'rollback must leave no borrowed connection in a transaction');
      for (const table of tables) assert.equal(Number((await admin.query(`SELECT count(*) FROM prism.${table}`)).rows[0].count), 0, `partial ${table} survived rollback`);
      console.log(JSON.stringify({ faultTable, faultOperation, connections: 2, rollback: 'complete' }));
    } finally {
      await admin.query('SELECT pg_advisory_unlock_all()');
      await Promise.allSettled([operation, ...(blocker ? [blocker] : []), ...(thief ? [thief] : [])]);
      await pool.end();
      for (const table of tables) await admin.query(`DROP TRIGGER test_ingest ON prism.${table}`);
    }
  }
  const pool = new pg.Pool({ connectionString: url.href, max: 2 });
  try {
    const input = { sourceKind: 'internal-project', title: 'concurrent same input', summary: 'atomic', tags: [], rights: 'full' };
    const evidence = { embedding: [1, 0], model: 'pool-test', modelVersion: '1', sourceDigest: `sha256:${'b'.repeat(64)}` };
    const results = await Promise.all(Array.from({ length: 12 }, () => ingest(pool, input, evidence)));
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    for (const table of tables) assert.equal(Number((await admin.query(`SELECT count(*) FROM prism.${table}`)).rows[0].count), 1);
    console.log(JSON.stringify({ ok: true, backend: 'native-postgresql-pool', concurrentInputs: 12, revisions: 1 }));
  } finally { await pool.end(); }
} finally {
  await admin.end();
  await owner.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await owner.end();
}
