import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import {
  FAIL_PATTERNS,
  FAILURE_CLASS_MAP,
  classifyFailPattern,
  classifyGitPushError,
  describeFailure,
} from '../services/failures.js';

import {
  gitCommitAndPush,
  isRuntimeStatePath,
} from '../integrations/git.js';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function createGitCommitFixture(prefix) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `git-commit-hardening-${prefix}-`));
  const remoteDir = path.join(baseDir, 'remote.git');
  const repoRoot = path.join(baseDir, 'repo');
  const peerRoot = path.join(baseDir, 'peer');

  git(baseDir, ['init', '--bare', remoteDir]);
  git(baseDir, ['init', '--initial-branch=main', repoRoot]);
  git(repoRoot, ['config', 'user.email', 'tests@example.com']);
  git(repoRoot, ['config', 'user.name', 'Pipeline Tests']);
  git(repoRoot, ['remote', 'add', 'origin', remoteDir]);

  fs.mkdirSync(path.join(repoRoot, 'Projects', 'git-sync', 'src', '.swarm', 'logs', 'pipeline'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'Projects', 'git-sync', 'src', '.swarm', 'logs', 'pipeline', 'discord.jsonl'), 'initial log\n');
  fs.writeFileSync(path.join(repoRoot, 'src', 'index.js'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# fixture\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial fixture']);
  git(repoRoot, ['push', '-u', 'origin', 'main']);

  git(baseDir, ['clone', '--branch', 'main', remoteDir, peerRoot]);
  git(peerRoot, ['config', 'user.email', 'tests@example.com']);
  git(peerRoot, ['config', 'user.name', 'Pipeline Tests']);

  return {
    repoRoot,
    peerRoot,
    config: {
      project: 'git-sync',
      repo_root: repoRoot,
    },
  };
}

// ─── classifyFailPattern — existing patterns still work ──────────────────────

describe('classifyFailPattern() — existing patterns', () => {
  it('classifies BUSTER_IMAGE_UNAVAILABLE', () => {
    assert.equal(classifyFailPattern('image not known: buster-image:latest'), FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE);
    assert.equal(classifyFailPattern('no such image'), FAIL_PATTERNS.BUSTER_IMAGE_UNAVAILABLE);
  });

  it('classifies BUSTER_PORT_CONFLICT', () => {
    assert.equal(classifyFailPattern('address already in use :3000'), FAIL_PATTERNS.BUSTER_PORT_CONFLICT);
    assert.equal(classifyFailPattern('EADDRINUSE'), FAIL_PATTERNS.BUSTER_PORT_CONFLICT);
  });

  it('classifies BLUEPRINT_ALREADY_RELEASED', () => {
    assert.equal(classifyFailPattern('nothing to commit, working tree clean'), FAIL_PATTERNS.BLUEPRINT_ALREADY_RELEASED);
  });

  it('classifies FORGE_TS_COMPILE_ERROR', () => {
    assert.equal(classifyFailPattern('error TS2322: Type string is not assignable'), FAIL_PATTERNS.FORGE_TS_COMPILE_ERROR);
  });

  it('classifies GIT_REBASE_CONFLICT', () => {
    assert.equal(classifyFailPattern('CONFLICT (content): Merge conflict in src/index.js'), FAIL_PATTERNS.GIT_REBASE_CONFLICT);
    assert.equal(classifyFailPattern('rebase conflict detected'), FAIL_PATTERNS.GIT_REBASE_CONFLICT);
  });

  it('classifies MODULE_ORPHANED', () => {
    assert.equal(classifyFailPattern('BLOCKED'), FAIL_PATTERNS.MODULE_ORPHANED);
    assert.equal(classifyFailPattern('module status BLOCKED (no reason field)'), FAIL_PATTERNS.MODULE_ORPHANED);
  });

  it('returns UNKNOWN for unrecognized input', () => {
    assert.equal(classifyFailPattern('some random failure text'), FAIL_PATTERNS.UNKNOWN);
  });

  it('returns undefined for empty/blank input', () => {
    assert.equal(classifyFailPattern(''), undefined);
    assert.equal(classifyFailPattern('   '), undefined);
    assert.equal(classifyFailPattern(null), undefined);
  });
});

// ─── classifyFailPattern — new failure modes ─────────────────────────────────

describe('classifyFailPattern() — new failure modes', () => {
  it('classifies BUILD_OUTPUT_EMPTY', () => {
    assert.equal(classifyFailPattern('build output is empty'), FAIL_PATTERNS.BUILD_OUTPUT_EMPTY);
    assert.equal(classifyFailPattern('expected artifact missing after build'), FAIL_PATTERNS.BUILD_OUTPUT_EMPTY);
    assert.equal(classifyFailPattern('artifact not found at dist/bundle.js'), FAIL_PATTERNS.BUILD_OUTPUT_EMPTY);
    assert.equal(classifyFailPattern('no artifact produced by build step'), FAIL_PATTERNS.BUILD_OUTPUT_EMPTY);
  });

  it('classifies HEALTH_CHECK_TIMEOUT', () => {
    assert.equal(classifyFailPattern('health check timed out after 60s'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(classifyFailPattern('health check timeout'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(classifyFailPattern('startup never healthy'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(classifyFailPattern('startup failed to become healthy'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(classifyFailPattern('container never started'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(classifyFailPattern('container not healthy after 30 attempts'), FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
  });

  it('classifies SESSION_NO_CHANGES', () => {
    assert.equal(classifyFailPattern('session ended without changes'), FAIL_PATTERNS.SESSION_NO_CHANGES);
    assert.equal(classifyFailPattern('transcript terminal with no output'), FAIL_PATTERNS.SESSION_NO_CHANGES);
    assert.equal(classifyFailPattern('agent made no changes to any files'), FAIL_PATTERNS.SESSION_NO_CHANGES);
    assert.equal(classifyFailPattern('no changes detected after session'), FAIL_PATTERNS.SESSION_NO_CHANGES);
    assert.equal(classifyFailPattern('no output produced by agent'), FAIL_PATTERNS.SESSION_NO_CHANGES);
  });

  it('classifies PAYLOAD_CORRUPTED', () => {
    assert.equal(classifyFailPattern('parse failed: invalid JSON in status.json'), FAIL_PATTERNS.PAYLOAD_CORRUPTED);
    assert.equal(classifyFailPattern('corrupted status file'), FAIL_PATTERNS.PAYLOAD_CORRUPTED);
    assert.equal(classifyFailPattern('malformed completion payload'), FAIL_PATTERNS.PAYLOAD_CORRUPTED);
    assert.equal(classifyFailPattern('unexpected token in JSON at position 0'), FAIL_PATTERNS.PAYLOAD_CORRUPTED);
    assert.equal(classifyFailPattern('invalid json'), FAIL_PATTERNS.PAYLOAD_CORRUPTED);
  });

  it('classifies RATE_LIMIT_EXHAUSTED', () => {
    assert.equal(classifyFailPattern('rate limit exhausted after 5 recovery attempts'), FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED);
    assert.equal(classifyFailPattern('rate-limit recovery failed'), FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED);
    assert.equal(classifyFailPattern('max rate limit attempts reached'), FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED);
    assert.equal(classifyFailPattern('repeated rate-limit errors'), FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED);
  });

  it('classifies OUTPUT_FILE_MISSING', () => {
    assert.equal(classifyFailPattern('output file missing after gate completed'), FAIL_PATTERNS.OUTPUT_FILE_MISSING);
    assert.equal(classifyFailPattern('expected output file not found'), FAIL_PATTERNS.OUTPUT_FILE_MISSING);
    assert.equal(classifyFailPattern('gate output missing'), FAIL_PATTERNS.OUTPUT_FILE_MISSING);
    assert.equal(classifyFailPattern('review output missing at expected path'), FAIL_PATTERNS.OUTPUT_FILE_MISSING);
  });

  it('classifies GIT_SYNC_FAILED', () => {
    assert.equal(classifyFailPattern('git sync failed before Buster handoff: push rejected'), FAIL_PATTERNS.GIT_SYNC_FAILED);
    assert.equal(classifyFailPattern('failed before buster handoff'), FAIL_PATTERNS.GIT_SYNC_FAILED);
  });

  it('classifies GIT_PUSH_REJECTED', () => {
    assert.equal(classifyFailPattern('[rejected] refs/heads/main -> main (non-fast-forward)'), FAIL_PATTERNS.GIT_PUSH_REJECTED);
    assert.equal(classifyFailPattern('updates were rejected'), FAIL_PATTERNS.GIT_PUSH_REJECTED);
    assert.equal(classifyFailPattern('push rejected by remote'), FAIL_PATTERNS.GIT_PUSH_REJECTED);
  });
});

// ─── FAILURE_CLASS_MAP / describeFailure ─────────────────────────────────────

describe('FAILURE_CLASS_MAP completeness', () => {
  it('has an entry for every FAIL_PATTERNS value', () => {
    for (const [key, code] of Object.entries(FAIL_PATTERNS)) {
      assert.ok(
        FAILURE_CLASS_MAP[code],
        `FAILURE_CLASS_MAP missing entry for FAIL_PATTERNS.${key} (code="${code}")`
      );
    }
  });

  it('every entry has required fields', () => {
    for (const [code, entry] of Object.entries(FAILURE_CLASS_MAP)) {
      assert.ok(entry.class, `entry for "${code}" missing .class`);
      assert.ok(entry.recoverability, `entry for "${code}" missing .recoverability`);
      assert.ok(entry.escalation, `entry for "${code}" missing .escalation`);
      assert.ok(entry.summary, `entry for "${code}" missing .summary`);
      assert.ok(entry.guidance, `entry for "${code}" missing .guidance`);
    }
  });
});

describe('describeFailure()', () => {
  it('returns structured record for known codes', () => {
    const d = describeFailure(FAIL_PATTERNS.BUILD_OUTPUT_EMPTY);
    assert.equal(d.class, 'build');
    assert.equal(d.recoverability, 'retry');
    assert.ok(d.summary.length > 0);
    assert.ok(d.guidance.length > 0);
  });

  it('returns structured record for HEALTH_CHECK_TIMEOUT', () => {
    const d = describeFailure(FAIL_PATTERNS.HEALTH_CHECK_TIMEOUT);
    assert.equal(d.class, 'health');
    assert.equal(d.escalation, 'NEEDS_NOVA');
  });

  it('returns structured record for SESSION_NO_CHANGES', () => {
    const d = describeFailure(FAIL_PATTERNS.SESSION_NO_CHANGES);
    assert.equal(d.class, 'session');
    assert.equal(d.recoverability, 'retry');
  });

  it('returns structured record for PAYLOAD_CORRUPTED', () => {
    const d = describeFailure(FAIL_PATTERNS.PAYLOAD_CORRUPTED);
    assert.equal(d.class, 'payload');
    assert.ok(d.guidance.includes('status.json') || d.guidance.includes('retry'));
  });

  it('returns structured record for RATE_LIMIT_EXHAUSTED', () => {
    const d = describeFailure(FAIL_PATTERNS.RATE_LIMIT_EXHAUSTED);
    assert.equal(d.class, 'infra');
    assert.equal(d.recoverability, 'needs_nova');
  });

  it('falls back to unknown entry for unrecognized code', () => {
    const d = describeFailure('NO_SUCH_CODE');
    assert.equal(d.class, 'unknown');
    assert.equal(d.escalation, 'NEEDS_NOVA');
  });
});

// ─── classifyGitPushError ─────────────────────────────────────────────────────

describe('classifyGitPushError()', () => {
  it('classifies non-fast-forward as GIT_PUSH_REJECTED', () => {
    assert.equal(
      classifyGitPushError('! [rejected] main -> main (non-fast-forward)'),
      FAIL_PATTERNS.GIT_PUSH_REJECTED
    );
    assert.equal(
      classifyGitPushError('Updates were rejected because the remote contains work you do not have locally'),
      FAIL_PATTERNS.GIT_PUSH_REJECTED
    );
  });

  it('classifies auth failure as GIT_PUSH_FAILED', () => {
    assert.equal(
      classifyGitPushError('Permission denied (publickey)'),
      FAIL_PATTERNS.GIT_PUSH_FAILED
    );
    assert.equal(
      classifyGitPushError('Authentication failed for https://github.com/org/repo'),
      FAIL_PATTERNS.GIT_PUSH_FAILED
    );
  });

  it('classifies network errors as GIT_PUSH_FAILED', () => {
    assert.equal(
      classifyGitPushError('Connection timed out'),
      FAIL_PATTERNS.GIT_PUSH_FAILED
    );
    assert.equal(
      classifyGitPushError('network error: connection reset by peer'),
      FAIL_PATTERNS.GIT_PUSH_FAILED
    );
  });

  it('classifies sync handoff error as GIT_SYNC_FAILED', () => {
    assert.equal(
      classifyGitPushError('git sync failed before buster handoff'),
      FAIL_PATTERNS.GIT_SYNC_FAILED
    );
  });

  it('defaults to GIT_PUSH_FAILED for unrecognized push error', () => {
    assert.equal(
      classifyGitPushError('some unexpected git error'),
      FAIL_PATTERNS.GIT_PUSH_FAILED
    );
    assert.equal(classifyGitPushError(''), FAIL_PATTERNS.GIT_PUSH_FAILED);
    assert.equal(classifyGitPushError(null), FAIL_PATTERNS.GIT_PUSH_FAILED);
  });
});

// ─── isRuntimeStatePath — git recovery allowlist ─────────────────────────────

describe('isRuntimeStatePath() — deterministic allowlist for safe git recovery', () => {
  // Safe: pipeline-owned runtime state that can be auto-resolved

  it('allows .swarm/logs/ paths (runtime log files)', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/logs/pipeline/discord.jsonl'), true);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/logs/modules/01-init/forge.jsonl'), true);
    assert.equal(isRuntimeStatePath('src/.swarm/logs/pipeline/config-validation.json'), true);
  });

  it('allows module status.json paths', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/modules/01-init/status.json'), true);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/modules/06-failure-and-git-hardening/status.json'), true);
  });

  it('allows gate-status.json paths', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/01-gate-status.json'), true);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/final-gate-status.json'), true);
  });

  it('allows .swarm summary files', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/pipeline-summary.json'), true);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/project-summary.md'), true);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/run-summary.json'), true);
  });

  // Unsafe: source files that must NOT be auto-resolved

  it('refuses source code files (src/)', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/pipeline/services/failures.js'), false);
    assert.equal(isRuntimeStatePath('src/index.ts'), false);
  });

  it('refuses config files', () => {
    assert.equal(isRuntimeStatePath('package.json'), false);
    assert.equal(isRuntimeStatePath('tsconfig.json'), false);
    assert.equal(isRuntimeStatePath('.env'), false);
  });

  it('refuses test files', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/pipeline/tests/06-failure-git-hardening.test.js'), false);
  });

  it('refuses module FORGE.md and blueprint files', () => {
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/modules/01-init/FORGE.md'), false);
    assert.equal(isRuntimeStatePath('Projects/foo/src/.swarm/modules/01-init/BLUEPRINT.md'), false);
  });

  it('refuses non-swarm JSON files', () => {
    assert.equal(isRuntimeStatePath('config/pipeline.json'), false);
  });
});

describe('gitCommitAndPush() — runtime-state stash hardening', () => {
  it('auto-resolves stash-pop conflicts only for runtime-state files', async () => {
    const fixture = createGitCommitFixture('runtime-conflict');
    const runtimeFile = path.join('Projects', 'git-sync', 'src', '.swarm', 'logs', 'pipeline', 'discord.jsonl');

    fs.writeFileSync(path.join(fixture.repoRoot, runtimeFile), 'local runtime change\n');
    fs.writeFileSync(path.join(fixture.repoRoot, 'committed.txt'), 'commit me\n');

    fs.writeFileSync(path.join(fixture.peerRoot, runtimeFile), 'remote runtime change\n');
    git(fixture.peerRoot, ['add', runtimeFile]);
    git(fixture.peerRoot, ['commit', '-m', 'remote runtime update']);
    git(fixture.peerRoot, ['push', 'origin', 'main']);

    const result = await gitCommitAndPush(fixture.config, 'local commit', { addPaths: ['committed.txt'] });

    assert.equal(result.committed, true);
    assert.equal(fs.readFileSync(path.join(fixture.repoRoot, runtimeFile), 'utf8'), 'remote runtime change\n');
    assert.equal(git(fixture.repoRoot, ['diff', '--name-only', '--diff-filter=U']), '');
    assert.equal(git(fixture.repoRoot, ['stash', 'list']), '');
  });

  it('fails closed before pull when dirty files fall outside the runtime-state allowlist', async () => {
    const fixture = createGitCommitFixture('source-conflict');
    const sourceFile = path.join('src', 'index.js');

    fs.writeFileSync(path.join(fixture.repoRoot, sourceFile), 'export const value = 2;\n');
    fs.writeFileSync(path.join(fixture.repoRoot, 'committed.txt'), 'commit me\n');

    fs.writeFileSync(path.join(fixture.peerRoot, sourceFile), 'export const value = 99;\n');
    git(fixture.peerRoot, ['add', sourceFile]);
    git(fixture.peerRoot, ['commit', '-m', 'remote source update']);
    git(fixture.peerRoot, ['push', 'origin', 'main']);

    await assert.rejects(
      () => gitCommitAndPush(fixture.config, 'local commit', { addPaths: ['committed.txt'] }),
      (error) => {
        assert.equal(error.code, FAIL_PATTERNS.GIT_SYNC_FAILED);
        assert.match(error.message, /Refusing to stash non-runtime local changes/i);
        assert.match(error.message, /node pipeline\.js --project git-sync --resume/);
        assert.doesNotMatch(error.message, /--module\b/);
        return true;
      },
    );

    assert.equal(git(fixture.repoRoot, ['diff', '--name-only', '--diff-filter=U']), '');
    assert.equal(git(fixture.repoRoot, ['stash', 'list']), '');
    assert.match(git(fixture.repoRoot, ['status', '--porcelain']), /src\/index\.js/);
  });
});
