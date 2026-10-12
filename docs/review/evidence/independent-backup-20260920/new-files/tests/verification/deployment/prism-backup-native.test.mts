import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, cp, rename, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate, RevisionRepository, ContentAddressedArtifactStore } from '../../../skills/prism/storage/index.ts';

// Mandatory opt-in native gate: missing infrastructure fails, never skips.
// It proves real DB/object restore after retirement, not session/job recovery.
const source = process.env.PRISM_BACKUP_TEST_SOURCE_URL;
const target = process.env.PRISM_BACKUP_TEST_TARGET_URL;
assert(source && target && source !== target, 'Two disposable independent PostgreSQL server URLs required');
for (const value of [source, target]) assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname), 'Disposable loopback servers required');
const execute = promisify(execFile);
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const script = path.resolve('charts/prism/files/prism-backup.sh');

test('native PostgreSQL and original Prism repositories restore after manual backup retirement', { timeout: 120000 }, async () => {
  const database = `prism_backup_${randomUUID().replaceAll('-', '')}`;
  const admins = [new Pool({ connectionString: source }), new Pool({ connectionString: target })];
  const pools: Pool[] = [];
  const created: number[] = [];
  const root = await mkdtemp(path.join(tmpdir(), 'prism-backup-native-'));
  try {
    for (const [index, admin] of admins.entries()) {
      await admin.query(`CREATE DATABASE ${database}`); created.push(index);
      const url = new URL(index === 0 ? source! : target!); url.pathname = `/${database}`;
      pools.push(new Pool({ connectionString: url.href }));
    }
    const [original, restored] = pools as [Pool, Pool];
    // Distinct server identities and data directories, not two DB names on one server.
    const serverIdentities = await Promise.all(admins.map(admin => admin.query('SELECT system_identifier FROM pg_control_system()')));
    assert.notEqual(serverIdentities[0]!.rows[0].system_identifier, serverIdentities[1]!.rows[0].system_identifier);
    const directories = await Promise.all(admins.map(admin => admin.query('SHOW data_directory')));
    assert.notEqual(directories[0]!.rows[0].data_directory, directories[1]!.rows[0].data_directory);
    await migrate(original);
    // Restore roles are infrastructure, created through the same migration API;
    // remove its schema so pg_restore owns the actual schema/data creation.
    await migrate(restored); await restored.query('DROP SCHEMA prism CASCADE');
    const repository = new RevisionRepository(original);
    const project = await repository.createProject('backup-native', 'Recovery proof');
    const document = JSON.parse(await readFile('contracts/prism/v1/fixtures/minimal-web.json', 'utf8'));
    const documentId = await repository.createDocument(project, 'primary', document, 'native-test');
    await repository.apply(documentId, { type: 'node.props.set', baseRevision: 1, nodeId: 'title', props: { content: 'Retained revision' } }, 'native-test');
    const artifacts = path.join(root, 'artifacts'), backups = path.join(root, 'backups'), copies = path.join(root, 'copies');
    await Promise.all([artifacts, backups, copies].map(directory => mkdir(directory)));
    const store = new ContentAddressedArtifactStore(artifacts);
    const object = await store.put(Buffer.alloc(1_200_000, 71));
    const sourceUrl = new URL(source!);
    const env = { ...process.env, PGHOST: sourceUrl.hostname, PGPORT: sourceUrl.port,
      PGUSER: decodeURIComponent(sourceUrl.username), PGPASSWORD: decodeURIComponent(sourceUrl.password), PGDATABASE: database,
      BACKUP_ROOT: backups, ARTIFACT_ROOT: artifacts, BACKUP_MAXIMUM_BYTES: '8388608',
      BACKUP_MAXIMUM_RETAINED_BYTES: '33554432', BACKUP_MAXIMUM_DURATION_SECONDS: '60',
      PRISM_BACKUP_IMAGE: `example.test/prism@sha256:${'a'.repeat(64)}` };
    const run = async (mode: string, overrides = {}) => (await execute('bash', [script, mode], { env: { ...env, ...overrides } })).stdout.trim();
    const first = path.join(backups, 'backup-001'); await rename(await run('backup'), first);
    await cp(first, path.join(copies, 'backup-001'), { recursive: true });
    const second = path.join(backups, 'backup-002'); await rename(await run('backup'), second);
    await assert.rejects(run('backup', { BACKUP_MAXIMUM_RETAINED_BYTES: '5000000' }), /GROUP_SIZE_EXCEEDED_INCOMPLETE_RETAINED/);
    await run('retire', { BACKUP_RETIRE_GROUP: 'backup-001', BACKUP_COPY_ROOT: copies,
      BACKUP_RETIRE_SHA256: sha(await readFile(path.join(first, 'SHA256SUMS'))) });
    for (const name of (await readdir(backups)).filter(name => name.startsWith('.incomplete-'))) await run('discard-incomplete', { BACKUP_DISCARD_INCOMPLETE: name });
    const group = await run('backup', { BACKUP_MAXIMUM_RETAINED_BYTES: '5000000' });
    const tables = (await original.query("SELECT tablename FROM pg_tables WHERE schemaname='prism' ORDER BY tablename")).rows.map(row => row.tablename as string);
    const inventory = async (db: Pool) => Promise.all(tables.map(async table => {
      assert.match(table, /^[a-z0-9_]+$/);
      return [table, (await db.query(`SELECT to_jsonb(t) AS row FROM prism.${table} t ORDER BY to_jsonb(t)::text`)).rows];
    }));
    const expected = await inventory(original);
    // A post-backup mutation makes accidentally querying the source detectable.
    await repository.apply(documentId, { type: 'node.props.set', baseRevision: 2, nodeId: 'title', props: { content: 'Not in backup' } }, 'native-test');
    const targetUrl = new URL(target!);
    await execute('pg_restore', ['--exit-on-error', '--single-transaction', `--dbname=${database}`, path.join(group, 'database.dump')], { env: { ...env,
      PGHOST: targetUrl.hostname, PGPORT: targetUrl.port, PGUSER: decodeURIComponent(targetUrl.username), PGPASSWORD: decodeURIComponent(targetUrl.password) } });
    assert.deepEqual(await inventory(restored), expected, 'Every Prism table and row from the quiescent snapshot survives');
    const restoredObjects = path.join(root, 'restored-artifacts'); await cp(path.join(group, 'artifacts'), restoredObjects, { recursive: true });
    await rm(artifacts, { recursive: true });
    assert.deepEqual(Buffer.from(await new ContentAddressedArtifactStore(restoredObjects).get(object.artifactId)), Buffer.alloc(1_200_000, 71));
    const current = await new RevisionRepository(restored).current(documentId);
    assert.equal(current.document.meta.revision, 2);
    await new RevisionRepository(restored).apply(documentId, { type: 'node.props.set', baseRevision: 2, nodeId: 'title', props: { content: 'Restored edit' } }, 'native-test');
    assert.equal((await new RevisionRepository(restored).current(documentId)).document.meta.revision, 3);
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
    for (const index of created) await admins[index]!.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await Promise.all(admins.map(pool => pool.end()));
    await rm(root, { recursive: true, force: true });
  }
});
