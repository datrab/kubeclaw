// prompts/shared.ts — Common prompt sections used by multiple prompt builders

import path from 'path';
import { fileURLToPath } from 'node:url';
import { relPath, modulePath, gateOutputPath, moduleBusterOutputPathRef } from '../core/paths.ts';
import { agentArtifactContextPath, writeAgentArtifactContext } from '../agent-artifact.ts';

const FORGE_COMPLETION_WRITER_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tools/write-forge-completion.ts',
);

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

export function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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
    'node /app/skills/pipeline/tools/visual-audit.ts "<url>" [--mode image|video]  # Screenshot/video to Discord',
    '```',
    '',
    '### Completion',
    '',
    '**See the completion steps in "When Testing Is Complete" below.** Do not call Redis completion tools.',
    'Buster Pipeline reads output_file, verify-pushes scoped artifacts, and emits the canonical completion signal.',
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

export function forgeCompletionArtifactPath(config, dir) {
  return path.join(modulePath(config, dir), 'forge-completion.json');
}

export function buildForgeCompletionArtifactContract(config, dir, identity = {}) {
  const artifactPath = forgeCompletionArtifactPath(config, dir);
  const runId = identity.run_id || identity.runId || 'run-id-from-prompt';
  const moduleId = identity.module_id || identity.moduleId || dir;
  const attempt = identity.attempt || 1;
  const contextPath = agentArtifactContextPath(artifactPath);
  writeAgentArtifactContext(artifactPath, {
    artifact_type: 'forge_completion',
    schema_version: 1,
    run_id: runId,
    module_id: moduleId,
    attempt,
  });
  return [
    `Publish \`${artifactPath}\` only through the canonical atomic writer. Do not write or edit the JSON file directly.`,
    'Run this command after replacing only the descriptive and evidence values:',
    '```sh',
    `node ${quoteShellArg(FORGE_COMPLETION_WRITER_PATH)} \\`,
    `  --context ${quoteShellArg(contextPath)} \\`,
    '  --status "READY_FOR_TESTING" \\',
    '  --summary "brief implementation summary" \\',
    '  --inspected-file "relative/path/inspected" \\',
    '  --consulted-contract "relative/path/or/contract/ref" \\',
    '  --implementation-notes "what changed, or why unchanged source remains compliant"',
    '```',
    'Repeat `--inspected-file` and `--consulted-contract` for every evidence path. The writer injects pipeline-owned identity, validates the semantic payload, and atomically publishes the artifact.',
    'Schema rules:',
    '- `artifact_type` must be exactly `forge_completion`.',
    '- `run_id`, `module_id`, `attempt`, schema metadata, and timestamps are injected by the pipeline and must not be authored by the agent.',
    '- `status` must be exactly `READY_FOR_TESTING` when the implementation is ready for Buster, or `BLOCKED` only when implementation cannot be completed.',
    '- `summary` must be a non-empty string describing what changed or why the task is blocked.',
    '- `evidence.inspected_files` must list the owned files or contract files you inspected.',
    '- `evidence.consulted_contracts` must list the contract files or contract refs used to decide readiness.',
    '- `evidence.implementation_notes` must explain the implementation changes, or why unchanged source remains compliant.',
    '- `completed_at` must be an ISO-8601 UTC timestamp such as `2026-05-13T14:37:00Z`.',
  ];
}

export function buildBusterResultArtifactContract(config, dir) {
  const outputFile = moduleBusterOutputPathRef(config, dir);
  return [
    `Write the prompt-provided \`output_file\` (\`${outputFile}\`) as raw, directly parseable JSON. Do not wrap it in Markdown, do not use fenced code blocks, and do not write explanatory text into the file.`,
    'The file content must be one JSON object with exactly this shape:',
    '{',
    '  "artifact_type": "buster_output",',
    '  "status": "PASS",',
    '  "summary": "specific test-results overview",',
    '  "completed_at": "2026-05-13T14:37:00Z"',
    '}',
    'Schema rules:',
    '- `artifact_type` must be exactly `buster_output`.',
    '- `status` must be exactly `PASS` if all tests pass, or `FAIL` if any test fails.',
    '- `summary` must describe what was tested and what the results are.',
    '- `completed_at` must be an ISO-8601 UTC timestamp such as `2026-05-13T14:37:00Z`.',
  ];
}

export function buildBusterCompletionProtocol(config, moduleId, dir, status, identity = {}) {
  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Write output_file',
    '',
    ...buildBusterResultArtifactContract(config, dir),
    '- Do **not** edit pipeline lifecycle or orchestrator-owned control artifacts directly.',
    '- Do NOT mutate `fail_count`, `fail_summaries`, `current_phase`, `phase_started_at`, or `completed_at` — Nova/Buster pipeline owns lifecycle state after this artifact is read.',
    '',
    '### Step 2: Finish',
    '',
    'After output_file is saved, stop. Do **not** call Redis completion tools.',
    'Buster Pipeline reads output_file, runs verify-task.ts to push scoped artifacts, and then emits the canonical completion signal.',
    '',
    '⚠️ The `summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip the output_file write. Without it, your work cannot be registered.',
  ];
}

export function buildBusterGateCompletionProtocol(config, gateId, gate, identity = {}) {
  const outputFile = gate.output_file
    ? relPath(config, gateOutputPath(config, gate))
    : null;

  return [
    '## When Testing Is Complete',
    '',
    'Execute these steps **in this exact order**. Do not skip any step.',
    '',
    '### Step 1: Write Results',
    '',
    outputFile
      ? `Write \`${outputFile}\` as raw, directly parseable JSON. Do not wrap it in Markdown, do not use fenced code blocks, and do not write explanatory text into the file.`
      : 'Write your results as raw, directly parseable JSON exactly as described in the instructions above. Do not use Markdown or fenced code blocks for the result artifact.',
    'The result object must use exactly this shape:',
    '{',
    '  "status": "PASS",',
    '  "summary": "specific gate-test overview",',
    '  "findings": [',
    '    {',
    '      "severity": "critical",',
    '      "title": "short finding title",',
    '      "description": "what failed or what was verified",',
    '      "reproduction": "specific reproduction or evidence"',
    '    }',
    '  ]',
    '}',
    'Schema rules:',
    '- `status` must be exactly `PASS` or `FAIL`.',
    '- `summary` must describe what was tested and what the results are.',
    '- `findings` must be an array; use `[]` when there are no findings.',
    '',
    '### Step 2: Finish',
    '',
    'After output_file is saved, stop. Do **not** call Redis completion tools.',
    'Buster Pipeline reads output_file, runs verify-task.ts to push scoped artifacts, and then emits the canonical completion signal.',
    '',
    '⚠️ The `summary` must describe WHAT was tested and WHAT the results are.',
    'Bad: "test", "done", "completed". Good: "8/10 API tests pass. 2 failures: POST /deploy returns 500 (missing error handler), GET /alerts timeout after 5s."',
    '',
    'Do NOT skip the result write. Without it, your work cannot be registered.',
  ];
}
