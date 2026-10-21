import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { WebSocketServer } from 'ws';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Full MCP authorization + remotecommand integration against a TLS protocol
// fixture, not evidence of real Kubernetes RBAC or cluster acceptance.
test('MCP exec enforces caller, namespace, live pod labels and container before opening remotecommand', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-exec-integration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = join(dir, 'key'), cert = join(dir, 'cert');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  const gets = [], execs = [];
  const backend = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    gets.push(req.url);
    assert.equal(req.headers.authorization, 'Bearer fixture-api-token');
    const name = req.url.split('/').at(-1);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ metadata: { name, labels: { app: name === 'buster' ? 'buster' : 'other' } }, spec: { containers: [{ name: 'runtime' }] } }));
  });
  const wss = new WebSocketServer({ server: backend });
  wss.on('connection', (socket, req) => {
    execs.push(req.url); assert.equal(req.headers.authorization, 'Bearer fixture-api-token');
    socket.send(Buffer.concat([Buffer.from([1]), Buffer.from('command-result')]));
    socket.send(Buffer.concat([Buffer.from([3]), Buffer.from('{"status":"Success"}')])); socket.close();
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const s of wss.clients) s.terminate(); wss.close(); backend.close(); });
  const tokens = { codex: 'codex-' + 'c'.repeat(40), nova: 'nova-' + 'n'.repeat(40) };
  const clients = Object.entries(tokens).map(([id, token]) => {
    writeFileSync(join(dir, id), token);
    return { id, tokenFile: join(dir, id), namespaces: ['kubeclaw'], tools: ['exec_pod'], exec: id === 'codex'
      ? [{ namespace: 'kubeclaw', podLabels: { app: 'buster' }, containers: ['runtime'], timeoutSeconds: 5, maxOutputBytes: 1024 }] : [] };
  });
  writeFileSync(join(dir, 'policy'), JSON.stringify({ clients }));
  writeFileSync(join(dir, 'api-token'), 'fixture-api-token');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', OPS_LOCAL_ONLY: '1', OPS_MCP_POLICY_FILE: join(dir, 'policy'),
      OPS_MCP_BEARER_TOKEN: '', OPS_MCP_BEARER_TOKEN_FILE: '',
      KUBERNETES_API_URL: `https://localhost:${backend.address().port}`, KUBERNETES_CA_FILE: cert, KUBERNETES_TOKEN_FILE: join(dir, 'api-token') },
    stdio: ['ignore', 'ignore', 'pipe'] });
  let logs = ''; child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill(); await exit; } });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(logs)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exit ${code}: ${logs}`)); });
    child.stderr.on('data', chunk => { const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(chunk)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const args = { namespace: 'kubeclaw', pod: 'buster', container: 'runtime', command: ['printf', 'private-command-argument'], timeoutSeconds: 100, maxOutputBytes: 65536 };
  const call = async (client, changed = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: {
      authorization: `Bearer ${tokens[client]}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'exec_pod', arguments: { ...args, ...changed } } }) });
    const text = await res.text();
    return res.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(text.split('\n').find(x => x.startsWith('data:')).slice(5)) : JSON.parse(text);
  };
  const allowed = await call('codex');
  assert.equal(allowed.result.isError, undefined);
  assert.equal(JSON.parse(allowed.result.content[0].text).stdout, 'command-result');
  assert.equal(execs.length, 1);
  for (const [client, change] of [['nova', {}], ['codex', { pod: 'foreign' }], ['codex', { container: 'gateway' }]]) {
    const result = await call(client, change);
    assert.match(JSON.stringify(result), /TARGET_FORBIDDEN/);
  }
  const before = gets.length;
  const outside = await call('codex', { namespace: 'argocd' });
  assert.ok(outside.error || outside.result?.isError, 'global schema rejects namespaces outside the configured upper bound');
  assert.equal(gets.length, before);
  assert.equal(execs.length, 1, 'denied calls must never open remotecommand');
  assert.match(logs, /"timeoutSeconds":5,"maxOutputBytes":1024/);
  assert.match(logs, /commandSha256/);
  assert.doesNotMatch(logs, /private-command-argument|fixture-api-token/);
});
