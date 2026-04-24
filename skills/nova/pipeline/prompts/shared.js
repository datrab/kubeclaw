// prompts/shared.js — Common prompt sections used by multiple prompt builders

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
    'The Buster Pipeline already synced the repo before your session started. Do NOT run `git pull`.',
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
    '### What the Buster Pipeline Already Did',
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

function buildCompletionIdentityFlags(identity = {}, taskType = 'module_test') {
  const lines = [];
  const runId = identity.runId || identity.run_id || null;
  const attempt = identity.attempt ?? null;
  const dispatchId = identity.dispatchId || identity.dispatch_id || null;

  lines.push(`  --task-type ${taskType} \\`);
  if (runId) lines.push(`  --run-id ${runId} \\`);
  if (attempt !== null && attempt !== undefined) lines.push(`  --attempt ${attempt} \\`);
  if (dispatchId) lines.push(`  --dispatch-id ${dispatchId} \\`);

  return lines;
}

export function buildForgeReadyForTestingLifecycleJq() {
  return '.history = ((.history // []) + [{"timestamp": $now, "from": (.status // null), "to": "READY_FOR_TESTING", "agent": "forge", "note": "Forge completed"}]) | .status = "READY_FOR_TESTING" | .completion_summary = null | .current_phase = null | .phase_started_at = null | .completed_at = null';
}

export function buildBusterTerminalLifecycleJq() {
  return '.history = ((.history // []) + [{"timestamp": $now, "from": (.status // null), "to": $status, "agent": "buster", "note": $summary}]) | .status = $status | .completion_summary = $summary | .current_phase = null | .phase_started_at = null | if $status == "PASS" then .completed_at = $now else .completed_at = null end';
}

export function buildForgeReadyForTestingLifecycleCommand(config, dir) {
  const statusJsonPath = relPath(config, statusPath(config, dir));
  return [
    'tmp_status="$(mktemp)"',
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    `jq --arg now "$now" '${buildForgeReadyForTestingLifecycleJq()}' ${statusJsonPath} > "$tmp_status"`,
    `mv "$tmp_status" ${statusJsonPath}`,
  ];
}

export function buildBusterTerminalLifecycleCommand(config, dir) {
  const statusJsonPath = relPath(config, statusPath(config, dir));
  return [
    'tmp_status="$(mktemp)"',
    'now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"',
    'result_status="<PASS|FAIL>"',
    'result_summary="<N tests passed, M failed: <specific failures>. Key findings: <1-2 sentence overview>>"',
    `jq --arg now "$now" --arg status "$result_status" --arg summary "$result_summary" '${buildBusterTerminalLifecycleJq()}' ${statusJsonPath} > "$tmp_status"`,
    `mv "$tmp_status" ${statusJsonPath}`,
  ];
}

export function buildBusterCompletionProtocol(config, moduleId, dir, status, identity = {}) {
  const statusJsonPath = relPath(config, statusPath(config, dir));

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Update status.json',
    '',
    `Update \`${statusJsonPath}\` with the canonical PASS/FAIL lifecycle shape:`,
    '- Read the existing JSON first (it contains pipeline metadata — do NOT overwrite it)',
    '- Set `result_status` to `PASS` if all tests pass, or `FAIL` if any test fails',
    '- Set `result_summary` to a specific test-results overview',
    '- Do NOT mutate `fail_count` or `fail_summaries` directly — Nova owns retry accounting after completion is received',
    '- Always clear `current_phase` and `phase_started_at`',
    '- Set `completed_at` when `result_status=PASS`, otherwise clear any previous `completed_at` value',
    '```bash',
    ...buildBusterTerminalLifecycleCommand(config, dir),
    '```',
    '',
    '### Step 2: Signal Completion',
    '',
    'This is your **LAST** action:',
    '```bash',
    `node /app/skills/redis.cjs \\`,
    `  --action complete \\`,
    `  --module ${moduleId} \\`,
    ...buildCompletionIdentityFlags(identity, 'module_test'),
    `  --status <PASS|FAIL> \\`,
    `  --summary "<N tests passed, M failed: <specific failures>. Key findings: <1-2 sentence overview>>"`,
    '```',
    '',
    'Use the exact `--run-id`, `--attempt`, and `--dispatch-id` values shown above. Do not invent new ones.',
    '',
    '⚠️ The `--summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}

export function buildBusterGateCompletionProtocol(config, gateId, gate, identity = {}) {
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
    ...buildCompletionIdentityFlags(identity, 'gate_test'),
    `  --status <PASS|FAIL> \\`,
    `  --summary "<N tests passed, M failed: <specific failures>. Key findings: <1-2 sentence overview>>"`,
    '```',
    '',
    'Use the exact `--run-id`, `--attempt`, and `--dispatch-id` values shown above. Do not invent new ones.',
    '',
    '⚠️ The `--summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip this step. Without it, your work cannot be registered.',
  ];
}
