import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import {
  buildProjectSummaryArtifactFields,
  buildProjectSummaryDiscordFields,
  generateSummary,
  normalizeAgentInvocationKind,
  postToDiscord,
  resolveProjectPaths,
} from '../../../../../skills/nova/pipeline/tools/project-summary.ts';

function writeSwarmConfig(dir, config = {}) {
  const configPath = path.join(dir, 'swarm.config.json');
  fs.writeFileSync(configPath, JSON.stringify({ projects_root: 'Projects', ...config }));
  return configPath;
}

function writeProjectSkeleton(repoDir, project = 'demo') {
  const projectRoot = path.join(repoDir, 'Projects', project, 'src');
  const swarmRoot = path.join(projectRoot, '.swarm');
  fs.mkdirSync(path.join(swarmRoot, 'logs', 'pipeline'), { recursive: true });
  fs.writeFileSync(path.join(swarmRoot, 'progress.json'), JSON.stringify({ project }, null, 2));
  return { projectRoot, swarmRoot };
}

test('resolveProjectPaths rejects traversal project selectors before filesystem scans', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  const configPath = writeSwarmConfig(repoDir);

  assert.throws(
    () => resolveProjectPaths('../../tmp', repoDir, configPath),
    /project-summary\.project: invalid project selector/,
  );
});

test('resolveProjectPaths keeps derived paths inside the configured projects root', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  const configPath = writeSwarmConfig(repoDir);

  const paths = resolveProjectPaths('demo', repoDir, configPath);

  assert.equal(paths.projectRoot, path.join(repoDir, 'Projects', 'demo', 'src'));
  assert.equal(paths.swarmRoot, path.join(repoDir, 'Projects', 'demo', 'src', '.swarm'));
  assert.equal(paths.progressPath, path.join(repoDir, 'Projects', 'demo', 'src', '.swarm', 'progress.json'));
});

test('postToDiscord honors matrix summary mute before webhook delivery', async () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  writeSwarmConfig(repoDir);
  writeProjectSkeleton(repoDir);
  const oldWebhook = process.env.DISCORD_WEBHOOK;
  const oldMute = process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
  process.env.DISCORD_WEBHOOK = 'http://127.0.0.1:1/real-e2e-summary-muted';
  process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = '1';
  try {
    const dispatched = await postToDiscord([{ title: 'muted summary' }], { project: 'demo', repoDir });
    assert.equal(dispatched, false);
    assert.equal(fs.existsSync(path.join(repoDir, 'Projects', 'demo', 'src', '.swarm', 'logs', 'pipeline', 'discord.jsonl')), false);
  } finally {
    if (oldWebhook === undefined) delete process.env.DISCORD_WEBHOOK;
    else process.env.DISCORD_WEBHOOK = oldWebhook;
    if (oldMute === undefined) delete process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS;
    else process.env.KUBECLAW_DISABLE_DISCORD_WEBHOOKS = oldMute;
  }
});

test('project summary Discord fields use canonical runId only', () => {
  assert.deepEqual(
    buildProjectSummaryDiscordFields({ runId: 'run-canonical', run_id: 'run-legacy' }),
    [{ name: 'Run ID', value: 'run-canonical', inline: true }],
  );
  assert.deepEqual(buildProjectSummaryDiscordFields({ run_id: 'run-legacy' }), []);
});

test('project summary artifact fields prefer display paths explicitly', () => {
  assert.deepEqual(
    buildProjectSummaryArtifactFields({
      outputFile: '/tmp/project-summary.md',
      outputFileDisplay: 'Projects/demo/.swarm/project-summary.md',
      jsonOutputPath: '/tmp/project-summary.json',
    }),
    [
      { name: 'Markdown', value: '`Projects/demo/.swarm/project-summary.md`', inline: false },
      { name: 'Data', value: '`/tmp/project-summary.json`', inline: false },
    ],
  );
});

test('project summary agent invocation kind uses explicit token map', () => {
  assert.equal(normalizeAgentInvocationKind({ agent_type: 'module-forge' }), 'forge');
  assert.equal(normalizeAgentInvocationKind({ payload: { agent_type: 'review_fix' } }), 'reviewFix');
  assert.equal(normalizeAgentInvocationKind({ label: 'forge-01-nginx-1783456414145' }), 'forge');
  assert.equal(normalizeAgentInvocationKind({ label: 'echo-echo-codex-module-review-1783456568681' }), 'echo');
  assert.equal(normalizeAgentInvocationKind({ agent_type: 'unsupported-agent' }), null);
});

test('project summary uses lifecycle gates and labeled agent spawn telemetry', async () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-summary-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'summary-test@example.invalid'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Summary Test'], { cwd: repoDir });
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'summary test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repoDir });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repoDir });
  const configPath = writeSwarmConfig(repoDir);
  const { swarmRoot } = writeProjectSkeleton(repoDir);
  fs.writeFileSync(path.join(swarmRoot, 'progress.json'), JSON.stringify({
    project: 'demo',
    modules: {
      '01-app': { title: 'App', dir: '01-app' },
    },
    gates: {
      'module-review': { type: 'review', title: 'Module review gate', output_file: 'logs/echo-review/MODULE-REVIEW.json' },
    },
    execution_order: ['module:01-app', 'gate:module-review'],
  }, null, 2));
  fs.mkdirSync(path.join(swarmRoot, 'logs', 'pipeline', 'runs', 'run-demo', 'lifecycle'), { recursive: true });
  fs.writeFileSync(path.join(swarmRoot, 'logs', 'pipeline', 'runs', 'run-demo', 'lifecycle', 'read-models.json'), JSON.stringify({
    modules: {
      '01-app': { status: 'PASS', current_attempt: 1, completed_at: '2026-07-07T00:02:00.000Z', started_at: '2026-07-07T00:00:00.000Z' },
    },
    gates: {
      'module-review': { status: 'PASS', completed: true, completed_at: '2026-07-07T00:03:00.000Z', started_at: '2026-07-07T00:02:00.000Z' },
    },
  }, null, 2));
  fs.writeFileSync(path.join(swarmRoot, 'logs', 'pipeline', 'runs', 'run-demo', 'archive-manifest.json'), JSON.stringify({ run_id:'run-demo', sha256:'archive-demo' }));
  fs.writeFileSync(path.join(swarmRoot, 'logs', 'pipeline', 'run-catalog.jsonl'), `${JSON.stringify({ run_id:'run-demo', archive_reference:'runs/run-demo/archive-manifest.json', sha256:'archive-demo' })}\n`);
  fs.writeFileSync(path.join(swarmRoot, 'logs', 'pipeline', 'pipeline.jsonl'), [
    JSON.stringify({ type: 'agent.spawned', label: 'forge-01-app-1', ts: '2026-07-07T00:00:00.000Z' }),
    JSON.stringify({ type: 'agent.spawned', label: 'echo-echo-codex-module-review-1', ts: '2026-07-07T00:02:00.000Z' }),
  ].join('\n'));

  const summary = await generateSummary({ project: 'demo', repoDir, configPath });

  assert.equal(summary.data.pipeline.gateStats.find((gate) => gate.id === 'module-review')?.status, 'PASS');
  assert.equal(summary.data.agents.forge, 1);
  assert.equal(summary.data.agents.echo, 1);
  assert.equal(summary.data.agents.total, 2);
});
