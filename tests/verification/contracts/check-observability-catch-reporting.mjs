#!/usr/bin/env node
import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-observability-catch-reporting' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';


const args = parseSourceRootArgs();
const sourceRoot = path.resolve(args['source-root'] || process.cwd());

const scopedFiles = [
  'skills/common/pipeline/noncritical-reporting.ts',
  'skills/common/pipeline/egress.ts',
  'skills/nova/pipeline/services/telemetry.ts',
  'skills/nova/pipeline/services/telemetry/builders.ts',
  'skills/nova/pipeline/services/telemetry/dispatch.ts',
  'skills/nova/pipeline/services/telemetry/sinks.ts',
  'skills/nova/pipeline/services/telemetry-stream.ts',
  'skills/nova/pipeline/services/observability.ts',
  'skills/nova/pipeline/services/failure-semantics.ts',
  'skills/nova/pipeline/services/failures/classification.ts',
  'skills/nova/pipeline/services/failures/presentation.ts',
  'skills/nova/pipeline/services/failures/retry-policy.ts',
  'skills/nova/pipeline/services/notification-dispatch.ts',
  'skills/nova/pipeline/integrations/discord.ts',
  'skills/buster/pipeline/services/telemetry.ts',
  'skills/buster/pipeline/services/discord.ts',
  'skills/buster/pipeline/services/logger.ts',
];

const bannedPatterns = [
  { name: 'bare catch', regex: /catch\s*\{/g },
  { name: 'empty promise catch', regex: /\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\{\s*\}\s*\)/g },
  { name: 'noop error listener', regex: /\.on\(\s*['"]error['"]\s*,\s*\(\)\s*=>\s*\{\s*\}\s*\)/g },
];

for (const relativePath of scopedFiles) {
  const absolutePath = path.join(sourceRoot, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const pattern of bannedPatterns) {
    const matches = [...content.matchAll(pattern.regex)];
    assert.equal(
      matches.length,
      0,
      `${relativePath} still contains ${pattern.name}: ${matches.map((match) => match[0]).join(', ')}`,
    );
  }
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: scopedFiles.length, sourceRoot }, null, 2));
