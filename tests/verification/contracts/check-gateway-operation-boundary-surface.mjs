import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-gateway-operation-boundary-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
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

const { sourceRoot } = parseArgs();
const gatewayOwner = path.join(sourceRoot, 'skills/common/pipeline/integrations/gateway.ts');
const gatewayOwnerTests = new Set([
  'skills/common/pipeline/integrations/gateway.test.mjs',
]);
const allowedFacadePaths = new Set([
  'skills/nova/pipeline/integrations/gateway.ts',
  'skills/buster/pipeline/integrations/gateway.ts',
]);
const configOwnerPaths = new Set([
  'skills/nova/pipeline/core/config.ts',
  'skills/nova/pipeline/core/session-policy.ts',
  'skills/buster/pipeline/services/runtime-policy.ts',
]);
const scannedFiles = [
  ...walk(path.join(sourceRoot, 'skills/common/pipeline')),
  ...walk(path.join(sourceRoot, 'skills/nova')),
  ...walk(path.join(sourceRoot, 'skills/buster')),
];

for (const filePath of scannedFiles) {
  const relPath = path.relative(sourceRoot, filePath).replace(/\\/g, '/');
  if (filePath === gatewayOwner || gatewayOwnerTests.has(relPath) || allowedFacadePaths.has(relPath) || configOwnerPaths.has(relPath)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  assert.equal(
    /\bgatewayInvoke\b/.test(source),
    false,
    `${relPath} must not import or call raw gatewayInvoke; use typed common gateway operations`,
  );
  assert.equal(
    /\b(?:session_status|sessions_send|sessions_spawn)\b|['"]subagents['"]/.test(source),
    false,
    `${relPath} must not reference raw Gateway tool names; use typed common gateway operations`,
  );
}

const ownerSource = fs.readFileSync(gatewayOwner, 'utf8');
for (const wrapperName of [
  'getGatewaySessionStatus',
  'spawnGatewaySession',
  'sendGatewaySessionMessage',
  'killGatewaySubagent',
  'listGatewaySubagents',
  'checkGatewayHealth',
]) {
  assert.equal(
    ownerSource.includes(`export async function ${wrapperName}`),
    true,
    `common gateway owner must export typed wrapper ${wrapperName}`,
  );
}

for (const [relPath, marker] of [
  ['skills/common/pipeline/agents/lifecycle.ts', 'spawnGatewaySession'],
  ['skills/common/pipeline/agents/lifecycle.ts', 'sendGatewaySessionMessage'],
  ['skills/common/pipeline/agents/acp-monitor.ts', 'getGatewaySessionStatus'],
  ['skills/nova/pipeline/services/failures/presentation.ts', 'sendGatewaySessionMessage'],
  ['skills/nova/pipeline/services/polling-session-end.ts', 'sendGatewaySessionMessage'],
  ['skills/nova/pipeline/agents/orchestration.ts', 'sendGatewaySessionMessage'],
  ['skills/nova/pipeline/agents/orchestration-healthcheck.ts', 'getGatewaySessionStatus'],
  ['skills/buster/pipeline/services/gateway-health.ts', 'checkCommonGatewayHealth'],
]) {
  assert.equal(
    fs.readFileSync(path.join(sourceRoot, relPath), 'utf8').includes(marker),
    true,
    `${relPath} should consume typed gateway operation ${marker}`,
  );
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: scannedFiles.length, issue: 'OI-47' }));
