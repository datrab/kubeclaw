import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertStartupSandboxCleanupComplete,
  handleBusterEntrypoint,
  parseBusterEntrypointArgs,
} from '../../../skills/buster/buster-pipeline.ts';
import { recoverOrphanedActiveSession } from '../../../skills/buster/pipeline/services/orphan-recovery.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(testDir, '../../../skills/buster');

function createExitRecorder() {
  const calls = [];
  return {
    calls,
    exit(code = 0) {
      calls.push(code);
      throw new Error(`exit:${code}`);
    },
  };
}

test('package manifest exposes the Buster pipeline entrypoint as a runnable command', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

  assert.equal(packageJson.scripts?.start, 'node buster-pipeline.ts');
});

test('parseBusterEntrypointArgs runs the pipeline with no extra arguments', () => {
  assert.equal(parseBusterEntrypointArgs(['node', 'buster-pipeline.ts']), 'run');
});

test('parseBusterEntrypointArgs rejects unknown arguments', () => {
  assert.throws(
    () => parseBusterEntrypointArgs(['node', 'buster-pipeline.ts', '--bogus']),
    /Unknown Buster pipeline argument/,
  );
});

test('handleBusterEntrypoint exits nonzero for unknown arguments without running main', async () => {
  const exitRecorder = createExitRecorder();
  let ranMain = false;

  await assert.rejects(
    () => handleBusterEntrypoint(['node', 'buster-pipeline.ts', '--bogus'], {
      exit: exitRecorder.exit,
      getStatus: () => ({ lastRunLogDir: null }),
      async runMain() {
        ranMain = true;
      },
    }),
    /exit:1/,
  );

  assert.deepEqual(exitRecorder.calls, [1]);
  assert.equal(ranMain, false);
});

test('handleBusterEntrypoint runs main with no extra arguments', async () => {
  const exitRecorder = createExitRecorder();
  let ranMain = false;

  await handleBusterEntrypoint(['node', 'buster-pipeline.ts'], {
    exit: exitRecorder.exit,
    getStatus: () => ({ lastRunLogDir: null }),
    async runMain() {
      ranMain = true;
    },
  });

  assert.deepEqual(exitRecorder.calls, []);
  assert.equal(ranMain, true);
});

test('assertStartupSandboxCleanupComplete reports and rejects incomplete startup cleanup', (t) => {
  const originalCwd = process.cwd();
  const originalWarn = console.warn;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-startup-cleanup-'));
  const warnings = [];

  t.after(() => {
    process.chdir(originalCwd);
    console.warn = originalWarn;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  console.warn = (...args) => warnings.push(args.join(' '));

  assert.throws(
    () => assertStartupSandboxCleanupComplete({ ok: false, errors: ['container removal failed'] }),
    /BUSTER_STARTUP_CLEANUP_INCOMPLETE: container removal failed/,
  );

  assert.equal(warnings.some((line) => line.includes('startup_cleanup_incomplete') && line.includes('container removal failed')), true);
  const diagnosticPath = path.join(tempDir, '.swarm', 'logs', 'buster', 'process-health.jsonl');
  const [line] = fs.readFileSync(diagnosticPath, 'utf8').trim().split('\n');
  const record = JSON.parse(line);
  assert.equal(record.component, 'buster_cleanup');
  assert.equal(record.surface, 'startup');
  assert.equal(record.reason, 'startup_cleanup_incomplete');
  assert.equal(record.detail, 'container removal failed');
});

test('recoverOrphanedActiveSession keeps persisted active-session files diagnostic-only without blocking startup', async (t) => {
  const originalCwd = process.cwd();
  const originalWarn = console.warn;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-orphan-recovery-'));
  const activeStatePath = path.join(tempDir, '.swarm', 'logs', 'buster', 'active-session.json');
  const warnings = [];

  t.after(() => {
    process.chdir(originalCwd);
    console.warn = originalWarn;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  console.warn = (...args) => warnings.push(args.join(' '));
  fs.mkdirSync(path.dirname(activeStatePath), { recursive: true });
  fs.writeFileSync(activeStatePath, JSON.stringify({ childSessionKey: 'agent:main:acp:buster-stale' }, null, 2));

  const result = await recoverOrphanedActiveSession({ activeStatePath });

  assert.equal(result.ok, true);
  assert.equal(result.found, true);
  assert.equal(result.recovered, false);
  assert.equal(result.cleaned, false);
  assert.equal(result.diagnosticOnly, true);
  assert.equal(result.reason, 'active_session_file_diagnostic_only');
  assert.equal(result.authority.allow_evidence_hydration, false);
  assert.equal(fs.existsSync(activeStatePath), true);
  assert.equal(warnings.some((line) => line.includes('active_session_file_diagnostic_only')), true);
});

test('recoverOrphanedActiveSession reports malformed active-session files without blocking startup', async (t) => {
  const originalCwd = process.cwd();
  const originalWarn = console.warn;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-orphan-recovery-malformed-'));
  const activeStatePath = path.join(tempDir, '.swarm', 'logs', 'buster', 'active-session.json');
  const warnings = [];

  t.after(() => {
    process.chdir(originalCwd);
    console.warn = originalWarn;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  process.chdir(tempDir);
  console.warn = (...args) => warnings.push(args.join(' '));
  fs.mkdirSync(path.dirname(activeStatePath), { recursive: true });
  fs.writeFileSync(activeStatePath, '{not json');

  const result = await recoverOrphanedActiveSession({ activeStatePath });

  assert.equal(result.ok, true);
  assert.equal(result.invalid, true);
  assert.equal(result.recovered, false);
  assert.equal(result.cleaned, false);
  assert.equal(result.diagnosticOnly, true);
  assert.equal(result.reason, 'malformed_active_session_file');
  assert.equal(result.authority.allow_evidence_hydration, false);
  assert.equal(fs.existsSync(activeStatePath), true);
  assert.equal(warnings.some((line) => line.includes('malformed_active_session_file')), true);
});
