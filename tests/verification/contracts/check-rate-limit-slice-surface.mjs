import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-rate-limit-slice-surface' });
import fs from 'fs';
import os from 'os';
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

const { sourceRoot } = parseArgs();
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit.ts');
const buildersPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit-builders.ts');
const builderExhaustionOptionsPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit-builders/exhaustion-options.ts');
const exitPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit-exit.ts');
const contractPath = path.join(sourceRoot, 'skills/common/pipeline/services/rate-limit-contract.ts');
const discordFieldsContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/discord-fields-contract.ts');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const buildersSource = [buildersPath, builderExhaustionOptionsPath]
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n');
const exitSource = fs.readFileSync(exitPath, 'utf8');
const contractSource = fs.readFileSync(contractPath, 'utf8');
const discordFieldsContractSource = fs.readFileSync(discordFieldsContractPath, 'utf8');

assert.equal(mainSource.includes("export * from './rate-limit-builders.ts';"), true, 'rate-limit main surface should re-export builder helpers');
assert.equal(mainSource.includes("export * from './rate-limit-exit.ts';"), true, 'rate-limit main surface should re-export exit helpers');
assert.equal(mainSource.includes("from './rate-limit-builders.ts'"), true, 'rate-limit main surface should import the builder helper module');
assert.equal(mainSource.includes("from './rate-limit-exit.ts'"), true, 'rate-limit main surface should import the exit helper module');
assert.equal(mainSource.includes('appendDurableRateLimitExhaustionAlert'), false, 'rate-limit main surface must not keep duplicate durable exhaustion alert logic');
assert.equal(mainSource.includes('appendDurableOperatorAlert'), false, 'rate-limit main surface must not write exhaustion alerts directly');
assert.equal(mainSource.includes('finalizeSessionRateLimitExhaustion'), true, 'generic rate-limit wrappers must route exhaustion through the central finalizer');
assert.equal(exitSource.includes('appendDurableOperatorAlert(config'), true, 'rate-limit finalizer must write durable local evidence');
assert.equal(
  exitSource.indexOf("if (config) {\n    appendDurableOperatorAlert(config, 'pipeline.operator_alert'") < exitSource.indexOf("await runHook('sendDiscord'"),
  true,
  'rate-limit finalizer must append durable evidence before network dispatch hooks',
);
assert.equal(exitSource.includes('rate_limit_exhaustion_delivery_failed'), true, 'rate-limit finalizer must write local delivery-failure alerts for hook failures');
assert.equal(contractSource.includes('DISCORD_FIELD_SPECS'), false, 'rate-limit contract must not own shared Discord field contracts');
assert.equal(discordFieldsContractSource.includes('DISCORD_FIELD_SPECS'), true, 'shared Discord field contracts must live on the Discord-named contract surface');

for (const marker of [
  'export const STATUS = {',
  'export function buildModuleStatusTelemetry(',
  'export function defaultSessionRateLimitDetail(',
  'export function createTrackedGateSessionRateLimitRecoveryOptions(',
  'export function createSessionRateLimitDiscordNotifier(',
  'export function buildTrackedModuleSessionRateLimitStatus(',
]) {
  assert.equal(buildersSource.includes(marker), true, `rate-limit builders must export ${marker}`);
}

for (const marker of [
  'export function buildSessionRateLimitExitResult(',
  'export function buildModuleTerminalOwnedRedisRateLimitExitResult(',
  'export async function finalizeSummarySessionRateLimitExit(',
  'export async function finalizeGateSessionRateLimitExit(',
  'export async function finalizeModuleSessionRateLimitExit(',
  'export function createModuleSessionRateLimitExhaustionOptions(',
]) {
  assert.equal(exitSource.includes(marker), true, `rate-limit exit helpers must export ${marker}`);
}

for (const disallowed of [
  'export function buildSessionRateLimitExitResult(',
  'export async function finalizeModuleSessionRateLimitExit(',
  'export function createTrackedGateSessionRateLimitRecoveryOptions(',
  'export function createModuleSessionRateLimitExhaustionOptions(',
  'export function buildTrackedGateSessionRateLimitStatus(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `rate-limit main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const buildersMod = await import(pathToFileURL(buildersPath).href);
const exitMod = await import(pathToFileURL(exitPath).href);
const contractMod = await import(pathToFileURL(contractPath).href);

for (const [mod, name] of [
  [mainMod, 'handleSessionRateLimit'],
  [mainMod, 'withSessionRateLimitRecovery'],
  [mainMod, 'resumeDurableCooldownForStep'],
  [mainMod, 'processSessionRateLimit'],
  [buildersMod, 'createTrackedGateSessionRateLimitRecoveryOptions'],
  [buildersMod, 'buildTrackedModuleSessionRateLimitStatus'],
  [exitMod, 'buildSessionRateLimitExitResult'],
  [exitMod, 'finalizeSessionRateLimitExhaustion'],
  [exitMod, 'createModuleSessionRateLimitExhaustionOptions'],
  [exitMod, 'finalizeModuleSessionRateLimitExit'],
  [exitMod, 'finalizeGateSessionRateLimitExit'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}
assert.equal(Object.prototype.hasOwnProperty.call(mainMod, 'handleRateLimit'), false, 'legacy handleRateLimit wrapper must be deleted');
assert.equal(mainSource.includes('pauseCount = 1, maxPauses = 5'), false, 'rate-limit surface must not keep hard-coded wrapper pause defaults');
assert.equal(mainSource.includes('cooldown_buffer_ms ?? 5000'), false, 'rate-limit surface must not keep hidden cooldown buffer fallback');
assert.equal(mainSource.includes('config.rate_limit.cooldown_buffer_ms'), true, 'rate-limit cooldown buffer must come from platform config');
assert.equal(`${mainSource}\n${buildersSource}\n${exitSource}`.includes('phaseFallback'), false, 'rate-limit module phase identity must use explicit phase, not phaseFallback aliases');
for (const disallowedRateLimitIdentityAlias of [
  'runIdFallback',
  'attemptFallback',
  'dispatchIdFallback',
  'gatewayLabelFallback',
  'sessionKeyFallback',
  'maxPausesFallback',
  'agentTypeFallback',
]) {
  assert.equal(
    `${mainSource}\n${buildersSource}\n${exitSource}`.includes(disallowedRateLimitIdentityAlias),
    false,
    `rate-limit helpers must use explicit identity/maxPauses, not ${disallowedRateLimitIdentityAlias}`,
  );
}
assert.equal(buildersSource.includes('export function resolveRateLimitIdentity('), true, 'rate-limit helpers must expose explicit identity normalization');

function fieldValue(fields, name) {
  return fields.find((field) => field.name === name)?.value;
}

const exhaustionAlertRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rate-limit-finalizer-contract-'));
const exhaustionLogDir = path.join(exhaustionAlertRoot, 'logs');
const exhaustionRunDir = path.join(exhaustionLogDir, 'pipeline', 'runs', 'run-rate-limit-finalizer-1');
const exhaustionAlertPath = path.join(exhaustionRunDir, 'operator-alerts.jsonl');
const finalizedResult = await exitMod.finalizeSessionRateLimitExhaustion({
  status: {
    module_id: '01',
    run_id: 'run-rate-limit-finalizer-1',
    attempt: 2,
    dispatch_id: 'dispatch-rate-limit-finalizer',
    gateway_label: 'gateway-rate-limit-finalizer',
    session_key: 'agent:forge:rate-limit-finalizer',
  },
  rate_limit_status: {
    module_id: '01',
    run_id: 'run-rate-limit-finalizer-1',
    attempt: 2,
    dispatch_id: 'dispatch-rate-limit-finalizer',
    gateway_label: 'gateway-rate-limit-finalizer',
    session_key: 'agent:forge:rate-limit-finalizer',
  },
  rate_limit_pauses: 3,
  max_rate_limit_pauses: 2,
}, {
  config: {
    project: 'contract-rate-limit-finalizer',
    paths: { swarm_dir: exhaustionAlertRoot },
    _runId: 'run-rate-limit-finalizer-1',
    run_id: 'run-rate-limit-finalizer-1',
  },
  sendDiscord: async () => {
    assert.equal(fs.existsSync(exhaustionAlertPath), true, 'primary durable exhaustion alert must be written before Discord dispatch');
    throw new Error('discord webhook failed');
  },
  maxPauses: 2,
});
assert.equal(finalizedResult.reason, 'rate_limit_exhausted', 'finalizer should still return canonical exhaustion result after hook failure');
assert.throws(
  () => exitMod.buildSessionRateLimitExitResult({ status: finalizedResult.status }),
  /rate_limit_status is required/,
  'rate-limit finalizers must not reconstruct canonical status from result.status'
);
const exhaustionAlerts = fs.readFileSync(exhaustionAlertPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
assert.equal(exhaustionAlerts[0].reason, 'rate_limit_exhausted', 'first durable alert must record terminal exhaustion');
assert.equal(exhaustionAlerts[0].payload.rate_limit_exhausted, true, 'terminal exhaustion durable alert should carry exhausted flag');
assert.equal(exhaustionAlerts[1].reason, 'rate_limit_exhaustion_delivery_failed', 'hook failure must produce a local delivery-failure alert');
assert.equal(exhaustionAlerts[1].payload.failed_hook, 'sendDiscord', 'delivery-failure alert should name the failed hook');

const wrapperAlertRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rate-limit-wrapper-contract-'));
const wrapperLogDir = path.join(wrapperAlertRoot, 'logs');
const wrapperRunDir = path.join(wrapperLogDir, 'pipeline', 'runs', 'run-rate-limit-wrapper-1');
const wrapperResult = await mainMod.processSessionRateLimit({
  project: 'contract-rate-limit-wrapper',
  rate_limit: { max_pauses_per_module: 0, cooldown_hours: 0, cooldown_buffer_ms: 0 },
  paths: { swarm_dir: wrapperAlertRoot },
  _runId: 'run-rate-limit-wrapper-1',
  run_id: 'run-rate-limit-wrapper-1',
}, {
  module_id: '02',
  run_id: 'run-rate-limit-wrapper-1',
}, {
  pauseCount: 1,
  maxPauses: 0,
});
assert.equal(wrapperResult.exhausted, true, 'generic rate-limit process wrapper should report exhaustion');
assert.equal(fs.existsSync(path.join(wrapperRunDir, 'operator-alerts.jsonl')), true, 'generic wrapper exhaustion must route through durable finalizer evidence');

const directSummaryStatus = buildersMod.buildSummarySessionRateLimitStatus({ gateway_label: 'summary-canonical-label' }, {
  identity: { gateway_label: 'summary-explicit-label' },
});
assert.equal(directSummaryStatus.gateway_label, 'summary-canonical-label', 'summary status should preserve canonical status gateway label over explicit identity');

const trackedSummaryStatus = buildersMod.buildTrackedSummarySessionRateLimitStatus({}, {
  updateCorrelation: () => ({ dispatch_id: 'tracked-dispatch', gateway_label: 'tracked-summary-label' }),
  identity: { gateway_label: 'summary-explicit-label' },
});
assert.equal(trackedSummaryStatus.dispatch_id, 'tracked-dispatch', 'tracked summary status should preserve dispatch correlation');
assert.equal(trackedSummaryStatus.gateway_label, 'tracked-summary-label', 'tracked summary status should preserve gateway label correlation');

const directDiscordCalls = [];
const directNotifier = buildersMod.createSummarySessionRateLimitDiscordNotifier({}, {
  discordFn: async (_config, _level, _title, _description, fields) => directDiscordCalls.push(fields),
  buildFields: buildersMod.buildSessionRateLimitDiscordFields,
  identity: {
    run_id: 'run-summary-direct',
    gateway_label: 'summary-explicit-label',
    session_key: 'summary-session',
  },
});
await directNotifier.sendPauseDiscord({ status: { gateway_label: 'summary-canonical-label' }, embed: { title: 'pause', description: 'paused', fields: [] } });
assert.equal(fieldValue(directDiscordCalls[0], 'Gateway Label'), 'summary-canonical-label', 'summary pause Discord fields should preserve canonical status gateway label over explicit identity');

const trackedDiscordCalls = [];
const trackedNotifier = buildersMod.createSummarySessionRateLimitDiscordNotifier({}, {
  discordFn: async (_config, _level, _title, _description, fields) => trackedDiscordCalls.push(fields),
  buildFields: buildersMod.buildSessionRateLimitDiscordFields,
  updateCorrelation: () => ({ dispatch_id: 'tracked-dispatch', gateway_label: 'tracked-summary-label' }),
  identity: {
    run_id: 'run-summary-tracked',
    gateway_label: 'summary-explicit-label',
    session_key: 'summary-session',
  },
});
await trackedNotifier.sendResumeDiscord({ status: {} });
assert.equal(fieldValue(trackedDiscordCalls[0], 'Dispatch'), 'tracked-dispatch', 'summary resume Discord fields should preserve tracked dispatch correlation');
assert.equal(fieldValue(trackedDiscordCalls[0], 'Gateway Label'), 'tracked-summary-label', 'summary resume Discord fields should preserve tracked gateway label correlation');

assert.equal(contractMod.normalizeRateLimitProvider(null), null, 'rate-limit provider normalization must not silently default to Anthropic');
assert.equal(contractMod.normalizeRateLimitProvider(null, { allowAnthropicDefault: true }), 'anthropic', 'Anthropic fallback must be explicitly selected');
assert.equal(contractMod.buildRateLimitDetectedPayload({}, {}).provider, undefined, 'rate-limit payload must omit provider when no explicit provider/default policy is selected');
assert.equal(contractMod.buildRateLimitDetectedPayload({}, { allowAnthropicDefault: true }).provider, 'anthropic', 'typed default policy should opt in to Anthropic provider fallback');
assert.equal(mainSource.includes('allowAnthropicDefault: true'), true, 'Nova fallback rate-limit path must select the explicit typed provider default policy');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 48 }));
