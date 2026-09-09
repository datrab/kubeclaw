import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAddressedArtifactStore } from '../storage/index.ts';

async function temporary(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'prism-artifacts-durable-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const location = (root: string, hash: string) => join(root, hash.slice(0, 2), hash);

test('corrupt existing object is never acknowledged or overwritten and failed pending is removed', async t => {
  const root = await temporary(t); const store = new ContentAddressedArtifactStore(root);
  const bytes = Buffer.from('accepted immutable content'); const first = await store.put(bytes); const file = location(root, hex(bytes));
  await writeFile(file, 'damaged');
  await assert.rejects(store.put(bytes), /PRISM_ARTIFACT_CORRUPT/u);
  await assert.rejects(store.get(first.artifactId), /PRISM_ARTIFACT_CORRUPT/u);
  assert.equal(await readFile(file, 'utf8'), 'damaged');
  assert.deepEqual(await readdir(join(root, hex(bytes).slice(0, 2))), [hex(bytes)]);
  await rm(file); const outside = join(root, 'outside'); await writeFile(outside, bytes); await symlink(outside, file);
  await assert.rejects(store.put(bytes), { code: 'ELOOP' });
  assert.deepEqual(await readFile(outside), bytes);
});

test('put snapshots caller buffers before IO and retained IDs survive a new store instance', async t => {
  const root = await temporary(t); const store = new ContentAddressedArtifactStore(root);
  const bytes = Buffer.alloc(2_000_000, 65); const expected = Buffer.from(bytes); const pending = store.put(bytes);
  bytes.fill(66); const stored = await pending;
  assert.equal(stored.digest, `sha256:${hex(expected)}`); assert.equal(stored.sizeBytes, expected.length);
  assert.deepEqual(Buffer.from(await new ContentAddressedArtifactStore(root).get(stored.artifactId)), expected);
});

test('independent native writers atomically install identical content and leave no pending files', async t => {
  const root = await temporary(t); const module = new URL('../storage/artifacts.ts', import.meta.url).href;
  const source = `import {ContentAddressedArtifactStore} from ${JSON.stringify(module)};
    const store = new ContentAddressedArtifactStore(process.argv[1]);
    for(let i=0;i<4;i++) await store.put(Buffer.alloc(2000000,65));`;
  await Promise.all(Array.from({ length: 4 }, async () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
    const [code] = await once(child, 'exit'); assert.equal(code, 0, stderr);
  }));
  const expected = Buffer.alloc(2_000_000, 65); const hash = hex(expected);
  assert.deepEqual(Buffer.from(await new ContentAddressedArtifactStore(root).get(`artifact:sha256:${hash}`)), expected);
  assert.deepEqual(await readdir(join(root, hash.slice(0, 2))), [hash]);
});

test('acknowledged native writer content remains readable after SIGKILL', async t => {
  const root = await temporary(t); const module = new URL('../storage/artifacts.ts', import.meta.url).href;
  const source = `import {ContentAddressedArtifactStore} from ${JSON.stringify(module)};
    const store = new ContentAddressedArtifactStore(process.argv[1]);
    for(let i=0;i<100;i++) { const stored=await store.put(Buffer.alloc(2000000,i)); console.log(JSON.stringify({i,...stored})); }`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, root], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  const closed = once(child, 'close');
  child.stdout.on('data', b => { output += b; if (output.includes('\n')) child.kill('SIGKILL'); });
  await closed; assert.equal(child.signalCode, 'SIGKILL', stderr);
  const records = output.split('\n').filter(Boolean).map(line => JSON.parse(line)); assert(records.length > 0);
  const reopened = new ContentAddressedArtifactStore(root);
  for (const record of records) assert.deepEqual(Buffer.from(await reopened.get(record.artifactId)), Buffer.alloc(2_000_000, record.i));
});


test('actual FIFO objects reject without blocking get or existing-object put', async t => {
  const root = await temporary(t); const bytes = Buffer.from('fifo-case'); const store = new ContentAddressedArtifactStore(root);
  const stored = await store.put(bytes); const file = location(root, hex(bytes)); await rm(file);
  const made = spawnSync('mkfifo', [file]); assert.equal(made.status, 0, made.stderr.toString());
  const module = new URL('../storage/artifacts.ts', import.meta.url).href;
  const source = `import assert from 'node:assert/strict'; import {ContentAddressedArtifactStore} from ${JSON.stringify(module)};
    const bound=setTimeout(()=>{console.error('FIFO_OPEN_BLOCKED');process.exit(23)},1000);
    const store=new ContentAddressedArtifactStore(process.argv[1]);
    await assert.rejects(store.get(process.argv[2]),/PRISM_ARTIFACT_NOT_REGULAR/);
    await assert.rejects(store.put(Buffer.from('fifo-case')),/PRISM_ARTIFACT_NOT_REGULAR/);clearTimeout(bound);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, root, stored.artifactId], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = ''; child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
  const [code] = await once(child, 'exit'); assert.equal(code, 0, stderr);
  assert.deepEqual(await readdir(join(root, hex(bytes).slice(0, 2))), [hex(bytes)]);
});
