#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function assertOk(condition, message) {
  if (!condition) failures.push(message);
}

function checkFallbackLedger() {
  const relPath = 'docs/archive/ts-migration/fallback-ledger.md';
  const text = readText(relPath);
  const unresolved = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.startsWith('| `')) continue;
    if (/\bneeds user decision\b/.test(line) || /\brename as canonical(?: behavior| default)?\b/.test(line)) {
      unresolved.push(`${relPath}:${index + 1}`);
    }
  }
  assertOk(unresolved.length === 0, `fallback ledger has unresolved labels: ${unresolved.join(', ')}`);
}

function checkSliceTemplate() {
  const relPath = 'docs/archive/ts-migration/slice-review-template.md';
  const text = readText(relPath);
  const required = [
    'Slice:',
    'Files read/migrated:',
    'Runtime entrypoints affected:',
    'Incoming callers:',
    'Outgoing dependencies:',
    'Dynamic imports:',
    'Exported symbols:',
    'Canonical authority used:',
    'Fallback/legacy/shim hits found:',
    'Fallback-ledger rows resolved:',
    'DELETE_LEGACY:',
    'STRICTIFY_TS_SLICE:',
    'KEEP_TYPED_POLICY:',
    'external adapter/facade:',
    'Node type stripping compatibility:',
    'Tests/checks run:',
  ];
  for (const marker of required) {
    assertOk(text.includes(marker), `${relPath} missing checklist marker: ${marker}`);
  }
  const staleMarkers = ['renamed as canonical:', 'needs user decision:'];
  for (const marker of staleMarkers) {
    assertOk(!text.includes(marker), `${relPath} still contains stale marker: ${marker}`);
  }
}

function checkTsConfig(relPath, { allowJsExpected = false } = {}) {
  const json = readJson(relPath);
  const options = json.compilerOptions ?? {};
  assertOk(options.noEmit === true, `${relPath} must use noEmit:true`);
  assertOk(options.module === 'NodeNext', `${relPath} must use module:NodeNext`);
  assertOk(options.moduleResolution === 'NodeNext', `${relPath} must use moduleResolution:NodeNext`);
  assertOk(options.strict === true, `${relPath} must use strict:true`);
  assertOk(options.noImplicitAny === true, `${relPath} must use noImplicitAny:true`);
  assertOk(options.strictNullChecks === true, `${relPath} must use strictNullChecks:true`);
  assertOk(options.exactOptionalPropertyTypes === true, `${relPath} must use exactOptionalPropertyTypes:true`);
  assertOk(options.noUncheckedIndexedAccess === true, `${relPath} must use noUncheckedIndexedAccess:true`);
  assertOk(options.allowImportingTsExtensions === true, `${relPath} must use allowImportingTsExtensions:true`);
  assertOk(options.erasableSyntaxOnly === true, `${relPath} must use erasableSyntaxOnly:true`);
  assertOk(options.verbatimModuleSyntax === true, `${relPath} must use verbatimModuleSyntax:true`);
  assertOk(options.rewriteRelativeImportExtensions === true, `${relPath} must use rewriteRelativeImportExtensions:true`);
  if (allowJsExpected) {
    assertOk(options.allowJs === true, `${relPath} must explicitly document temporary allowJs:true`);
    assertOk(options.checkJs === false, `${relPath} temporary allowJs must keep checkJs:false`);
  } else {
    assertOk(options.allowJs !== true, `${relPath} must not enable allowJs`);
  }
}

function checkPackageTypecheck(relPath) {
  const json = readJson(relPath);
  assertOk(json.type === 'module', `${relPath} must declare type:module`);
  assertOk(json.scripts?.typecheck === 'tsc --noEmit -p tsconfig.json', `${relPath} must expose scripts.typecheck`);
}

checkFallbackLedger();
checkSliceTemplate();
checkPackageTypecheck('skills/common/pipeline/agent-observability/package.json');
checkPackageTypecheck('skills/nova/package.json');
checkPackageTypecheck('skills/buster/package.json');
checkTsConfig('skills/common/pipeline/agent-observability/tsconfig.json');
checkTsConfig('skills/nova/tsconfig.json');
checkTsConfig('skills/buster/tsconfig.json');

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: 'ts-migration-guardrails' }));
