#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function read(sourceRoot, relPath) {
  return fs.readFileSync(path.join(sourceRoot, relPath), 'utf8');
}

const { sourceRoot } = parseArgs();

const helperPath = 'skills/nova/pipeline/services/git-soft-fail-observability.ts';
const helper = read(sourceRoot, helperPath);
assert(helper.includes("emitObservabilityDegraded(ctx as object, {") || helper.includes("emitObservabilityDegraded(ctx, {"), 'Git soft-fail helper must be the single wrapper around observability.degraded');
assert(helper.includes("component: 'git_worktree'"), 'Git soft-fail helper must own git_worktree component');
assert(helper.includes("surface: 'commit_push'"), 'Git soft-fail helper must own commit_push surface');
assert(helper.includes("reason: 'git_commit_push_soft_failed'"), 'Git soft-fail helper must own stable reason');
assert(helper.includes('if (!detail) return false;'), 'Git soft-fail helper must no-op when a soft-fail result has no error');

const callers = [
  'skills/nova/pipeline/runners/review-gate-task.ts',
  'skills/nova/pipeline/runners/gate-forge-fix-cycle.ts',
];

for (const relPath of callers) {
  const source = read(sourceRoot, relPath);
  assert(source.includes("{ softFail: true }"), `${relPath} must retain explicit softFail git persistence`);
  assert(source.includes("import { emitGitCommitPushSoftFailDegraded } from '../services/git-soft-fail-observability.ts';"), `${relPath} must import the shared Git soft-fail observability helper`);
  assert(source.includes('emitGitCommitPushSoftFailDegraded('), `${relPath} must emit caller-owned Git soft-fail degraded telemetry`);
  assert(!source.includes("reason: 'git_commit_push_soft_failed'"), `${relPath} must not duplicate the stable Git soft-fail reason outside the helper`);
}

const reviewTask = read(sourceRoot, 'skills/nova/pipeline/runners/review-gate-task.ts');
assert(reviewTask.includes('if (reviewPublicationDegraded) {'), 'review output publication must branch on typed Git persistence degradation');
assert(reviewTask.includes('ok: false'), 'review output publication degradation must fail the review result');
assert(reviewTask.includes('output_publication_failed: true'), 'review output publication degradation must carry typed failure evidence');
assert(reviewTask.includes('Review output publication failed:'), 'review output publication degradation must be operator-visible');

const gitWorktree = read(sourceRoot, 'skills/nova/pipeline/integrations/git-worktree.ts');
assert(!gitWorktree.includes('emitGitCommitPushSoftFailDegraded'), 'low-level git helper must not own soft-fail observability');
assert(!gitWorktree.includes('emitObservabilityDegraded'), 'low-level git retry helper must not emit degraded telemetry for transient retries');

const moduleForge = read(sourceRoot, 'skills/nova/pipeline/runners/module-runner-forge.ts');
assert(!moduleForge.includes('{ softFail: true }'), 'Forge-only PASS must require durable Git persistence instead of soft-fail publication');
assert(moduleForge.includes('Forge-only module cannot PASS without durable Git persistence'), 'Forge-only thrown Git publication failures must stop PASS');
assert(moduleForge.includes('Forge-only module cannot PASS without a durable Git commit'), 'Forge-only non-committed Git results must stop PASS');

const allRunnerSource = callers.map((relPath) => read(sourceRoot, relPath)).join('\n');
const softFailCalls = [...allRunnerSource.matchAll(/gitCommitAndPush\([\s\S]*?\{\s*softFail:\s*true\s*\}/g)];
const helperCalls = [...allRunnerSource.matchAll(/emitGitCommitPushSoftFailDegraded\(/g)];
assert.equal(softFailCalls.length, 2, 'expected exactly two orchestration soft-fail git persistence call sites');
assert.equal(helperCalls.length, 2, 'the two orchestration soft-fail git sites must use the shared helper');

console.log(JSON.stringify({ ok: true, checked: 17 + callers.length * 4 }));
