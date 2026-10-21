#!/usr/bin/env node
// Constructor qualification only: no documentation gate or A911-11 acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const family = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json'))).mutationTests.find(x => x.kind === 'contract');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-sdk-contract-constructors-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: temporary, encoding: 'utf8', ...options });
  assert(!result.error && !result.signal, String(result.error ?? result.signal));
  return result;
}
function parse(relative, text) {
  const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(source.parseDiagnostics.length, 0, `${relative}: malformed constructor`);
  return source;
}
function observe(variant, source) {
  if (variant.id === 'sdk-export') {
    return Object.fromEntries(source.statements.filter(ts.isVariableStatement)
      .filter(node => node.modifiers?.some(x => x.kind === ts.SyntaxKind.ExportKeyword))
      .flatMap(node => node.declarationList.declarations.map(decl => [decl.name.getText(source), decl.initializer?.getText(source)])));
  }
  const owner = source.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'ReviewCacheProfile');
  assert(owner && ts.isTypeLiteralNode(owner.type), 'missing owning public contract');
  return Object.fromEntries(owner.type.members.map(member => [member.name.getText(source), { optional: Boolean(member.questionToken), type: member.type.getText(source) }]));
}
try {
  for (const variant of family.variants.filter(x => ['sdk-export', 'public-contract-member'].includes(x.id))) {
    const source = path.join(temporary, variant.sourceAuthority);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    const original = fs.readFileSync(path.join(root, variant.sourceAuthority));
    fs.writeFileSync(source, original);
    const before = observe(variant, parse(variant.sourceAuthority, original.toString()));
    for (const operation of family.operations) {
      const id = `contract:${variant.id}:${operation}`;
      const emit = () => run(process.execPath, ['scripts/docs-ap09-mutation-fixture.mjs', '--emit', id], { cwd: root });
      const patch = emit();
      assert.equal(patch.status, 0, patch.stderr);
      assert.equal(emit().stdout, patch.stdout, `${id}: nondeterministic patch`);
      assert.deepEqual([...patch.stdout.matchAll(/^diff --git a\/(.+) b\/(.+)$/gmu)].flatMap(x => [x[1], x[2]]), [variant.sourceAuthority, variant.sourceAuthority]);
      const apply = run('git', ['apply', '-'], { input: patch.stdout });
      assert.equal(apply.status, 0, apply.stderr);
      try {
        const after = observe(variant, parse(variant.sourceAuthority, fs.readFileSync(source, 'utf8')));
        const expected = structuredClone(before);
        if (variant.id === 'sdk-export') {
          if (operation === 'add') expected.FIXTURE_PLUGIN_COMPATIBILITY = "'fixture-plugin-v1' as const";
          else if (operation === 'change') expected.PLUGIN_API_VERSION = "'fixture-plugin-v3' as const";
          else delete expected.PLUGIN_API_VERSION;
        } else {
          if (operation === 'add') expected.fixtureCompatibility = { optional: true, type: '{ version: "fixture.v1"; strict: boolean }' };
          else if (operation === 'change') expected.schemaVersion = { optional: true, type: "'review-cache-profile.v2'" };
          else delete expected.schemaVersion;
        }
        assert.deepEqual(after, expected, `${id}: wrong public identity/member transformation`);
        assert.notDeepEqual(after, before);
        const reverse = run('git', ['apply', '--reverse', '-'], { input: patch.stdout });
        assert.equal(reverse.status, 0, reverse.stderr);
        assert(fs.readFileSync(source).equals(original), `${id}: reverse did not restore exact source`);
        console.log(`${id}: deterministic single-authority patch; syntax and exact public AST delta PASS; reversible`);
      } finally { fs.writeFileSync(source, original); }
    }
  }
  for (const id of ['contract:sdk-export:unknown', 'contract:unknown:add', 'contract:public-contract-member:add:extra']) {
    const invalid = run(process.execPath, ['scripts/docs-ap09-mutation-fixture.mjs', '--emit', id], { cwd: root });
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '', `${id}: invalid request emitted a patch`);
  }
  console.log('6/6 SDK contract constructors qualified. Documentation rejection, full contract-family gate and independent review NOT qualified.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
