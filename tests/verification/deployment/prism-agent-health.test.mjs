import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { loadAll } from 'js-yaml';

const execute = promisify(execFile);
async function render(release, chart, values, namespace = 'kubeclaw') {
  const { stdout } = await execute(process.env.HELM_BIN || 'helm', ['template', release, chart, '-n', namespace, '-f', values], { maxBuffer: 8 * 1024 * 1024 });
  return loadAll(stdout).filter(Boolean);
}

test('rendered bridge probes reach the original loopback server and fail when it stops', async () => {
  const resources = await render('agent-prism', 'charts/kubeclaw', 'my-values/prism-agent-values.yaml');
  const deployment = resources.find(r => r.kind === 'Deployment' && r.metadata.name === 'agent-prism');
  const bridge = deployment.spec.template.spec.containers.find(c => c.name === 'prism-agent-bridge');
  const commands = ['readinessProbe', 'livenessProbe'].map(key => {
    const probe = bridge[key];
    assert.equal(probe.httpGet, undefined);
    assert.equal(probe.exec.command[0], 'node');
    assert.match(probe.exec.command[2], /127\.0\.0\.1:18080/);
    return probe.exec.command.slice(1);
  });
  const child = spawn(process.execPath, ['skills/prism/server/agent-bridge.mjs'], {
    env: { ...process.env, PORT: '18080', PRISM_CONTROL_URL: 'http://127.0.0.1:1' }, stdio: 'ignore',
  });
  const closed = once(child, 'close');
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, 'original bridge must stay alive');
      try { ready = (await fetch('http://127.0.0.1:18080/ready')).ok; } catch {}
      if (ready) break;
      await delay(20);
    }
    assert.ok(ready);
    for (const command of commands) await execute(process.execPath, command);
  } finally { child.kill('SIGTERM'); await closed; }
  for (const command of commands) await assert.rejects(execute(process.execPath, command));
});

test('Prism agent Redis egress is restricted to the intended local workload and port', async () => {
  const resources = await render('prism', 'charts/prism', 'charts/prism/ci-values.yaml', 'default');
  const policy = resources.find(r => r.kind === 'NetworkPolicy' && r.metadata.name === 'prism-openclaw-agent');
  const rules = policy.spec.egress.filter(rule => rule.ports?.some(port => port.port === 6379));
  assert.deepEqual(rules, [{
    to: [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'redis', 'app.kubernetes.io/instance': 'redis' } } }],
    ports: [{ protocol: 'TCP', port: 6379 }],
  }]);
  assert.ok(policy.spec.ingress.every(rule => rule.ports.every(port => port.port !== 18080)), 'raw bridge must remain private');
});
