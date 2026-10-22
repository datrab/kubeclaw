import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createServer } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { callMcp } from '../../../charts/kubeclaw/files/ops-mcp/client.mjs';

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
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_LOCAL_ONLY: '0', OPS_MCP_POLICY_FILE: policy, OPS_ALLOWED_NAMESPACE_PREFIXES: 'test',
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

  // The deployed adapter is the actual native connector process, not a shell
  // tool or a second catalog of locally hardcoded schemas/permissions.
  copyFileSync(fileURLToPath(new URL('../../../charts/kubeclaw/files/ops-mcp/client.mjs', import.meta.url)), join(dir, 'client.mjs'));
  copyFileSync(fileURLToPath(new URL('../../../charts/kubeclaw/files/ops-mcp/stdio.mjs', import.meta.url)), join(dir, 'stdio.mjs'));
  const adapter = spawn(process.execPath, [join(dir, 'stdio.mjs')], {
    env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(async () => { if (adapter.exitCode === null) { const exit = once(adapter, 'exit'); adapter.kill(); await exit; } });
  let adapterLog = ''; adapter.stderr.on('data', chunk => { adapterLog += chunk; });
  const lines = createInterface({ input: adapter.stdout });
  let sequence = 0;
  const requests = new Map();
  lines.on('line', line => {
    const message = JSON.parse(line);
    requests.get(message.id)?.(message);
  });
  const nativeCall = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Native adapter timed out: ${adapterLog}`)); }, 5000);
    requests.set(id, response => { clearTimeout(timer); requests.delete(id); resolve(response); });
    adapter.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const initialized = await nativeCall('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'native-contract-test', version: '1' } });
  assert.ok(initialized.result.capabilities.tools);
  adapter.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  assert.deepEqual((await nativeCall('tools/list')).result, tools);
  const denied = await nativeCall('tools/call', { name: 'get_pod', arguments: { namespace: 'forbidden', pod: 'scope-check' } });
  assert.equal(denied.result.isError, true);
  assert.match(JSON.stringify(denied.result.content), /Namespace outside the MCP scope/);
  assert.equal((await nativeCall('resources/list')).error.code, -32601);

  if (process.env.OPS_MCP_OPENCLAW_BIN) {
    await t.test('pinned OpenClaw discovers the deployed adapter as native typed tools', async () => {
      const configPath = join(dir, 'openclaw.json');
      writeFileSync(configPath, JSON.stringify({ tools: { profile: 'coding' }, mcp: { servers: { ops: {
        enabled: true, transport: 'stdio', command: process.execPath, args: [join(dir, 'stdio.mjs')], env,
        connectionTimeoutMs: 15000, requestTimeoutMs: 135000, supportsParallelToolCalls: false,
      } } } }));
      const { stdout } = await promisify(execFile)(process.env.OPS_MCP_OPENCLAW_BIN, ['mcp', 'probe', 'ops', '--json'], {
        env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: join(dir, 'state') },
        timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      });
      const result = JSON.parse(stdout);
      assert.deepEqual(result.diagnostics, []);
      assert.ok(result.tools.includes('ops__get_pod'));
      assert.equal(result.tools.some(name => name.includes('exec_pod')), false);
    });
  }

  // Central policy changes are effective without restarting the native client.
  // Buster has only test* access.
  writeFileSync(policy, JSON.stringify({ clients: [{ id: 'buster', tokenFile: token, namespaces: [], namespacePrefixes: ['test'], tools: ['get_events'], exec: [] }] }));
  assert.deepEqual((await nativeCall('tools/list')).result.tools.map(x => x.name), ['get_events']);
  const busterDenied = await nativeCall('tools/call', { name: 'get_events', arguments: { namespace: 'kubeclaw' } });
  assert.equal(busterDenied.result.isError, true);
  assert.match(JSON.stringify(busterDenied.result.content), /OPS_NAMESPACE_FORBIDDEN/);
  await assert.rejects(callMcp('tools/call', { name: 'exec_pod', arguments: {} }, env));
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_URL: `https://127.0.0.1:${port}/mcp` }), /Hostname\/IP does not match/);
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_URL: `http://localhost:${port}/mcp` }), /HTTPS/);
  writeFileSync(token, 'bad-credential-' + 'b'.repeat(40));
  assert.deepEqual((await nativeCall('tools/list')).result.tools.map(x => x.name), ['get_events']);
  // The server reopens the same mounted file, so this models atomic rotation
  // acceptance. A client with a stale copy must now fail authentication.
  const old = join(dir, 'old-token'); writeFileSync(old, bearer);
  await assert.rejects(callMcp('tools/list', {}, { ...env, OPS_MCP_TOKEN_FILE: old }), /401/);
  assert.doesNotMatch(log, new RegExp(bearer));
  assert.doesNotMatch(adapterLog, new RegExp(bearer));
  assert.ok(readFileSync(cert).length > 0);
});

test('native adapter never replays an exec after the remote connection drops', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-native-drop-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, 'key'), cert = join(dir, 'cert'), token = join(dir, 'token');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  writeFileSync(token, 'test-native-' + 'x'.repeat(40));
  let attempts = 0;
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    attempts++;
    req.resume();
    req.once('end', () => res.destroy());
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const [source, target] of [['client.mjs', 'client.mjs'], ['stdio.mjs', 'stdio.mjs']]) {
    copyFileSync(fileURLToPath(new URL(`../../../charts/kubeclaw/files/ops-mcp/${source}`, import.meta.url)), join(dir, target));
  }
  const adapter = spawn(process.execPath, [join(dir, 'stdio.mjs')], {
    env: { ...process.env, OPS_MCP_URL: `https://localhost:${server.address().port}/mcp`, OPS_MCP_TOKEN_FILE: token, OPS_MCP_CA_FILE: cert },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(async () => { if (adapter.exitCode === null) { const exit = once(adapter, 'exit'); adapter.kill(); await exit; } });
  const lines = createInterface({ input: adapter.stdout });
  const response = once(lines, 'line', { signal: AbortSignal.timeout(5000) });
  adapter.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
    name: 'exec_pod', arguments: { namespace: 'test-build', pod: 'runner', container: 'job', command: ['true'] },
  } }) + '\n');
  const result = JSON.parse((await response)[0]);
  assert.equal(result.id, 7);
  assert.match(result.error.message, /remote effects unconfirmed; do not automatically retry exec/);
  await delay(100);
  assert.equal(attempts, 1);
});
