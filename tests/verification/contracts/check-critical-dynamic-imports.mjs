import fs from 'fs';
import path from 'path';
import assert from 'assert';

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

const notificationSource = readSource(sourceRoot, 'skills/nova/pipeline/services/notification-contract.js');
const orchestrationSource = readSource(sourceRoot, 'skills/nova/pipeline/agents/orchestration.js');
const pollingSource = readSource(sourceRoot, 'skills/nova/pipeline/services/polling.js');
const summarySource = readSource(sourceRoot, 'skills/nova/pipeline/services/summary.js');
const costSource = readSource(sourceRoot, 'skills/nova/pipeline/services/cost.js');
const acpMonitorSource = readSource(sourceRoot, 'skills/common/pipeline/agents/acp-monitor.js');

assert.equal(countDynamicImports(notificationSource), 0, 'notification-contract should not keep dynamic imports on the active notification path');
assert.equal(notificationSource.includes("import { discord, discordEmbeds } from '../integrations/discord.js';"), true, 'notification-contract should statically import Discord integration');

assert.equal(countDynamicImports(costSource), 0, 'cost service should not dynamically import gateway integration on the live snapshot path');
assert.equal(costSource.includes("import { gatewayInvoke } from '../integrations/gateway.js';"), true, 'cost service should statically import gatewayInvoke');

assert.equal(orchestrationSource.includes("import redisDispatchTool from '../tools/redis.js';"), true, 'orchestration should statically import the canonical Redis dispatch tool');
assert.equal(countDynamicImports(orchestrationSource), 1, 'orchestration should keep at most one override-only dynamic import');
assert.equal(orchestrationSource.includes('Justified override-only dynamic import'), true, 'orchestration should document why the remaining dynamic import exists');

assert.equal(pollingSource.includes("import redisTool from '../tools/redis.js';"), true, 'polling should statically import the canonical Redis completion tool');
assert.equal(countDynamicImports(pollingSource), 1, 'polling should keep at most one override-only dynamic import');
assert.equal(pollingSource.includes('Justified override-only dynamic import'), true, 'polling should document why the remaining dynamic import exists');

assert.equal(summarySource.includes("import { generateSummary as canonicalGenerateSummary } from '../tools/project-summary.js';"), true, 'summary service should statically import the canonical project-summary tool');
assert.equal(countDynamicImports(summarySource), 1, 'summary service should keep at most one override-only dynamic import');
assert.equal(summarySource.includes('Justified override-only dynamic import'), true, 'summary service should document why the remaining dynamic import exists');

assert.equal(countDynamicImports(acpMonitorSource), 1, 'acp-monitor should keep exactly one lazy lifecycle import');
assert.equal(acpMonitorSource.includes('Justified dynamic import: acp-monitor and lifecycle depend on each other'), true, 'acp-monitor should document the lifecycle-cycle reason for its lazy import');

console.log(JSON.stringify({ ok: true, checked: 12 }));
