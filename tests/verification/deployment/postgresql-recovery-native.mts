import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { loadAll } from 'js-yaml';

const source = process.env.POSTGRES_NATIVE_SOURCE_URL;
const destination = process.env.POSTGRES_NATIVE_DESTINATION_URL;
const binaries = process.env.POSTGRES_NATIVE_CLIENT_BIN;
const python = process.env.LITELLM_NATIVE_PYTHON;
const migrationSourceVersion = process.env.POSTGRES_NATIVE_SOURCE_VERSION;
if (migrationSourceVersion) assert.match(migrationSourceVersion, /^17[0-9]{4}$/, 'The migration gate selects an explicit PostgreSQL17 source');
assert(source && destination && binaries && python, 'Two disposable native PostgreSQL servers, original client binaries and pinned LiteLLM Python source runtime are required');
const fixture = new URL('../../fixtures/litellm-database/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', fixture), 'utf8'));
const schema = await readFile(new URL('schema.sql', fixture));
assert.equal(createHash('sha256').update(schema).digest('hex'), provenance.schemaSqlSha256);
const deployment = loadAll(await readFile(new URL('../../../my-values/infra/litellm-deployment.yaml', import.meta.url), 'utf8')).find((v: any) => v?.kind === 'Deployment') as any;
assert.equal(deployment.spec.template.spec.containers[0].image, provenance.applicationImage);
const identifier = `recovery_${randomBytes(8).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const runtimeUrl = (server: string): string => {
  const url = new URL(server); url.pathname = `/${identifier}`; url.username = identifier; url.password = password; return url.toString();
};

async function prepare(server: string): Promise<void> {
  const admin = new Pool({ connectionString: server });
  try {
    assert.deepEqual((await admin.query('SELECT datname FROM pg_database WHERE datname=$1', [identifier])).rows, []);
    assert.deepEqual((await admin.query('SELECT rolname FROM pg_roles WHERE rolname=$1', [identifier])).rows, []);
    await admin.query(`CREATE ROLE ${identifier} LOGIN PASSWORD '${password}'`);
    await admin.query(`CREATE DATABASE ${identifier} OWNER ${identifier}`);
  } finally { await admin.end(); }
}

async function administerDatabase(server: string, statement: string): Promise<void> {
  const url = new URL(server); url.pathname = `/${identifier}`;
  const admin = new Pool({ connectionString: url.toString() });
  try { await admin.query(statement); } finally { await admin.end(); }
}

async function command(args: string[], environment: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['scripts/postgresql-recovery.sh', ...args], { env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', bytes => { output += bytes.toString(); });
    child.stderr.on('data', bytes => { error = (error + bytes.toString()).slice(-16384); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`Recovery exit ${code}: ${error}`)));
  });
}

async function upstreamCrypto(request: object): Promise<Record<string, string | boolean>> {
  return new Promise((resolve, reject) => {
    const child = spawn(python!, [fileURLToPath(new URL('crypto.py', fixture))], {
      env: { ...process.env, LITELLM_LOCAL_MODEL_COST_MAP: 'True', DO_NOT_TRACK: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = ''; let errors = '';
    child.stdout.on('data', bytes => { output += bytes.toString(); }); child.stderr.on('data', bytes => { errors = (errors + bytes.toString()).slice(-8192); });
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) { reject(new Error(`Original LiteLLM crypto exited ${code}: ${errors}`)); return; }
      try { resolve(JSON.parse(output)); } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

function environment(server: string, root: string): NodeJS.ProcessEnv {
  const url = new URL(server);
  return { PATH: `${binaries}:${process.env.PATH}`, PGHOST: url.hostname, PGPORT: url.port, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: identifier,
    BACKUP_ROOT: root, BACKUP_MAXIMUM_BYTES: '67108864', BACKUP_MAXIMUM_RETAINED_BYTES: '268435456', BACKUP_MAXIMUM_AGE_SECONDS: '3600',
    BACKUP_CREDENTIAL_AUTHORITY_REF: 'native-test:retained-credential-set', LITELLM_MASTER_KEY: 'native-test-master-secret', LITELLM_SALT_KEY: 'native-test-salt-secret',
    BACKUP_MAXIMUM_DURATION_SECONDS: '120', BACKUP_EXPECTED_SERVER_VERSION: '180006', BACKUP_APPLICATION_IMAGE: provenance.applicationImage };
}

async function proof(pool: Pool) {
  const models = (await pool.query('SELECT to_jsonb(t) AS row FROM "LiteLLM_ProxyModelTable" t ORDER BY model_id')).rows;
  const keys = (await pool.query('SELECT to_jsonb(t) AS row FROM "LiteLLM_VerificationToken" t ORDER BY token')).rows;
  const columns = (await pool.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const indexes = (await pool.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")).rows;
  const owners = (await pool.query("SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname")).rows;
  return { models, keys, columns, indexes, owners };
}

test(`native ${migrationSourceVersion ? 'PG17 to PG18 migration' : 'PG18 recovery'} preserves full LiteLLM schema/auth/models and rejects unsafe restoration`, { timeout: 300000 }, async t => {
  await prepare(source!); await prepare(destination!);
  const original = new Pool({ connectionString: runtimeUrl(source!) }); const restored = new Pool({ connectionString: runtimeUrl(destination!) });
  const root = await mkdtemp(join(tmpdir(), 'postgres-recovery-native-'));
  const sourceEnv = environment(source!, root); const targetEnv = environment(destination!, root);
  if (migrationSourceVersion) sourceEnv.BACKUP_EXPECTED_SERVER_VERSION = migrationSourceVersion;
  const restore = (backup: string) => migrationSourceVersion ? ['migrate', backup, migrationSourceVersion] : ['restore', backup];
  try {
    await original.query(schema.toString('utf8'));
    const ciphertext = await upstreamCrypto({ operation: 'encrypt', plaintext: 'native-provider-key', key: sourceEnv.LITELLM_SALT_KEY });
    const token = createHash('sha256').update('sk-native-recovery-original-key').digest('hex');
    await original.query('INSERT INTO "LiteLLM_VerificationToken"(token,key_alias,models,blocked,permissions,metadata) VALUES($1,$2,$3,false,$4::jsonb,$5::jsonb)',
      [token, 'original-auth-key', ['recovery-model-legacy', 'recovery-model-aes'], JSON.stringify({ allow: ['model-info'] }), JSON.stringify({ evidence: 'original auth metadata ä ✓' })]);
    for (const kind of ['legacy', 'aes']) await original.query('INSERT INTO "LiteLLM_ProxyModelTable"(model_id,model_name,litellm_params,model_info,created_by,updated_by,updated_at) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$5,now())',
      [kind, `recovery-model-${kind}`, JSON.stringify({ model: 'openai/gpt-4o-mini', api_key: ciphertext[kind] }), JSON.stringify({ id: kind, provenance: 'native-restore-test' }), 'native-operator']);
    const owner = `${identifier}_owner`;
    await administerDatabase(source!, `CREATE ROLE ${owner}; ALTER TABLE "LiteLLM_ProxyModelTable" OWNER TO ${owner}; GRANT ALL ON "LiteLLM_ProxyModelTable" TO ${identifier}`);
    const before = await proof(original);
    assert(before.columns.length > 500, 'Use the actual full schema, not a replacement model/key fixture');
    const backup = await command(['backup'], sourceEnv);
    assert.equal(await command(['verify'], sourceEnv), backup);
    assert.equal(await command(['scheduled'], { ...sourceEnv, BACKUP_INTERVAL_SECONDS: '900' }), backup);
    const manifest = await readFile(join(backup, 'metadata.env'), 'utf8');
    assert(!manifest.includes(sourceEnv.LITELLM_MASTER_KEY!)); assert(!manifest.includes(sourceEnv.LITELLM_SALT_KEY!));
    assert(!manifest.includes(createHash('sha256').update(sourceEnv.LITELLM_SALT_KEY!).digest('hex')), 'Never export the actual derived encryption key');
    await assert.rejects(command(restore(backup), { ...targetEnv, LITELLM_SALT_KEY: 'different-salt' }), /BACKUP_CREDENTIAL_SET_MISMATCH/);
    await assert.rejects(command(['restore', backup], sourceEnv), /SAME_SERVER_RESTORE_FORBIDDEN/);
    if (migrationSourceVersion) {
      await assert.rejects(command(['restore', backup], targetEnv), /BACKUP_VERSION_MISMATCH/);
      await assert.rejects(command(['migrate', backup, '180006'], targetEnv), /FORWARD_MIGRATION_REQUIRED/);
      await assert.rejects(command(['migrate', backup, String(Number(migrationSourceVersion) - 1)], targetEnv), /BACKUP_VERSION_MISMATCH/);
    }
    await assert.rejects(command(restore(backup), targetEnv), /role ".+" does not exist/);
    assert.equal((await restored.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")).rows[0].count, 0,
      'An actual mid-restore ownership failure must roll back all restored objects');
    await administerDatabase(destination!, `CREATE ROLE ${owner}`);
    await command(restore(backup), targetEnv);
    assert.deepEqual(await proof(restored), before);
    const restoredCiphertext = Object.fromEntries((await restored.query('SELECT model_id,litellm_params FROM "LiteLLM_ProxyModelTable"')).rows.map(row => [row.model_id, row.litellm_params.api_key]));
    const cryptoRequest = { operation: 'decrypt', plaintext: 'native-provider-key', ciphertext: restoredCiphertext, key: targetEnv.LITELLM_SALT_KEY };
    assert.deepEqual(await upstreamCrypto(cryptoRequest), { legacy: true, aes: true });
    assert.deepEqual(await upstreamCrypto({ ...cryptoRequest, key: 'wrong-key' }), { legacy: false, aes: false });
    const invalid = new URL(runtimeUrl(destination!)); invalid.password = 'incorrect-runtime-password';
    const badLogin = new Pool({ connectionString: invalid.toString() });
    try { await assert.rejects(badLogin.query('SELECT 1'), { code: '28P01' }); } finally { await badLogin.end(); }
    await assert.rejects(command(restore(backup), targetEnv), /RESTORE_REQUIRES_EMPTY_DATABASE/);
    assert.deepEqual(await proof(restored), before);

    const corrupt = `${backup}-corrupt`; await cp(backup, corrupt, { recursive: true });
    await writeFile(join(corrupt, 'database.dump'), 'corrupt original archive');
    await assert.rejects(command(restore(corrupt), targetEnv), /BACKUP_CHECKSUM_MISMATCH/);
    const stale = `${backup}-stale`; await cp(backup, stale, { recursive: true });
    const oldEpoch = Math.floor(Date.now() / 1000) - 3601;
    const metadata = (await readFile(join(stale, 'metadata.env'), 'utf8')).replace(/^started_epoch=\d+$/m, `started_epoch=${oldEpoch}`).replace(/^completed_epoch=\d+$/m, `completed_epoch=${oldEpoch}`);
    await writeFile(join(stale, 'metadata.env'), metadata);
    const checksums = [];
    for (const name of ['database.dump', 'archive-toc.txt', 'metadata.env']) checksums.push(`${createHash('sha256').update(await readFile(join(stale, name))).digest('hex')}  ${name}\n`);
    await writeFile(join(stale, 'SHA256SUMS'), checksums.join(''));
    await assert.rejects(command(restore(stale), targetEnv), /BACKUP_RPO_EXCEEDED/);
    await assert.rejects(command(['backup'], { ...sourceEnv, BACKUP_MAXIMUM_RETAINED_BYTES: '67108864' }), /RETAINED_CAPACITY_EXCEEDED/);
    await assert.rejects(command(['backup'], { ...sourceEnv, BACKUP_MAXIMUM_BYTES: '1024' }), /DUMP_FAILED_INCOMPLETE_RETAINED/);
    assert((await readdir(root)).some(name => name.startsWith('.incomplete-')));
    assert.deepEqual(await proof(original), before, 'Failed backups must leave authoritative original data intact');
    t.diagnostic(`Real ${migrationSourceVersion ? `PostgreSQL${migrationSourceVersion} to ` : ''}PostgreSQL18.6; ${before.columns.length} schema columns; ${before.indexes.length} restored indexes; object ownership, atomic rollback after real SQL failure, original key/model JSON, SQL authentication and original LiteLLM legacy/AES-GCM decryption verified`);
  } finally { await Promise.all([original.end(), restored.end()]); }
});
