// prompts/shared.js — Common prompt sections used by multiple prompt builders
// Extracted from pipeline-original.js (module 07)

import path from 'path';
import { relPath, statusPath, modulePath, swarmRoot, projectSrcPath } from '../core/paths.js';

// ─── Return shape helper ──────────────────────────────────────────────────────
// All prompt builders return this shape. The .toString() shim lets callers
// that still use the return value as a plain string continue to work unchanged.
export function makePromptResult(prompt, metadata = {}) {
  const result = {
    prompt,
    metadata: { phase: '', moduleId: '', attempt: 1, recalledMemoryIds: [], ...metadata },
  };
  result.toString = () => result.prompt;
  return result;
}

// ─── Shared section builders ──────────────────────────────────────────────────

export function buildGitSyncSection(commitHash) {
  const lines = [
    '## Git Context',
    '',
    'The orchestrator already synced the repo before your session started. Do NOT run `git pull`.',
    '',
  ];
  if (commitHash) {
    lines.push(
      `Expected commit: \`${commitHash.substring(0, 8)}\``,
      '',
    );
  }
  lines.push('---', '');
  return lines;
}

export function buildAvailableToolsSection() {
  return [
    '## Available Tools',
    '',
    'All scripts at `/app/skills/`. All env vars are pre-set.',
    '',
    '### What the Orchestrator Already Did',
    '',
    '- `git pull` — repo is synced to the expected commit',
    '- Build + Serve — the app is running (URL in Pre-Test Results above)',
    '- Deterministic test suites (build, health, a11y, perf, etc.) — results in Pre-Test Results above',
    '- Do **NOT** run `sandbox-build`, `sandbox-serve`, `sandbox-cleanup`, or `git pull`',
    '',
    '### Testing Tools',
    '```',
    'npx playwright test              # E2E tests',
    'k6 run script.js                 # Load tests',
    'curl -s <url> | jq .             # Quick HTTP checks',
    'node /app/skills/visual-audit.js "<url>" [--mode image|video]  # Screenshot/video to Discord',
    '```',
    '',
    '### Completion (redis.cjs)',
    '',
    '**See the completion steps in "When Testing Is Complete" below.** Do NOT use this as a template —',
    'the completion command requires `--task-type` where applicable and a real `--summary` with actual test results.',
    '',
    '### Conventions',
    '',
    'Follow `/app/skills/buster/CONVENTIONS.md`:',
    '- Output: JSON to stdout (not Markdown)',
    '- Naming: `test-<suite>-<module>-<attempt>.js`',
    '- Timeouts: Every request and script must have a timeout',
    '- Error reports: Repro-Steps, Actual vs Expected, Environment, Severity',
    '- Exit codes: 0 = PASS, 1 = FAIL, 2 = ERROR',
    '',
    '---',
    '',
  ];
}

export function buildTestWorkspaceSection(testWorkspacePath) {
  return [
    '## Test Workspace',
    '',
    `**Test directory:** \`${testWorkspacePath}/\``,
    '',
    'Simple checks (curl, ls, single commands) can run inline.',
    'Multi-step tests, Playwright scripts, k6 scenarios, or anything longer than a few lines:',
    'write as an executable script file in the test directory above, then run it.',
    'This keeps your tests documented and reproducible.',
    '',
    '- Create the directory if it does not exist',
    '- The application code is **read-only** (changes outside `.swarm/` will be reverted)',
    '- Reference application code via relative paths to **Project Source**',
    '',
    '---',
    '',
  ];
}

export function buildBusterCompletionProtocol(config, moduleId, dir, status) {
  const statusJsonPath = relPath(config, statusPath(config, dir));

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Update status.json',
    '',
    `Update \`${statusJsonPath}\`:`,
    '- Read the existing JSON first (it contains pipeline metadata — do NOT overwrite it)',
    '- Set `"status"` to `"PASS"` if all tests pass, or `"FAIL"` if any test fails',
    '- If FAIL: increment `"fail_count"` and add a `"fail_summaries"` entry:',
    '  ```json',
    '  { "attempt": N, "timestamp": "ISO", "summary": "<what failed and why — be specific>", "phase": "buster" }',
    '  ```',
    '- If PASS: set `"completion_summary"` with test results overview',
    '- Set `"current_phase"` to `null`',
    '',
    '### Step 2: Signal Completion',
    '',
    'This is your **LAST** action:',
    '```bash',
    `node /app/skills/redis.cjs \\`,
    `  --action complete \\`,
    `  --module ${moduleId} \\`,
    `  --status <PASS|FAIL> \\`,
    `  --summary "<N tests passed, M failed: <specific failures>. Key findings: <1-2 sentence overview>>"`,
    '```',
    '',
    '⚠️ The `--summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}

export function buildBusterGateCompletionProtocol(config, gateId, gate) {
  const outputFile = gate.output_file
    ? relPath(config, path.join(swarmRoot(config), gate.output_file))
    : null;

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Write Results',
    '',
    outputFile
      ? `Write your results to \`${outputFile}\` as JSON with at minimum a \`"status"\` field (\`"PASS"\` or \`"FAIL"\`).`
      : 'Write your results as described in the instructions above.',
    'Include a `"summary"` field with a brief overview and a `"findings"` array with details.',
    '',
    '### Step 2: Signal Completion',
    '',
    'This is your **LAST** action:',
    '```bash',
    `node /app/skills/redis.cjs \\`,
    `  --action complete \\`,
    `  --module ${gateId} \\`,
    `  --task-type gate_test \\`,
    `  --status <PASS|FAIL> \\`,
    `  --summary "<N tests passed, M failed: <specific failures>. Key findings: <1-2 sentence overview>>"`,
    '```',
    '',
    '⚠️ The `--summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}
