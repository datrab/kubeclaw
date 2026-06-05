import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-critical-dynamic-imports' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function readSource(sourceRoot, relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');
}

function countDynamicImports(source) {
  return (source.match(/\bimport\s*\(/g) || []).length;
}

const { sourceRoot } = parseArgs();

const notificationSource = readSource(sourceRoot, 'skills/nova/pipeline/services/notification-contract.ts');
const orchestrationSource = readSource(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts');
const pollingRedisCompletionSource = readSource(sourceRoot, 'skills/nova/pipeline/services/polling-redis-completion.ts');
const summarySource = [
  'skills/nova/pipeline/services/summary.ts',
  'skills/nova/pipeline/services/summary/project-summary.ts',
].map((relativePath) => readSource(sourceRoot, relativePath)).join('\n');
const adapterRegistrySource = readSource(sourceRoot, 'skills/nova/pipeline/services/adapter-registry.ts');
const suiteRunnerSource = readSource(sourceRoot, 'skills/buster/pipeline/runners/suite-runner.ts');
const observabilitySource = readSource(sourceRoot, 'skills/nova/pipeline/services/observability.ts');
const acpMonitorSource = readSource(sourceRoot, 'skills/common/pipeline/agents/acp-monitor.ts');
const lifecycleSource = readSource(sourceRoot, 'skills/common/pipeline/agents/lifecycle.ts');
const busterRedisSource = readSource(sourceRoot, 'skills/buster/pipeline/tools/redis.ts');

assert.equal(countDynamicImports(notificationSource), 0, 'notification-contract should not keep dynamic imports on the active notification path');
assert.equal(notificationSource.includes("import { discord, discordEmbeds } from '../integrations/discord.ts';"), true, 'notification-contract should statically import Discord integration');

assert.equal(countDynamicImports(observabilitySource), 0, 'observability service should not dynamically import gateway integration on the live usage path');
assert.equal(
  observabilitySource.includes('getGatewaySessionStatus'),
  false,
  'observability usage reporting should not depend on Gateway session-status snapshots after OpenClaw model.usage migration',
);
assert.equal(
  observabilitySource.includes('export function aggregateUsage'),
  true,
  'observability service should own OpenClaw model.usage aggregation',
);

assert.equal(orchestrationSource.includes("import { resolveRegisteredRedisAdapter } from '../services/adapter-registry.ts';"), true, 'orchestration should resolve Redis dispatch through the static adapter registry');
assert.equal(countDynamicImports(orchestrationSource), 0, 'orchestration should not keep config-path dynamic imports');
assert.equal(orchestrationSource.includes('pathToFileURL'), false, 'orchestration should not convert config paths to import URLs');

assert.equal(pollingRedisCompletionSource.includes("import { resolveRegisteredRedisAdapter } from './adapter-registry.ts';"), true, 'polling Redis completion should resolve Redis through the static adapter registry');
assert.equal(countDynamicImports(pollingRedisCompletionSource), 0, 'polling Redis completion should not keep config-path dynamic imports');
assert.equal(pollingRedisCompletionSource.includes('pathToFileURL'), false, 'polling Redis completion should not convert config paths to import URLs');

assert.equal([
  "import { resolveRegisteredProjectSummaryGenerator } from './adapter-registry.ts';",
  "import { resolveRegisteredProjectSummaryGenerator } from '../adapter-registry.ts';",
  "import { resolveRegisteredProjectSummaryGenerator } from './adapter-registry.ts';",
  "import { resolveRegisteredProjectSummaryGenerator } from '../adapter-registry.ts';",
].some((importLine) => summarySource.includes(importLine)), true, 'summary service should resolve generators through the static adapter registry');
assert.equal(countDynamicImports(summarySource), 0, 'summary service should not keep config-path dynamic imports');
assert.equal(summarySource.includes('pathToFileURL'), false, 'summary service should not convert config paths to import URLs');

assert.equal(adapterRegistrySource.includes("import redisTool from '../tools/redis.ts';"), true, 'adapter registry should statically import Redis adapter');
assert.equal(adapterRegistrySource.includes("import { generateSummary as canonicalGenerateSummary } from '../tools/project-summary.ts';"), true, 'adapter registry should statically import project summary generator');
assert.equal(adapterRegistrySource.includes('is not a registered adapter'), true, 'adapter registry should fail closed for unknown adapter keys');
assert.equal(adapterRegistrySource.includes("'/app/skills/redis.ts'"), false, 'adapter registry must not register the removed root Redis alias');
assert.equal(adapterRegistrySource.includes("'/app/skills/project-summary.ts'"), false, 'adapter registry must not register the removed root project-summary alias');
assert.equal(countDynamicImports(adapterRegistrySource), 0, 'adapter registry must not dynamically import adapters');

const adapterRegistryModule = await import(pathToFileURL(path.join(sourceRoot, 'skills/nova/pipeline/services/adapter-registry.ts')).href);
const {
  listRegisteredAdapters,
  resolveRegisteredRedisAdapter,
  resolveRegisteredProjectSummaryGenerator,
  UnknownAdapterError,
} = adapterRegistryModule;
const registeredAdapters = listRegisteredAdapters();
assert.equal(registeredAdapters.redis.includes('/app/skills/redis.ts'), false, 'removed root Redis alias must be absent from registered adapters');
assert.equal(registeredAdapters.redis.includes('/app/skills/pipeline/tools/redis.ts'), true, 'canonical Redis runtime path must remain registered');
assert.equal(registeredAdapters.project_summary.includes('/app/skills/project-summary.ts'), false, 'removed root project-summary alias must be absent from registered adapters');
assert.equal(registeredAdapters.project_summary.includes('/app/skills/pipeline/tools/project-summary.ts'), true, 'canonical project-summary runtime path must remain registered');

function assertUnknownAdapter(fn, label) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.equal(caught instanceof UnknownAdapterError, true, `${label} should throw UnknownAdapterError`);
  assert.equal(caught?.name, 'UnknownAdapterError', `${label} should expose a stable error name`);
  assert.equal(caught?.message.includes('is not a registered adapter'), true, `${label} should explain the fail-closed registry rejection`);
}

assertUnknownAdapter(() => resolveRegisteredRedisAdapter({
  agents: { buster: { dispatch: 'redis', redis_js_path: '/app/skills/redis.ts' } },
}, { agentType: 'buster', source: 'legacy root alias' }), 'removed Redis root alias');
assertUnknownAdapter(() => resolveRegisteredProjectSummaryGenerator({
  paths: { project_summary_js: '/app/skills/project-summary.ts' },
}), 'removed project-summary root alias');

assert.equal(countDynamicImports(suiteRunnerSource), 0, 'Buster suite runner should use static suite registry instead of dynamic suite imports');
assert.equal(/const SUITE_REGISTRY(?::[^=]+)?= Object\.freeze/.test(suiteRunnerSource), true, 'Buster suite runner should expose a static suite registry');
assert.equal(suiteRunnerSource.includes('new URL(`../suites/${name}.js`'), false, 'Buster suite runner should not construct executable import paths from suite names');

assert.equal(countDynamicImports(acpMonitorSource), 0, 'acp-monitor should use static neutral read-model imports instead of lazy lifecycle imports');
assert.equal(acpMonitorSource.includes("import { getTrackedAgent } from './tracked-agents.ts';"), true, 'acp-monitor should resolve tracked agents through the neutral tracked-agent read model');
assert.equal(lifecycleSource.includes("from './acp-monitor.ts'"), false, 'lifecycle should not import acp-monitor after session-state extraction');
assert.equal(lifecycleSource.includes("from './session-semantics.ts'"), true, 'lifecycle should import session parsing/stopped semantics from the neutral semantics helper');
assert.equal(lifecycleSource.includes("from './tracked-agents.ts';"), true, 'lifecycle should re-export tracked-agent helpers from the neutral registry owner');

assert.equal(busterRedisSource.includes("import verifyAndPush from './verify-task.js';"), false, 'Buster Redis must not keep the removed direct completion verifier path');
assert.equal(busterRedisSource.includes("source: 'agent'"), false, 'Buster Redis must not emit legacy source=agent completions');
assert.equal(busterRedisSource.includes("action === 'complete'"), false, 'Buster Redis should delete the old direct completion CLI branch entirely');
assert.equal(busterRedisSource.includes('async complete('), false, 'Buster Redis should delete the old direct completion library surface entirely');
assert.equal(countDynamicImports(busterRedisSource), 0, 'Buster Redis must not dynamically import verifier code');
assert.equal(busterRedisSource.includes('verify_fallback_used'), false, 'Buster Redis completion must not keep verifier fallback bookkeeping');
assert.equal(busterRedisSource.includes('Fallback commit+push'), false, 'Buster Redis completion must not keep fallback commit/push behavior');
assert.equal(busterRedisSource.includes("['add', '-A']"), false, 'Buster Redis completion must not keep broad fallback git add -A behavior');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 43 }));
