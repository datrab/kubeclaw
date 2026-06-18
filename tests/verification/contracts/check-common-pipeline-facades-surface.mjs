import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-common-pipeline-facades-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';

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

function relPath(sourceRoot, filePath) {
  return path.relative(sourceRoot, filePath).replace(/\\/g, '/');
}

const APPROVED_COMMON_FACADES = Object.freeze([
  'skills/buster/pipeline/agent-observability/src/index.ts',
  'skills/buster/pipeline/agents/acp-monitor.ts',
  'skills/buster/pipeline/agents/lifecycle.ts',
  'skills/buster/pipeline/agents/runtime.ts',
  'skills/buster/pipeline/agents/session-semantics.ts',
  'skills/buster/pipeline/agents/session-termination.ts',
  'skills/buster/pipeline/agents/tracked-agents.ts',
  'skills/buster/pipeline/cli-args.ts',
  'skills/buster/pipeline/git-primitives.ts',
  'skills/buster/pipeline/integrations/discord-webhook.ts',
  'skills/buster/pipeline/integrations/gateway.ts',
  'skills/buster/pipeline/lifecycle-state.ts',
  'skills/buster/pipeline/noncritical-reporting.ts',
  'skills/buster/pipeline/redaction.ts',
  'skills/buster/pipeline/redis-transport.ts',
  'skills/buster/pipeline/security.ts',
  'skills/buster/pipeline/services/acp-gateway-contract.ts',
  'skills/buster/pipeline/services/discord-fields-contract.ts',
  'skills/buster/pipeline/services/discord-fields.ts',
  'skills/buster/pipeline/services/observability-health.ts',
  'skills/buster/pipeline/services/openclaw-plugin-runtime.ts',
  'skills/buster/pipeline/services/pipeline-event-contract.ts',
  'skills/buster/pipeline/services/rate-limit-contract.ts',
  'skills/buster/pipeline/services/redis-message-contract.ts',
  'skills/buster/pipeline/services/task-transport-contract.ts',
  'skills/buster/pipeline/services/telemetry/payload-schema.ts',
  'skills/buster/pipeline/telemetry.ts',
  'skills/buster/pipeline/timing.ts',
  'skills/nova/pipeline/agent-observability/src/index.ts',
  'skills/nova/pipeline/agents/acp-monitor.ts',
  'skills/nova/pipeline/agents/lifecycle.ts',
  'skills/nova/pipeline/agents/runtime.ts',
  'skills/nova/pipeline/agents/session-semantics.ts',
  'skills/nova/pipeline/agents/session-termination.ts',
  'skills/nova/pipeline/agents/tracked-agents.ts',
  'skills/nova/pipeline/cli-args.ts',
  'skills/nova/pipeline/git-primitives.ts',
  'skills/nova/pipeline/integrations/discord-webhook.ts',
  'skills/nova/pipeline/integrations/gateway.ts',
  'skills/nova/pipeline/lifecycle-state.ts',
  'skills/nova/pipeline/noncritical-reporting.ts',
  'skills/nova/pipeline/redaction.ts',
  'skills/nova/pipeline/redis-transport.ts',
  'skills/nova/pipeline/security.ts',
  'skills/nova/pipeline/services/acp-gateway-contract.ts',
  'skills/nova/pipeline/services/discord-fields-contract.ts',
  'skills/nova/pipeline/services/observability-health.ts',
  'skills/nova/pipeline/services/openclaw-plugin-runtime.ts',
  'skills/nova/pipeline/services/pipeline-event-contract.ts',
  'skills/nova/pipeline/services/rate-limit-contract.ts',
  'skills/nova/pipeline/services/redis-message-contract.ts',
  'skills/nova/pipeline/services/task-transport-contract.ts',
  'skills/nova/pipeline/services/telemetry/payload-schema.ts',
  'skills/nova/pipeline/telemetry.ts',
  'skills/nova/pipeline/timing.ts',
]);

const { sourceRoot } = parseArgs();
const runtimeFiles = [
  ...walk(path.join(sourceRoot, 'skills/nova/pipeline')),
  ...walk(path.join(sourceRoot, 'skills/buster/pipeline')),
].sort();

const approved = new Set(APPROVED_COMMON_FACADES);
const commonFacadeFiles = runtimeFiles
  .filter((filePath) => /from ['"].*common\/pipeline/.test(fs.readFileSync(filePath, 'utf8')))
  .map((filePath) => relPath(sourceRoot, filePath))
  .sort();

assert.deepEqual(commonFacadeFiles, [...approved].sort(), 'repo-local common facade inventory changed');

for (const rel of APPROVED_COMMON_FACADES) {
  const abs = path.join(sourceRoot, rel);
  assert.equal(fs.existsSync(abs), true, `${rel} should exist`);
  const source = fs.readFileSync(abs, 'utf8');
  const nonCommentLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('//'));

  assert(nonCommentLines.length > 0, `${rel} should not be empty`);
  for (const line of nonCommentLines) {
    assert(
      /^export (?:\*|\{[^}]+\}) from ['"].*common\/pipeline\/.*['"];?$/.test(line),
      `${rel} must stay a pure common-pipeline re-export; unexpected line: ${line}`,
    );
    const target = line.match(/from ['"]([^'"]+)['"]/)?.[1];
    assert(target, `${rel} should expose a re-export target`);
    const targetAbs = path.resolve(path.dirname(abs), target);
    assert.equal(fs.existsSync(targetAbs), true, `${rel} should point at an existing canonical common owner: ${target}`);
  }

  const forbiddenRuntimeLogic = /\b(?:import|function|class|const|let|var|if|switch|try|catch|require|readGateStatusJson|status_json|legacy_status|fallback|coerce|coercion|compatibility reader)\b/i;
  for (const line of nonCommentLines) {
    assert.equal(forbiddenRuntimeLogic.test(line), false, `${rel} must not contain shim-local logic: ${line}`);
  }
}

for (const filePath of runtimeFiles) {
  const rel = relPath(sourceRoot, filePath);
  if (approved.has(rel)) continue;
  const source = fs.readFileSync(filePath, 'utf8');
  assert.equal(
    /compatibility shim|repo-local facade for .*common|common-pipeline re-export/i.test(source),
    false,
    `${rel} must not introduce an unapproved common facade or compatibility shim`,
  );
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: APPROVED_COMMON_FACADES.length }));
