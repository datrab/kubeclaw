import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { bootstrapPrismDatabaseRoles } from '../../server/database-roles.ts';
import { migrate } from '../../storage/index.ts';

// Explicit integration gate: two disposable, initially empty native PostgreSQL
// clusters are required. No database is dropped and no running service is mocked.
const source = process.env.PRISM_NATIVE_TEST_DATABASE_URL;
const destination = process.env.PRISM_NATIVE_RESTORE_DATABASE_URL;
const binaries = process.env.PRISM_NATIVE_POSTGRES_BIN;
assert(source && destination && binaries, 'Two disposable PostgreSQL URLs and PostgreSQL client binaries are required');
assert.notEqual(new URL(source).host, new URL(destination).host, 'Restore must use a separate PostgreSQL server');
const passwords = { migrator: 'native-test-migrator', runtime: 'native-test-runtime', readonly: 'native-test-readonly' };
const databaseUrl = (server: string, role?: keyof typeof passwords): string => {
  const url = new URL(server); url.pathname = '/prism';
  if (role) { url.username = `prism_${role}`; url.password = passwords[role]; }
  return url.toString();
};
const pool = (url: string) => new Pool({ connectionString: url, connectionTimeoutMillis: 10000 });

async function freshDatabase(server: string): Promise<void> {
  const admin = pool(server);
  try {
    const databases = await admin.query("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'");
    assert.deepEqual(databases.rows, [], 'Refusing a server with user databases');
    const roles = await admin.query("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname <> current_user");
    assert.deepEqual(roles.rows, [], 'Refusing a server with user roles');
    await admin.query('CREATE DATABASE prism');
  } finally { await admin.end(); }
}

async function run(executable: string, args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    let error = '';
    child.stdout.resume(); child.stderr.on('data', bytes => { error = (error + bytes.toString()).slice(-8192); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Native PostgreSQL client failed (${code}): ${error}`)));
  });
}

function clientEnvironment(server: string): NodeJS.ProcessEnv {
  const url = new URL(server);
  return { PGHOST: url.hostname, PGPORT: url.port, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'prism' };
}

test('native Prism credentials survive failed upgrade; legacy writes and fresh-server restore retain schema and data', { timeout: 300000 }, async t => {
  await freshDatabase(source!); await freshDatabase(destination!);
  const admin = pool(databaseUrl(source!)); const target = pool(databaseUrl(destination!));
  const runtime = pool(databaseUrl(source!, 'runtime')); const migrator = pool(databaseUrl(source!, 'migrator'));
  try {
    await bootstrapPrismDatabaseRoles(admin, databaseUrl(source!), passwords);
    assert.equal((await admin.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0].extversion, '0.8.6');
    t.diagnostic(`Native PostgreSQL ${(await admin.query('SHOW server_version')).rows[0].server_version}; pgvector 0.8.6`);
    await migrate(migrator, { infrastructure: 'preprovisioned' });
    const credentials = async () => (await admin.query("SELECT rolname,rolpassword FROM pg_authid WHERE rolname LIKE 'prism_%' ORDER BY rolname")).rows;
    const before = await credentials();
    await assert.rejects(bootstrapPrismDatabaseRoles(admin, databaseUrl(source!), { ...passwords, runtime: 'changed-password' }), /PRISM_ROLE_CREDENTIAL_TRANSITION_REQUIRED:prism_runtime/);
    assert.deepEqual(await credentials(), before, 'Failed upgrade must not rotate any existing credential');
    await bootstrapPrismDatabaseRoles(admin, databaseUrl(source!), passwords);
    assert.deepEqual(await credentials(), before, 'Ordinary bootstrap preserves SCRAM verifiers');

    const eventId = randomUUID();
    const insert = "INSERT INTO prism.preference_event(id,subject_id,event_type,content,consent_scope,occurred_at) VALUES($1,'native-test','accepted',$2::jsonb,'personal',now()) RETURNING wire_event_id";
    const inserted = await runtime.query(insert, [eventId, JSON.stringify({ evidence: 'original evidence bytes: ä ✓' })]);
    assert.equal(inserted.rows[0].wire_event_id, eventId, 'Pre-011 writer remains usable after migration');
    await runtime.query(insert, [randomUUID(), JSON.stringify({ eventId: 'wire-dedup-native' })]);
    await assert.rejects(runtime.query(insert, [randomUUID(), JSON.stringify({ eventId: 'wire-dedup-native' })]), { code: '23505' });
    await runtime.query("INSERT INTO prism.worker_request_nonce VALUES('native-restore','sha256:nonce',now(),now()+interval '1 hour')");
    const readonly = pool(databaseUrl(source!, 'readonly'));
    try {
      assert.equal((await readonly.query('SELECT count(*)::int AS n FROM prism.preference_event')).rows[0].n, 2);
      await assert.rejects(readonly.query(insert, [randomUUID(), '{}']), { code: '42501' });
    } finally { await readonly.end(); }

    // A real process exits after connecting to the committed schema. This proves
    // database continuity across application failure, not Kubernetes rollback.
    await assert.rejects(run(process.execPath, ['--input-type=module', '-e', "import {Client} from 'pg';const c=new Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();await c.query('SELECT count(*) FROM prism.schema_migration');await c.end();process.exit(70)"], { TEST_DATABASE_URL: databaseUrl(source!, 'runtime') }), /\(70\)/);
    assert.equal((await runtime.query('SELECT count(*)::int AS n FROM prism.preference_event')).rows[0].n, 2);

    const archive = join(await mkdtemp(join(tmpdir(), 'prism-native-restore-')), 'prism.dump');
    await run(join(binaries!, 'pg_dump'), ['--format=custom', '--file', archive], clientEnvironment(source!));
    assert((await readFile(archive)).byteLength > 1000);
    // Roles precede object restoration; the fresh destination has no Prism
    // schema/extension yet. Preserve owners and ACLs from the original dump.
    for (const [role, password] of Object.entries(passwords)) await target.query(`CREATE ROLE prism_${role} LOGIN PASSWORD '${password}'`);
    await run(join(binaries!, 'pg_restore'), ['--exit-on-error', '--single-transaction', '--dbname=prism', archive], clientEnvironment(destination!));
    for (const table of ['schema_migration', 'preference_event', 'worker_request_nonce']) {
      const query = `SELECT row_to_json(t)::text AS original FROM prism.${table} t ORDER BY row_to_json(t)::text`;
      assert.deepEqual((await target.query(query)).rows, (await admin.query(query)).rows, `${table} must restore exactly`);
    }
    await bootstrapPrismDatabaseRoles(target, databaseUrl(destination!), passwords);
    const restoredRuntime = pool(databaseUrl(destination!, 'runtime'));
    try {
      assert.equal((await restoredRuntime.query("SELECT '[1,2,3]'::vector::text AS value")).rows[0].value, '[1,2,3]');
      assert.equal((await restoredRuntime.query(insert, [randomUUID(), '{}'])).rows.length, 1);
    } finally { await restoredRuntime.end(); }
  } finally { await Promise.all([admin.end(), target.end(), runtime.end(), migrator.end()]); }
});
