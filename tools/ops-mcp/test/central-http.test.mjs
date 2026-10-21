import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real HTTP MCP requests with deliberately absent Kubernetes credentials.
// Denials must happen before any Kubernetes operation is attempted.
test('concurrent MCP clients get distinct tool lists and cannot cross namespace or identity boundaries', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-central-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const tokens = { codex: 'c'.repeat(40), nova: 'n'.repeat(40) };
  const clients = Object.entries(tokens).map(([id, token]) => {
    writeFileSync(join(dir, id), token);
    return { id, tokenFile: join(dir, id), namespaces: [id === 'codex' ? 'kubeclaw' : 'argocd'],
      tools: id === 'codex' ? ['platform_cluster_state', 'get_pod', 'exec_pod'] : ['get_pod'], exec: [] };
  });
  const policy = join(dir, 'policy'); writeFileSync(policy, JSON.stringify({ clients }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    env: { ...process.env, OPS_MCP_POLICY_FILE: policy, OPS_LOCAL_ONLY: '1', HOST: '127.0.0.1', PORT: '0',
      OPS_MCP_BEARER_TOKEN: '', OPS_MCP_BEARER_TOKEN_FILE: '', OPS_ALLOWED_NAMESPACES: 'kubeclaw,argocd',
      KUBERNETES_TOKEN_FILE: join(dir, 'forbidden-api-credential') }, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  child.stderr.on('data', data => { log += data; });
  t.after(async () => { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timeout: ' + log)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Startup failed ${code}: ${log}`)); });
    child.stderr.on('data', data => { const match = /127\.0\.0\.1:(\d+)\/mcp/.exec(String(data)); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const call = async (id, method, params) => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: {
      authorization: `Bearer ${tokens[id]}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const text = await res.text();
    return res.headers.get('content-type')?.includes('text/event-stream')
      ? JSON.parse(text.split('\n').find(x => x.startsWith('data:')).slice(5)) : JSON.parse(text);
  };
  const lists = await Promise.all(Array.from({ length: 12 }, (_, i) => call(i % 2 ? 'nova' : 'codex', 'tools/list', {})));
  lists.forEach((list, i) => assert.deepEqual(list.result.tools.map(x => x.name).sort(), i % 2 ? ['get_pod'] : ['exec_pod', 'get_pod', 'platform_cluster_state']));
  const denied = await call('nova', 'tools/call', { name: 'get_pod', arguments: { namespace: 'kubeclaw', pod: 'private' } });
  assert.match(JSON.stringify(denied), /NAMESPACE_FORBIDDEN/);
  assert.doesNotMatch(JSON.stringify(denied), /forbidden-api-credential/);
  const hidden = await call('nova', 'tools/call', { name: 'exec_pod', arguments: { namespace: 'argocd', pod: 'controller', container: 'controller', command: ['id'] } });
  assert.ok(hidden.error || hidden.result?.isError);
  // A malformed/revoked policy must reject an already authenticated client on
  // its very next request, regardless of a legacy MCP session header.
  writeFileSync(policy, '{invalid');
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, { headers: { authorization: `Bearer ${tokens.codex}`, 'mcp-session-id': 'old-session' } });
  assert.equal(res.status, 401);
  assert.doesNotMatch(log, new RegExp(tokens.codex + '|' + tokens.nova));
  assert.match(log, /ops-mcp-audit/);
});
