import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && /\.(?:js|mjs|cjs|ts)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

function walkMarkdown(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = relPath(sourceRoot, abs);
    if (rel.startsWith('docs/archive/')) continue;
    if (entry.isDirectory()) walkMarkdown(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

function relPath(sourceRoot, filePath) {
  return path.relative(sourceRoot, filePath).replace(/\\/g, '/');
}

const { sourceRoot } = parseArgs();
const runtimeRoots = [
  'skills/nova/pipeline',
  'skills/common/pipeline',
  'skills/buster/pipeline',
];

const runtimeFiles = runtimeRoots
  .flatMap((root) => walk(path.join(sourceRoot, root)))
  .sort();

const planPath = path.join(sourceRoot, 'docs/archive/pipeline-plans/canonical-pipeline-compat-removal-plan.md');
const inventoryPath = path.join(sourceRoot, 'docs/archive/pipeline-plans/canonical-pipeline-compat-inventory.md');
const planSource = fs.readFileSync(planPath, 'utf8');
const inventorySource = fs.readFileSync(inventoryPath, 'utf8');

for (const required of [
  'Phase 0: Inventory and freeze compatibility growth',
  'Operator audit',
  'Search every `||` in runtime pipeline code',
]) {
  assert.equal(planSource.includes(required), true, `plan should describe Phase 0 inventory/freeze requirement: ${required}`);
}

for (const required of [
  '## Debt Map',
  '## High-Risk `||` Audit',
  '## Phase 0 Contract Gates',
  'P1: Status-store compatibility and gate status evidence',
  'P2: Completion legacy sources and local evidence fallback',
  'P3: ACP polling and agent-side git completion inference',
  'P5: Task transport aliases',
  'P6: Legacy config and environment aliases',
  'P7: Agent observability legacy comparison mode',
  'P8: Diagnostic correlation and replay-shape compatibility',
  'P9: Active docs and tests that still protect old surfaces',
]) {
  assert.equal(inventorySource.includes(required), true, `inventory should map compatibility surface: ${required}`);
}

const markerLimits = {
  statusStoreCompat: {
    re: /status-store-compat|readGateStatusJson|legacy_gate_status|legacy_evidence_source|legacy_status:|status_json/,
    limits: {},
  },
  sendTask: {
    re: /\bsendTask\b/,
    limits: {},
  },
  gatewayLegacyEnv: {
    re: /(^|[^A-Z0-9_])GATEWAY_URL\b|(^|[^A-Z0-9_])GATEWAY_TOKEN\b/,
    limits: {},
  },
  telemetryStreamKeyConfig: {
    re: /telemetry\.stream_key/,
    limits: {},
  },
  observabilityLegacy: {
    re: /legacyRecords|normalizeLegacy|legacy_counts|missing_legacy/,
    limits: {},
  },
  diagnosticCorrelationFallback: {
    re: /resolveFallbackField|WithDiagnosticFallback|family:\s*'fallback'|path:\s*`fallback\./,
    limits: {},
  },
  agentSideGitCompletionInference: {
    re: /gitPullForPolling|syncRepoForPolling|POST_CHANGE_GRACE_MS|legacy agent-side commit\/push|HEAD movement as completion signal|catch any legacy remote update/,
    limits: {},
  },
  replayShapeCompat: {
    re: /backward compat|migration diagnostics|Agent-side forge-completion\.json remains readable|SWARM_CONFIG fallback/,
    limits: {},
  },
};

const activeDocMarkerLimits = {
  re: /compatibility projections|(^|[^A-Z0-9_])GATEWAY_URL\b|(^|[^A-Z0-9_])GATEWAY_TOKEN\b|env fallback: `SWARM_CONFIG`|telemetry\.stream_key|\bstream_key\b|sendTask|legacy status files|compatibility shims|compatibility shim|\bgate-status\.json\b|\bstatus\.json\b/,
  limits: {
    'docs/architecture/lifecycle-and-state.md': 1,
    'docs/future-implementation-ideas.md': 4,
    'docs/open-issues.md': 40,
    'docs/pipeline/configuration.md': 1,
    'skills/nova/pipeline/README.md': 1,
  },
};

const highRiskOrRe = /\|\|.*(fallback|legacy|status|status_json|gateStatus|gateway|GATEWAY|stream_key|session|dispatch|run_id|module_id|gate_id|payload|context|identity|source|module|gate|env)/i;
const highRiskOrLimits = {
  'skills/nova/pipeline/agents/module-worker-control-results.ts': 14,
  'skills/nova/pipeline/agents/module-workers.ts': 20,
  'skills/nova/pipeline/agents/orchestration-healthcheck.ts': 5,
  'skills/nova/pipeline/agents/orchestration-lifecycle-events.ts': 2,
  'skills/nova/pipeline/agents/orchestration.ts': 13,
  'skills/nova/pipeline/agents/reviewer-lifecycle.ts': 3,
  'skills/nova/pipeline/agents/shutdown.ts': 9,
  'skills/nova/pipeline/cli.ts': 3,
  'skills/nova/pipeline/core/config.ts': 3,
  'skills/nova/pipeline/core/context.ts': 6,
  'skills/nova/pipeline/core/logger.ts': 1,
  'skills/nova/pipeline/core/policy.ts': 1,
  'skills/nova/pipeline/core/registry/config-normalization.ts': 1,
  'skills/nova/pipeline/core/registry/indexes.ts': 1,
  'skills/nova/pipeline/core/registry/validation.ts': 12,
  'skills/nova/pipeline/core/registry.ts': 3,
  'skills/nova/pipeline/core/runtime.ts': 2,
  'skills/nova/pipeline/integrations/discord.ts': 13,
  'skills/nova/pipeline/prompts/forge.ts': 1,
  'skills/nova/pipeline/runners/approval-gate-control.ts': 18,
  'skills/nova/pipeline/runners/approval-gate-runner.ts': 16,
  'skills/nova/pipeline/runners/approval-gate-shared.ts': 7,
  'skills/nova/pipeline/runners/approval-gate-state.ts': 13,
  'skills/nova/pipeline/runners/buster-gate-completion.ts': 11,
  'skills/nova/pipeline/runners/buster-gate-control.ts': 10,
  'skills/nova/pipeline/runners/buster-gate-fix-cycle.ts': 1,
  'skills/nova/pipeline/runners/buster-gate-runner.ts': 8,
  'skills/nova/pipeline/runners/buster-gate-task.ts': 2,
  'skills/nova/pipeline/runners/buster-gate-terminal.ts': 14,
  'skills/nova/pipeline/runners/gate-forge-fix-cycle.ts': 6,
  'skills/nova/pipeline/runners/gate-runner.ts': 13,
  'skills/nova/pipeline/runners/module-runner/attempt.ts': 4,
  'skills/nova/pipeline/runners/module-runner/buster-phase/dispatch.ts': 5,
  'skills/nova/pipeline/runners/module-runner/buster-phase/poll-failure.ts': 6,
  'skills/nova/pipeline/runners/module-runner/buster-phase/terminal-pass.ts': 1,
  'skills/nova/pipeline/runners/module-runner/buster-phase.ts': 13,
  'skills/nova/pipeline/runners/module-runner/state-machine.ts': 3,
  'skills/nova/pipeline/runners/module-runner/terminal-results.ts': 3,
  'skills/nova/pipeline/runners/module-runner-buster-worker.ts': 14,
  'skills/nova/pipeline/runners/module-runner-forge.ts': 9,
  'skills/nova/pipeline/runners/module-runner-prebuster.ts': 2,
  'skills/nova/pipeline/runners/module-runner-shared.ts': 24,
  'skills/nova/pipeline/runners/module-runner.ts': 1,
  'skills/nova/pipeline/runners/pipeline-runner-lock.ts': 1,
  'skills/nova/pipeline/runners/pipeline-runner-recovery.ts': 21,
  'skills/nova/pipeline/runners/pipeline-runner-scheduling/validator-completions.ts': 2,
  'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts': 11,
  'skills/nova/pipeline/runners/pipeline-runner-shared.ts': 13,
  'skills/nova/pipeline/runners/pipeline-runner-start.ts': 9,
  'skills/nova/pipeline/runners/pipeline-runner-terminal.ts': 9,
  'skills/nova/pipeline/runners/pipeline-runner.ts': 2,
  'skills/nova/pipeline/runners/remediable-gate-engine.ts': 4,
  'skills/nova/pipeline/runners/review-gate-control.ts': 11,
  'skills/nova/pipeline/runners/review-gate-fix-cycle.ts': 1,
  'skills/nova/pipeline/runners/review-gate-output.ts': 1,
  'skills/nova/pipeline/runners/review-gate-runner.ts': 16,
  'skills/nova/pipeline/runners/review-gate-task.ts': 13,
  'skills/nova/pipeline/runners/scheduled-gate-invocation.ts': 1,
  'skills/nova/pipeline/runners/waitable-gate-engine.ts': 2,
  'skills/nova/pipeline/services/acp-observability.ts': 5,
  'skills/nova/pipeline/services/adapter-registry.ts': 3,
  'skills/nova/pipeline/services/agent-observability-evidence/comparator.ts': 1,
  'skills/nova/pipeline/services/agent-observability-forge-completion.ts': 9,
  'skills/nova/pipeline/services/agent-observability-ingester/config.ts': 3,
  'skills/nova/pipeline/services/agent-observability-ingester/consumer.ts': 1,
  'skills/nova/pipeline/services/approval-signal-event-adapter.ts': 6,
  'skills/nova/pipeline/services/arch-validator-checks.ts': 2,
  'skills/nova/pipeline/services/arch-validator.ts': 3,
  'skills/nova/pipeline/services/artifact-bundle.ts': 12,
  'skills/nova/pipeline/services/blueprint.ts': 2,
  'skills/nova/pipeline/services/buster-completion-controller.ts': 2,
  'skills/nova/pipeline/services/case-study.ts': 2,
  'skills/nova/pipeline/services/completion-adjudicator.ts': 4,
  'skills/nova/pipeline/services/contract-diagnostics.ts': 1,
  'skills/nova/pipeline/services/contracts/gate-control-result.ts': 9,
  'skills/nova/pipeline/services/contracts/pipeline-step-result.ts': 1,
  'skills/nova/pipeline/services/contracts/terminal-decision.ts': 1,
  'skills/nova/pipeline/services/contracts/validator-control-result.ts': 4,
  'skills/nova/pipeline/services/correlation.ts': 1,
  'skills/nova/pipeline/services/dependencies.ts': 2,
  'skills/nova/pipeline/services/durable-operator-alert.ts': 7,
  'skills/nova/pipeline/services/failure-semantics.ts': 5,
  'skills/nova/pipeline/services/failures/classification.ts': 4,
  'skills/nova/pipeline/services/failures/incidents.ts': 1,
  'skills/nova/pipeline/services/failures/presentation.ts': 13,
  'skills/nova/pipeline/services/gate-active-session.ts': 9,
  'skills/nova/pipeline/services/gate-fix-scaffold.ts': 4,
  'skills/nova/pipeline/services/governance-context.ts': 6,
  'skills/nova/pipeline/services/module-validators.ts': 13,
  'skills/nova/pipeline/services/notification-contract.ts': 15,
  'skills/nova/pipeline/services/notification-dispatch.ts': 1,
  'skills/nova/pipeline/services/observability.ts': 5,
  'skills/nova/pipeline/services/polling-dual.ts': 2,
  'skills/nova/pipeline/services/polling-identity.ts': 8,
  'skills/nova/pipeline/services/polling-observability.ts': 2,
  'skills/nova/pipeline/services/polling-redis-completion.ts': 1,
  'skills/nova/pipeline/services/polling-session-end.ts': 10,
  'skills/nova/pipeline/services/polling.ts': 24,
  'skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts': 2,
  'skills/nova/pipeline/services/rate-limit-builders.ts': 9,
  'skills/nova/pipeline/services/rate-limit-exit.ts': 13,
  'skills/nova/pipeline/services/rate-limit.ts': 8,
  'skills/nova/pipeline/services/redis-completion.ts': 6,
  'skills/nova/pipeline/services/remediation-handoff.ts': 2,
  'skills/nova/pipeline/services/session-authority.ts': 2,
  'skills/nova/pipeline/services/status-store-read-models/gate-projection.ts': 24,
  'skills/nova/pipeline/services/status-store-read-models/module-projection.ts': 7,
  'skills/nova/pipeline/services/status-store-lifecycle/appenders.ts': 9,
  'skills/nova/pipeline/services/status-store-lifecycle/idempotency.ts': 3,
  'skills/nova/pipeline/services/status-store-lifecycle/legality.ts': 3,
  'skills/nova/pipeline/services/status-store-lifecycle/projections.ts': 48,
  'skills/nova/pipeline/services/status-store-lifecycle/read-models.ts': 1,
  'skills/nova/pipeline/services/status-store-lifecycle/refs.ts': 14,
  'skills/nova/pipeline/services/status-store.ts': 31,
  'skills/nova/pipeline/services/summary-session-cleanup.ts': 1,
  'skills/nova/pipeline/services/summary.ts': 3,
  'skills/nova/pipeline/services/system-io-warning.ts': 16,
  'skills/nova/pipeline/services/telemetry/builders.ts': 9,
  'skills/nova/pipeline/services/telemetry/dispatch.ts': 7,
  'skills/nova/pipeline/services/telemetry-sink-contract.ts': 15,
  'skills/nova/pipeline/services/telemetry-sink-dispatch.ts': 1,
  'skills/nova/pipeline/services/truth-drift.ts': 4,
  'skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts': 1,
  'skills/nova/pipeline/tools/lint-report/discovery.ts': 1,
  'skills/nova/pipeline/tools/lint-report/report.ts': 1,
  'skills/nova/pipeline/tools/project-summary-formatters.ts': 14,
  'skills/nova/pipeline/tools/project-summary.ts': 17,
  'skills/nova/pipeline/tools/redis.ts': 2,
  'skills/common/pipeline/agents/acp-monitor.ts': 9,
  'skills/common/pipeline/agents/lifecycle.ts': 4,
  'skills/common/pipeline/agents/session-semantics.ts': 2,
  'skills/common/pipeline/agents/session-termination.ts': 1,
  'skills/common/pipeline/git-primitives.ts': 1,
  'skills/common/pipeline/integrations/gateway.ts': 1,
  'skills/common/pipeline/lifecycle-state.ts': 11,
  'skills/common/pipeline/redaction.ts': 2,
  'skills/common/pipeline/security.ts': 3,
  'skills/common/pipeline/services/acp-gateway-contract.ts': 2,
  'skills/common/pipeline/services/discord-fields-contract.ts': 1,
  'skills/common/pipeline/services/pipeline-event-contract.ts': 2,
  'skills/common/pipeline/services/rate-limit-contract.ts': 1,
  'skills/common/pipeline/services/redis-message-contract.ts': 3,
  'skills/buster/pipeline/runners/suite-runner.ts': 6,
  'skills/buster/pipeline/services/capabilities.ts': 7,
  'skills/buster/pipeline/services/discord.ts': 4,
  'skills/buster/pipeline/services/gateway-health.ts': 2,
  'skills/buster/pipeline/services/git-workflows.ts': 1,
  'skills/buster/pipeline/services/logger.ts': 8,
  'skills/buster/pipeline/services/orphan-recovery.ts': 3,
  'skills/buster/pipeline/services/pipeline-helpers.ts': 11,
  'skills/buster/pipeline/services/rate-limit.ts': 2,
  'skills/buster/pipeline/services/runtime-diagnostics.ts': 2,
  'skills/buster/pipeline/services/runtime.ts': 2,
  'skills/buster/pipeline/services/sandbox-cleanup.ts': 9,
  'skills/buster/pipeline/services/session-monitor.ts': 12,
  'skills/buster/pipeline/services/task-completion.ts': 5,
  'skills/buster/pipeline/services/task-lifecycle/completion-signal.ts': 1,
  'skills/buster/pipeline/services/task-lifecycle/session.ts': 13,
  'skills/buster/pipeline/services/task-lifecycle.ts': 1,
  'skills/buster/pipeline/services/task-queue.ts': 2,
  'skills/buster/pipeline/services/task-validation.ts': 2,
  'skills/buster/pipeline/services/telemetry.ts': 7,
  'skills/buster/pipeline/services/verdict-schema.ts': 3,
  'skills/buster/pipeline/suites/e2e.ts': 1,
  'skills/buster/pipeline/suites/health.ts': 2,
  'skills/buster/pipeline/suites/k8s.ts': 1,
  'skills/buster/pipeline/suites/manifest.ts': 1,
  'skills/buster/pipeline/suites/perf.ts': 6,
  'skills/buster/pipeline/suites/unit.ts': 1,
  'skills/buster/pipeline/suites/visual-reg-discord.ts': 1,
  'skills/buster/pipeline/suites/visual-reg.ts': 8,
  'skills/buster/pipeline/tools/redis.ts': 5,
  'skills/buster/pipeline/tools/verify-task.ts': 3,
};

function countLineMatches(source, re) {
  return source.split('\n').filter((line) => re.test(line)).length;
}

function countHighRiskOr(source) {
  return source.split('\n').filter((line) => line.includes('||') && highRiskOrRe.test(line)).length;
}

function assertCountLimits({ name, re, limits }) {
  const seen = new Map();
  for (const filePath of runtimeFiles) {
    const rel = relPath(sourceRoot, filePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const count = countLineMatches(source, re);
    if (count > 0) seen.set(rel, count);
  }

  for (const [rel, count] of seen) {
    const limit = limits[rel] ?? 0;
    assert(count <= limit, `${name} grew in ${rel}: ${count} > ${limit}`);
  }
}

for (const [name, config] of Object.entries(markerLimits)) {
  assertCountLimits({ name, ...config });
}

{
  const seen = new Map();
  const activeDocFiles = [
    ...walkMarkdown(path.join(sourceRoot, 'docs')),
    path.join(sourceRoot, 'skills/nova/pipeline/README.md'),
    path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/README.md'),
  ].filter((filePath) => fs.existsSync(filePath));
  for (const filePath of activeDocFiles) {
    const rel = relPath(sourceRoot, filePath);
    const count = countLineMatches(fs.readFileSync(filePath, 'utf8'), activeDocMarkerLimits.re);
    if (count > 0) seen.set(rel, count);
    const limit = activeDocMarkerLimits.limits[rel] ?? 0;
    assert(count <= limit, `active doc compatibility markers grew in ${rel}: ${count} > ${limit}`);
  }
  for (const rel of seen.keys()) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(activeDocMarkerLimits.limits, rel),
      true,
      `active doc compatibility marker appeared outside inventory: ${rel}`,
    );
  }
}

{
  const seen = new Map();
  for (const filePath of runtimeFiles) {
    const rel = relPath(sourceRoot, filePath);
    const count = countHighRiskOr(fs.readFileSync(filePath, 'utf8'));
    if (count > 0) seen.set(rel, count);
  }
  for (const [rel, count] of seen) {
    const limit = highRiskOrLimits[rel] ?? 0;
    assert(count <= limit, `high-risk || usage grew in ${rel}: ${count} > ${limit}`);
  }
}

const commonShimFiles = runtimeFiles.filter((filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  return /export \* from ['"].*common\/pipeline/.test(source);
});
assert(commonShimFiles.length > 0, 'expected accepted repo-local common shims to be present');

for (const filePath of commonShimFiles) {
  const rel = relPath(sourceRoot, filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const nonCommentLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('//'));
  assert(nonCommentLines.length > 0, `${rel} should not be empty`);
  for (const line of nonCommentLines) {
    assert(
      /^export \* from ['"].*common\/pipeline\/.*['"];?$/.test(line),
      `${rel} must stay a pure common-pipeline re-export shim; unexpected line: ${line}`,
    );
  }
}

console.log(JSON.stringify({
  ok: true,
  checked: 'canonical-pipeline-compat-freeze',
  runtime_files: runtimeFiles.length,
  accepted_common_shims: commonShimFiles.length,
}));
