import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { FileDurableBlobStore } from '@kubeclaw/plugin-foundation/observability/durable-records';

test('aggregate blob budget survives reconstruction, deduplicates and serializes competing processes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blob-budget-'));
  try {
    const store = new FileDurableBlobStore(root, 40, 60);
    const first = await store.put(Buffer.alloc(20, 'a'));
    const reloaded = new FileDurableBlobStore(root, 40, 60);
    assert.deepEqual(await reloaded.put(Buffer.alloc(20, 'a')), first);
    const moduleUrl = new URL('../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts', import.meta.url).href;
    const child = (letter: string) => new Promise<number>((resolve, reject) => {
      const code = `import { FileDurableBlobStore } from ${JSON.stringify(moduleUrl)};
        try { await new FileDurableBlobStore(${JSON.stringify(root)}, 40, 60).put(Buffer.alloc(40, ${JSON.stringify(letter)})); }
        catch (error) { if (error.message !== 'DURABLE_BLOB_STORE_LIMIT_EXCEEDED') throw error; process.exitCode = 23; }`;
      const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = ''; process.stderr.on('data', chunk => { stderr += chunk; });
      process.on('error', reject);
      process.on('exit', (code, signal) => {
        if (signal || (code !== 0 && code !== 23)) reject(new Error(`unexpected child failure: ${signal}:${code}:${stderr}`));
        else resolve(code!);
      });
    });
    assert.deepEqual((await Promise.all([child('b'), child('c')])).sort((a,b) => a-b), [0,23]);
    assert.deepEqual(await reloaded.get(first.digest), Buffer.alloc(20, 'a'));
    await assert.rejects(() => new FileDurableBlobStore(root, 40, 60).put(Buffer.from('extra')), /STORE_LIMIT_EXCEEDED/);
    assert.deepEqual(await reloaded.put(Buffer.alloc(20, 'a')), first, 'existing immutable content remains available at capacity');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
