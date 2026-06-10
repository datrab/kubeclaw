import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveVisualRegOverallStatus, runVisualReg, summarizeDiscordDelivery } from '../../../../../skills/buster/pipeline/suites/visual-reg.ts';
import { REPO_DIR } from '../../../../../skills/buster/pipeline/suites/repo-paths.ts';

function repoRoot() {
  return REPO_DIR;
}

test('runVisualReg rejects duplicate route names in paths.json before screenshots', async () => {
  const moduleId = `dup-visual-reg-${process.pid}`;
  const root = repoRoot();
  const baselineDir = path.join(root, '.swarm', 'modules', moduleId, 'baselines');

  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(path.join(baselineDir, 'paths.json'), JSON.stringify([
    { name: 'home', path: '/' },
    { name: 'home', path: '/settings' },
  ]));

  try {
    const verdict = await runVisualReg({ moduleId, capabilities: ['discord_media'] });

    assert.equal(verdict.status, 'ERROR');
    assert.match(verdict.error, /duplicate route name: home/);
    assert.equal(verdict.findings[0]?.rule, 'visual-baseline-contract');
  } finally {
    fs.rmSync(path.join(root, '.swarm', 'modules', moduleId), { recursive: true, force: true });
  }
});

test('runVisualReg treats missing Discord media capability as noncritical delivery skip', async () => {
  const moduleId = `discord-skip-visual-reg-${process.pid}`;
  const root = repoRoot();
  const baselineDir = path.join(root, '.swarm', 'modules', moduleId, 'baselines');
  const previousWebhook = process.env.DISCORD_WEBHOOK_URL;

  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(path.join(baselineDir, 'paths.json'), JSON.stringify([
    { name: 'home', path: '/' },
    { name: 'home', path: '/settings' },
  ]));
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.example.test/webhook';

  try {
    const verdict = await runVisualReg({ moduleId, capabilities: ['browser_automation'] });

    assert.equal(verdict.status, 'ERROR');
    assert.match(verdict.error, /duplicate route name: home/);
    assert.equal(verdict.reason, undefined);
    assert.equal(verdict.findings[0]?.rule, 'visual-baseline-contract');
  } finally {
    if (previousWebhook === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = previousWebhook;
    fs.rmSync(path.join(root, '.swarm', 'modules', moduleId), { recursive: true, force: true });
  }
});

test('runVisualReg keeps log sinks isolated across concurrent async runs', async () => {
  const root = repoRoot();
  const runId = `sink-isolation-${process.pid}-${Date.now()}`;
  const moduleA = `${runId}-a`;
  const moduleB = `${runId}-b`;
  const tmpRoot = path.join(root, '.tmp-visual-reg', runId);
  const logsA = [];
  const logsB = [];

  for (const [moduleId, routeName] of [[moduleA, 'bad/a'], [moduleB, 'bad/b']]) {
    const baselineDir = path.join(root, '.swarm', 'modules', moduleId, 'baselines');
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(path.join(baselineDir, 'paths.json'), JSON.stringify([{ name: routeName, path: '/' }]));
  }

  try {
    const [verdictA, verdictB] = await Promise.all([
      runVisualReg({
        moduleId: moduleA,
        resultsDir: path.join(tmpRoot, moduleA),
        capabilities: ['discord_media'],
        logSink: (entry) => logsA.push(entry),
      }),
      runVisualReg({
        moduleId: moduleB,
        resultsDir: path.join(tmpRoot, moduleB),
        capabilities: ['discord_media'],
        logSink: (entry) => logsB.push(entry),
      }),
    ]);

    assert.equal(verdictA.status, 'ERROR');
    assert.equal(verdictB.status, 'ERROR');

    const messagesA = logsA.map((entry) => String(entry.msg || ''));
    const messagesB = logsB.map((entry) => String(entry.msg || ''));
    assert.equal(messagesA.filter((msg) => msg.includes('evidence-only:')).length, 1);
    assert.equal(messagesB.filter((msg) => msg.includes('evidence-only:')).length, 1);
    assert.equal(messagesA.some((msg) => msg.includes(moduleB) || msg.includes('bad/b')), false);
    assert.equal(messagesB.some((msg) => msg.includes(moduleA) || msg.includes('bad/a')), false);
  } finally {
    fs.rmSync(path.join(root, '.swarm', 'modules', moduleA), { recursive: true, force: true });
    fs.rmSync(path.join(root, '.swarm', 'modules', moduleB), { recursive: true, force: true });
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('summarizeDiscordDelivery reports capability-skipped delivery as skipped noncritical metadata', () => {
  const summary = summarizeDiscordDelivery([
    { status: 'skipped_capability', sent: false, error: 'missing discord_media' },
  ]);

  assert.equal(summary.discord_sent, false);
  assert.equal(summary.discord_status, 'skipped_capability');
  assert.equal(summary.discord_attempts, 1);
  assert.equal(summary.discord_skipped, 1);
  assert.equal(summary.discord_skipped_capability, 1);
});

test('resolveVisualRegOverallStatus keeps execution errors above enforced diff failures', () => {
  assert.equal(resolveVisualRegOverallStatus([
    { status: 'PASS' },
    { status: 'FAIL' },
    { status: 'ERROR' },
  ], true), 'ERROR');
  assert.equal(resolveVisualRegOverallStatus([
    { status: 'PASS' },
    { status: 'FAIL' },
  ], true), 'FAIL');
  assert.equal(resolveVisualRegOverallStatus([
    { status: 'PASS' },
    { status: 'FAIL' },
  ], false), 'ERROR');
  assert.equal(resolveVisualRegOverallStatus([{ status: 'PASS' }]), 'PASS');
});
