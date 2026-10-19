#!/usr/bin/env node
// Emit deterministic, fixture-bound patches. Unsupported constructors fail closed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const [flag, id, ...extra] = process.argv.slice(2);
assert(flag === '--emit' && id && !extra.length, 'usage: --emit <kind:variant:operation>');
const [kind, variantId, operation, ...trailing] = id.split(':');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === kind);
const variant = family?.variants.find(item => item.id === variantId);
assert(variant && family.operations.includes(operation) && !trailing.length, 'unregistered mutation');
assert(variant.constructor === 'typescript-error-code-v1', `constructor not implemented: ${variant.constructor}`);
const original = fs.readFileSync(path.join(root, variant.sourceAuthority), 'utf8');
const anchor = "  if (!sourceAttestationPublicKey) throw new Error('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING');\n";
assert.equal(original.split(anchor).length, 2, 'error-code fixture anchor must occur exactly once');
const added = "  if (sourceAttestationPublicKey === 'fixture-rejected-key') throw new Error('BUSTER_SOURCE_ATTESTATION_ROTATED_PUBLIC_KEY_MISSING');\n";
const replacement = operation === 'add' ? anchor + added
  : operation === 'change' ? anchor.replace('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING', 'BUSTER_SOURCE_ATTESTATION_ROTATED_PUBLIC_KEY_MISSING') : '';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-ap09-patch-'));
try {
  for (const [side, content] of [['a', original], ['b', original.replace(anchor, replacement)]]) {
    const target = path.join(temporary, side, variant.sourceAuthority);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--no-color', '--src-prefix=', '--dst-prefix=', `a/${variant.sourceAuthority}`, `b/${variant.sourceAuthority}`], { cwd: temporary, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || 'expected a nonempty patch');
  process.stdout.write(result.stdout);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
