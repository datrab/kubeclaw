import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const sync = path.join(root, 'charts/kubeclaw/files/sync-ops-mcp-config.mjs');
const render = (role, enabled) => parseAllDocuments(execFileSync('helm', ['template', `agent-${role}`, path.join(root, 'charts/kubeclaw'),
  '-f', path.join(root, `my-values/${role}-values.yaml`),
  ...(role === 'buster' ? ['-f', path.join(root, 'gitops/production/overlays/buster-ax41.yaml')] : []),
  '--set', `opsMcp.enabled=${enabled}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })).map(x => x.toJSON()).filter(Boolean);

test('native Ops connector is deployed to both gateways and retired when disabled', () => {
  for (const role of ['nova', 'buster']) for (const enabled of [true, false]) {
    const resources = render(role, enabled);
    const configMap = resources.find(x => x.kind === 'ConfigMap' && x.data?.['openclaw.json']);
    const config = JSON.parse(configMap.data['openclaw.json']);
    assert.equal(config.tools.profile, 'coding'); // Includes configured MCP servers in pinned OpenClaw.
    const connector = config.mcp?.servers?.ops;
    assert.equal(Boolean(connector), enabled);
    const pod = resources.find(x => x.kind === 'Deployment' && x.metadata.name === `agent-${role}`).spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false);
    assert.equal(pod.initContainers.some(c => c.volumeMounts?.some(m => m.name === 'ops-mcp-token')), false);
    for (const container of pod.containers.filter(c => c.name !== 'kubeclaw')) {
      assert.equal(container.volumeMounts?.some(m => m.name.startsWith('ops-mcp-')) ?? false, false);
    }
    const setup = pod.initContainers.find(c => c.name === 'init-setup');
    assert.match(setup.command.join('\n'), /node \/init-config\/sync-ops-mcp-config.mjs/);
    const doctor = pod.initContainers.find(c => c.name === 'openclaw-state-migration');
    if (doctor) {
      assert.ok(doctor.volumeMounts.some(m => m.name === 'init-config' && m.readOnly));
      assert.match(doctor.command.join('\n'), /sync-ops-mcp-config.mjs.*\n.*exec node \/app\/openclaw.mjs doctor/);
    }
    if (!enabled) continue;
    assert.equal(connector.command, 'node');
    assert.deepEqual(connector.args, ['/opt/ops-mcp-client/stdio.mjs']);
    assert.equal(connector.transport, 'stdio');
    assert.equal(connector.env.OPS_MCP_TOKEN_FILE, '/var/run/ops-mcp-client/token/token');
    assert.equal(connector.requestTimeoutMs, 135000);
    assert.equal(connector.supportsParallelToolCalls, false);
    assert.doesNotMatch(JSON.stringify(connector), /Authorization|Bearer |\/serviceaccount\//);
    const client = resources.find(x => x.kind === 'ConfigMap' && x.data?.['stdio.mjs']);
    assert.match(client.data['stdio.mjs'], /preserveToolErrors: true/);
    assert.match(client.data['client.mjs'], /rejectUnauthorized: true/);
  }
});

test('persisted config adopts/removes only the managed connector and preserves local policies', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-mcp-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configPath = path.join(dir, 'openclaw.json'), desiredPath = path.join(dir, 'desired.json');
  const local = { tools: { deny: ['ops__exec_pod'] }, mcp: { servers: { personal: { command: 'other' }, ops: { command: 'old' } } } };
  fs.writeFileSync(configPath, JSON.stringify(local));
  const connector = { command: 'node', args: ['/opt/ops-mcp-client/stdio.mjs'] };
  fs.writeFileSync(desiredPath, JSON.stringify({ mcp: { servers: { ops: connector } } }));
  execFileSync(process.execPath, [sync, configPath, desiredPath]);
  const updated = JSON.parse(fs.readFileSync(configPath));
  assert.deepEqual(updated.mcp.servers.ops, connector);
  assert.deepEqual(updated.tools, local.tools);
  assert.deepEqual(updated.mcp.servers.personal, local.mcp.servers.personal);
  fs.writeFileSync(desiredPath, '{}');
  execFileSync(process.execPath, [sync, configPath, desiredPath]);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), { ...local, mcp: { servers: { personal: local.mcp.servers.personal } } });
});
