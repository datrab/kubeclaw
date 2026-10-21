import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callMcp } from '../../../charts/kubeclaw/files/ops-mcp-client.mjs';

// This is an actual MCP backend and the shipped Nova client over real TLS.
// No successful Kubernetes response is fabricated.
test('shipped Nova client verifies MCP TLS and propagates tool denials without leaking its bearer', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-client-tls-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, 'key'), cert = join(dir, 'cert'), token = join(dir, 'token'), policy = join(dir, 'policy');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const bearer = 'test-nova-' + 'z'.repeat(40); writeFileSync(token, bearer);
  writeFileSync(policy, JSON.stringify({ clients: [{ id: 'nova', tokenFile: token, namespaces: ['kubeclaw'], tools: ['get_pod'], exec: [] }] }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_LOCAL_ONLY: '0', OPS_MCP_POLICY_FILE: policy,
      OPS_MCP_BEARER_TOKEN: '', OPS_MCP_BEARER_TOKEN_FILE: '', OPS_MCP_TLS_CERT_FILE: cert, OPS_MCP_TLS_KEY_FILE: key }, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = ''; child.stderr.on('data', x => { log += x; });
  t.after(async () => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(log)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exit ${code}: ${log}`)); });
    child.stderr.on('data', chunk => { const match = /https:\/\/127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const env = { OPS_MCP_URL: `https://localhost:${port}/mcp`, OPS_MCP_TOKEN_FILE: token, OPS_MCP_CA_FILE: cert };
  const tools = await callMcp('tools/list', {}, env);
  assert.deepEqual(tools.tools.map(x => x.name), ['get_pod']);
  await assert.rejects(callMcp('tools/call', { name: 'exec_pod', arguments: {} }, env));
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_URL: `https://127.0.0.1:${port}/mcp` }), /Hostname\/IP does not match/);
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_URL: `http://localhost:${port}/mcp` }), /HTTPS/);
  writeFileSync(token, 'bad-credential-' + 'b'.repeat(40));
  // The server reopens the same mounted file, so this models atomic rotation
  // acceptance. A client with a stale copy must now fail authentication.
  const old = join(dir, 'old-token'); writeFileSync(old, bearer);
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_TOKEN_FILE: old }), /401/);
  assert.doesNotMatch(log, new RegExp(bearer));
  assert.ok(readFileSync(cert).length > 0);
});
