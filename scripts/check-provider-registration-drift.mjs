#!/usr/bin/env node
// Bounded returned-provider record contract only; not the complete registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'tests/verification/e2e/provider-catalog.mjs';
const page = 'docs/site/reference/buster-provider-configuration.md';
try {
  const source = ts.createSourceFile(authority, fs.readFileSync(path.join(root, authority), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) throw new Error('invalid catalogue JavaScript');
  const records = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'providers.set') {
      const frozen = node.arguments[1];
      if (!frozen || !ts.isCallExpression(frozen) || frozen.expression.getText(source) !== 'Object.freeze' || !ts.isObjectLiteralExpression(frozen.arguments[0])) throw new Error('unsupported provider record construction');
      records.push(frozen.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (records.length !== 1) throw new Error('expected one provider record construction');
  const rows = records[0].properties.map(member => {
    if (!ts.isPropertyAssignment(member) && !ts.isShorthandPropertyAssignment(member)) throw new Error('unsupported provider field');
    return `| \`${member.name.getText(source)}\` | \`${ts.isPropertyAssignment(member) ? member.initializer.getText(source) : member.name.getText(source)}\` |`;
  });
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const parts = markdown.split('## Remote Capability Provider Catalogue\n');
  const actual = parts.length === 2 ? parts[1].split('\n## ')[0].split('\n').filter(line => line.startsWith('| `')) : [];
  try { assert.deepEqual(actual, rows, 'returned provider record mismatch'); }
  catch (error) {
    console.error(`DOC_DRIFT_PLUGIN_REGISTRATION: ${page}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Provider returned-record fields match ${page}; selection/validation behavior and full registration-family gate NOT qualified.`);
} catch (error) { console.error(`Provider catalogue input/tool error: ${error.message}`); process.exitCode = 2; }
