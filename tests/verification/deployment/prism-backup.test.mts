import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ContentAddressedArtifactStore } from '../../../skills/prism/storage/artifacts.ts';
import { loadAll } from 'js-yaml';

const execute = promisify(execFile);
const script = path.resolve('charts/prism/files/prism-backup.sh');
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');

async function setup(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'prism-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = path.join(root, 'artifacts'), backups = path.join(root, 'backups'), binaries = path.join(root, 'bin');
  await Promise.all([artifacts, backups, binaries].map(directory => mkdir(directory)));
  // DB commands are explicit fixtures: these tests cover native filesystem,
  // publication, retention and chart wiring, not PostgreSQL capture or restore.
  await writeFile(path.join(binaries, 'pg_isready'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  await writeFile(path.join(binaries, 'pg_dump'), '#!/usr/bin/env bash\nset -eu\nif [[ ${1:-} == --version ]]; then echo "pg_dump fixture"; exit; fi\n[[ ${FAIL_DUMP:-0} == 0 ]] || exit 19\nfor arg in "$@"; do case "$arg" in --file=*) printf "database snapshot fixture\\n" > "${arg#--file=}";; esac; done\n', { mode: 0o755 });
  await writeFile(path.join(binaries, 'pg_restore'), '#!/usr/bin/env bash\nset -eu\n[[ $1 == --list && -s $2 ]]\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${binaries}:${process.env.PATH}`, BACKUP_ROOT: backups, ARTIFACT_ROOT: artifacts,
    BACKUP_MAXIMUM_BYTES: '8388608', BACKUP_MAXIMUM_RETAINED_BYTES: '33554432', BACKUP_MAXIMUM_DURATION_SECONDS: '30',
    PGDATABASE: 'prism', PRISM_BACKUP_IMAGE: `example.test/prism-control@sha256:${'a'.repeat(64)}` };
  const run = async (mode: string, overrides: NodeJS.ProcessEnv = {}) => (await execute('bash', [script, mode], { env: { ...env, ...overrides } })).stdout.trim();
  // Materialize committed object fixtures; reading/restoring uses the original store.
  // This does not pretend that this sandbox supports the writer's ancestor fsync.
  const store = new ContentAddressedArtifactStore(artifacts);
  const put = async (bytes: Uint8Array, directory = artifacts) => {
    const digest = hash(bytes); await mkdir(path.join(directory, digest.slice(0, 2)), { recursive: true });
    await writeFile(path.join(directory, digest.slice(0, 2), digest), bytes, { mode: 0o600 });
    return { artifactId: `artifact:sha256:${digest}`, digest: `sha256:${digest}` };
  };
  return { root, artifacts, backups, binaries, env, run, store, put };
}

test('database readiness tolerates an initial connectivity gap but never retries a failed dump', async t => {
  const fixture = await setup(t);
  const readyLog = path.join(fixture.root, 'ready.log');
  const dumpLog = path.join(fixture.root, 'dump.log');
  await writeFile(path.join(fixture.binaries, 'pg_isready'), `#!/usr/bin/env bash
set -eu
if [[ ! -e "$READY_LOG" ]]; then echo unavailable > "$READY_LOG"; exit 2; fi
echo ready >> "$READY_LOG"
`, { mode: 0o755 });
  await writeFile(path.join(fixture.binaries, 'pg_dump'), `#!/usr/bin/env bash
echo attempted >> "$DUMP_LOG"
exit 19
`, { mode: 0o755 });
  await assert.rejects(fixture.run('backup', { READY_LOG: readyLog, DUMP_LOG: dumpLog }), /DUMP_FAILED_INCOMPLETE_RETAINED/);
  assert.equal(await readFile(readyLog, 'utf8'), 'unavailable\nready\n');
  assert.equal(await readFile(dumpLog, 'utf8'), 'attempted\n');
  assert.equal((await readdir(fixture.backups)).filter(name => name.startsWith('backup-')).length, 0);
});

test('unreachable database times out before any snapshot or database operation', async t => {
  const fixture = await setup(t);
  await writeFile(path.join(fixture.binaries, 'pg_isready'), '#!/usr/bin/env bash\nexit 2\n', { mode: 0o755 });
  const started = Date.now();
  await assert.rejects(fixture.run('backup', { BACKUP_MAXIMUM_DURATION_SECONDS: '60' }), /DATABASE_NOT_READY/);
  const elapsed = Date.now() - started;
  assert(elapsed >= 29_000 && elapsed < 40_000, `readiness bound: ${elapsed}ms`);
  assert.deepEqual(await readdir(fixture.backups), ['.lock'], 'no incomplete snapshot is created before readiness');
});

test('invalid readiness invocation fails immediately; checksum verification stays offline and restore stays gated', async t => {
  const fixture = await setup(t);
  const group = await fixture.run('backup');
  await writeFile(path.join(fixture.binaries, 'pg_isready'), '#!/usr/bin/env bash\nexit 3\n', { mode: 0o755 });
  assert.equal(await fixture.run('verify'), group);
  await assert.rejects(fixture.run('backup'), /DATABASE_NOT_READY/);
  await assert.rejects(fixture.run('database-proof'), /DATABASE_NOT_READY/);
});

test('DB/object group preserves original artifact IDs on a fresh directory and retains old backups', async t => {
  const fixture = await setup(t);
  const objects = await Promise.all([Buffer.from('design bundle'), Buffer.alloc(200_000, 73)].map(bytes => fixture.put(bytes)));
  const old = path.join(fixture.backups, 'prism-20200101.dump'); await writeFile(old, 'old database-only backup');
  const pending = path.join(fixture.artifacts, hash('pending').slice(0, 2)); await mkdir(pending, { recursive: true });
  await writeFile(path.join(pending, `${hash('pending')}.00000000-0000-0000-0000-000000000000.pending`), 'not published');
  const group = await fixture.run('backup'); assert.equal(await fixture.run('verify'), group);
  assert.equal(await readFile(path.join(group, 'database.dump'), 'utf8'), 'database snapshot fixture\n');
  assert.equal(await readFile(old, 'utf8'), 'old database-only backup');
  const fresh = path.join(fixture.root, 'fresh-target'); await cp(path.join(group, 'artifacts'), fresh, { recursive: true });
  const restored = new ContentAddressedArtifactStore(fresh);
  for (const object of objects) assert.deepEqual(await restored.get(object.artifactId), await fixture.store.get(object.artifactId));
  assert.equal((await readFile(path.join(group, 'ARTIFACTS.sha256'), 'utf8')).trim().split('\n').length, 2);
  await fixture.put(Buffer.from('later object'));
  assert.equal(await fixture.run('verify'), group, 'Later source writes do not change a published group');
});

test('verification catches modified DB, missing/extra/corrupt objects, and symlinks', async t => {
  const fixture = await setup(t); const object = await fixture.put(Buffer.from('bound object'));
  const group = await fixture.run('backup');
  const database = await readFile(path.join(group, 'database.dump'));
  await writeFile(path.join(group, 'database.dump'), 'damaged'); await assert.rejects(fixture.run('verify'), /CHECKSUM_MISMATCH/);
  await writeFile(path.join(group, 'database.dump'), database);
  const relative = `${object.digest.slice(7, 9)}/${object.digest.slice(7)}`;
  const file = path.join(group, 'artifacts', relative), bytes = await readFile(file);
  await rm(file); await assert.rejects(fixture.run('verify'), /ARTIFACT_INDEX_MISMATCH/);
  await symlink(path.join(fixture.artifacts, relative), file); await assert.rejects(fixture.run('verify'), /FILE_INVALID/);
  await rm(file); await writeFile(file, 'corrupt'); await assert.rejects(fixture.run('verify'), /ARTIFACT_DIGEST_MISMATCH/);
  await writeFile(file, bytes); assert.equal(await fixture.run('verify'), group);
  await fixture.put(Buffer.from('unlisted object'), path.join(group, 'artifacts'));
  await assert.rejects(fixture.run('verify'), /ARTIFACT_INDEX_MISMATCH/);
});

test('failures and capacity limits keep previous groups and never publish partial copies', async t => {
  const fixture = await setup(t); await fixture.put(Buffer.from('retained'));
  const group = await fixture.run('backup'); const before = await readFile(path.join(group, 'SHA256SUMS'));
  await assert.rejects(fixture.run('backup', { FAIL_DUMP: '1' }), /DUMP_FAILED_INCOMPLETE_RETAINED/);
  await assert.rejects(fixture.run('backup', { BACKUP_MAXIMUM_RETAINED_BYTES: '1024' }), /RETAINED_CAPACITY_EXCEEDED/);
  await fixture.put(Buffer.alloc(2_000_000, 66));
  await assert.rejects(fixture.run('backup', { BACKUP_MAXIMUM_BYTES: '1048576' }), /GROUP_SIZE_EXCEEDED_INCOMPLETE_RETAINED/);
  assert.deepEqual((await readdir(fixture.backups)).filter(name => name.startsWith('backup-')), [path.basename(group)]);
  assert((await readdir(fixture.backups)).some(name => name.startsWith('.incomplete-')));
  assert.deepEqual(await readFile(path.join(group, 'SHA256SUMS')), before);
  assert.equal(await fixture.run('verify'), group);
});

test('corrupt or symlinked sources cannot produce a completed group', async t => {
  const fixture = await setup(t); const object = await fixture.put(Buffer.from('original'));
  const file = path.join(fixture.artifacts, object.digest.slice(7, 9), object.digest.slice(7));
  await writeFile(file, 'corrupt'); await assert.rejects(fixture.run('backup'), /ARTIFACT_DIGEST_MISMATCH/);
  await rm(file); await symlink('/etc/passwd', file); await assert.rejects(fixture.run('backup'), /FILE_INVALID/);
  assert.equal((await readdir(fixture.backups)).filter(name => name.startsWith('backup-')).length, 0);
});

test('native lock prevents overlap and whole-operation deadline kills blocked dump', async t => {
  const fixture = await setup(t);
  const held = spawn('flock', ['--exclusive', path.join(fixture.backups, '.lock'), 'bash', '-c', 'echo ready; read -r value'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = new Promise<void>(resolve => held.once('close', () => resolve()));
  t.after(async () => { held.stdin.end('release\n'); await closed; });
  await new Promise<void>(resolve => held.stdout.once('data', () => resolve()));
  await assert.rejects(fixture.run('backup'));
  held.stdin.end('release\n'); await closed;
  await writeFile(path.join(fixture.binaries, 'pg_dump'), '#!/usr/bin/env bash\nexec sleep 30\n', { mode: 0o755 });
  const started = Date.now();
  await assert.rejects(fixture.run('backup', { BACKUP_MAXIMUM_DURATION_SECONDS: '1' }), (error: any) => error.code === 124);
  assert(Date.now() - started < 5000);
  assert.equal((await readdir(fixture.backups)).filter(name => name.startsWith('backup-')).length, 0);
});

test('finished Prism jobs have bounded cleanup without changing storage or execution', async () => {
  const { stdout } = await execute(process.env.HELM_BIN ?? 'helm', ['template', 'prism', 'charts/prism', '-n', 'default', '-f', 'charts/prism/ci-values.yaml']);
  const docs = loadAll(stdout) as any[];
  const crons = docs.filter(doc => doc?.kind === 'CronJob');
  assert.equal(crons.length, 3);
  for (const cron of crons) {
    assert.equal(cron.spec.successfulJobsHistoryLimit, 1);
    assert.equal(cron.spec.failedJobsHistoryLimit, 1);
    assert.equal(cron.spec.jobTemplate.spec.ttlSecondsAfterFinished, 3600);
    assert.equal(cron.spec.jobTemplate.spec.backoffLimit, 0);
    assert.equal(cron.spec.concurrencyPolicy, 'Forbid');
    assert(cron.spec.jobTemplate.spec.template.spec.volumes.some((volume: any) => volume.persistentVolumeClaim?.claimName === 'prism-backups'));
  }
  for (const name of ['prism-migrate', 'prism-backup-storage-check']) {
    const job = docs.find(doc => doc?.kind === 'Job' && doc.metadata.name === name);
    assert.equal(job.spec.ttlSecondsAfterFinished, 3600);
    assert.equal(job.metadata.annotations['argocd.argoproj.io/hook-delete-policy'], 'BeforeHookCreation,HookSucceeded');
  }
});

test('actual Helm render runs the group script and verification has no database credentials', async () => {
  const helm = process.env.HELM_BIN ?? 'helm';
  const { stdout } = await execute(helm, ['template', 'prism', 'charts/prism', '-n', 'default', '-f', 'charts/prism/ci-values.yaml']);
  const docs = loadAll(stdout) as any[];
  const config = docs.find(item => item?.kind === 'ConfigMap' && item.metadata.name === 'prism-backup-script');
  assert.equal(config.data['prism-backup.sh'], await readFile(script, 'utf8'));
  const backup = docs.find(item => item?.kind === 'CronJob' && item.metadata.name === 'prism-backup').spec.jobTemplate.spec;
  const verification = docs.find(item => item?.kind === 'CronJob' && item.metadata.name === 'prism-backup-verification').spec.jobTemplate.spec;
  const proof = docs.find(item => item?.kind === 'CronJob' && item.metadata.name === 'prism-restore-proof');
  // Names are the strategic-merge identity, not a label for the script mode.
  // Renaming the original Helm containers left both programs running after
  // adoption; omitted args also retained the old destructive shell program.
  for (const [job, name] of [[backup, 'proof'], [verification, 'verify'], [proof.spec.jobTemplate.spec, 'restore-proof']] as const) {
    assert.equal(job.template.spec.containers.length, 1);
    assert.equal(job.template.spec.containers[0].name, name);
    assert.equal(job.template.spec.containers[0].args, null);
  }
  assert.deepEqual(proof.spec.jobTemplate.spec.template.spec.containers[0].command, ['bash', '/backup-program/prism-backup.sh', 'database-proof']);
  assert.equal(backup.backoffLimit, 0); assert.equal(backup.activeDeadlineSeconds, 3630);
  assert.equal(backup.template.spec.securityContext.runAsUser, 1000);
  assert.deepEqual(backup.template.spec.containers[0].command, ['bash', '/backup-program/prism-backup.sh', 'backup']);
  assert.equal(backup.template.spec.volumes.find((item: any) => item.name === 'artifacts').persistentVolumeClaim.readOnly, true);
  assert(!verification.template.spec.containers[0].env.some((item: any) => item.name.startsWith('PG')));
  assert(!verification.template.spec.volumes.some((item: any) => item.name === 'artifacts'));
});

test('SQL proof uses only its newly created DB and never drops a failed creation', async t => {
  const fixture = await setup(t); await fixture.put(Buffer.from('proof object')); await fixture.run('backup');
  const log = path.join(fixture.root, 'proof.log');
  for (const tool of ['createdb', 'dropdb', 'psql', 'pg_restore']) {
    await writeFile(path.join(fixture.binaries, tool), `#!/usr/bin/env bash\nset -eu\nprintf '%s:%s\\n' '${tool}' "$*" >> "$PROOF_LOG"\n[[ \${FAIL_TOOL:-} != '${tool}' ]]\n`, { mode: 0o755 });
  }
  const result = await fixture.run('database-proof', { PROOF_LOG: log });
  assert.match(result, /^PRISM_DATABASE_RESTORE_SMOKE_PASSED:prism_proof_[0-9_]+$/);
  const entries = (await readFile(log, 'utf8')).trim().split('\n');
  const database = entries[0]!.split(' ').at(-1)!;
  assert.match(database, /^prism_proof_[0-9_]+$/);
  assert.equal(entries[3], `dropdb:-- ${database}`);
  assert(entries[1]!.includes(`--exit-on-error --single-transaction --dbname=${database} `));
  assert(entries[2]!.includes(`--dbname=${database} --set=ON_ERROR_STOP=1`));
  await writeFile(log, '');
  await assert.rejects(fixture.run('database-proof', { PROOF_LOG: log, FAIL_TOOL: 'createdb' }));
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1, 'Failed creation grants no drop authority');
  await writeFile(log, '');
  await assert.rejects(fixture.run('database-proof', { PROOF_LOG: log, FAIL_TOOL: 'pg_restore' }));
  const failed = (await readFile(log, 'utf8')).trim().split('\n');
  assert.equal(failed.length, 3); assert(failed[2]!.startsWith('dropdb:-- prism_proof_'));
  await assert.rejects(fixture.run('database-proof', { PROOF_LOG: log, FAIL_TOOL: 'dropdb' }), (error: any) => {
    assert(!error.stdout.includes('PASSED')); return error.code !== 0;
  });
});
