import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';

test('malformed target returns 400 and leaves server and authorization intact', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_MCP_BEARER_TOKEN: 'test-only-' + 'x'.repeat(32) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('server startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`startup exit ${code}`)); });
      child.stderr.on('data', chunk => {
        const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk));
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const status = path => new Promise((resolve, reject) => {
      const r = request({ hostname: '127.0.0.1', port, path }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      r.on('error', reject); r.end();
    });
    assert.equal(await status('//['), 400);
    assert.equal(await status('/healthz'), 200);
    assert.equal(await status('/mcp'), 401);
    assert.equal(child.exitCode, null);
  } finally { child.kill('SIGTERM'); }
});
