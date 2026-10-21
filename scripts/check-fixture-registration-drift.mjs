#!/usr/bin/env node
// Bounded E2E requirement-policy records only; not fixture-provider discovery or the full family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'tests/verification/e2e/fixture-coverage.mjs';
const page = 'docs/site/reference/buster-suites.md';
try {
  const source = ts.createSourceFile(authority, fs.readFileSync(path.join(root, authority), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) throw new Error('invalid coverage JavaScript');
  const rows = [];
  for (const name of ['moduleRequirements', 'finalRequirements']) {
    const declarations = source.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).filter(node => node.name.getText(source) === name);
    if (declarations.length !== 1) throw new Error(`expected one ${name} declaration`);
    const frozen = declarations[0].initializer;
    if (!frozen || !ts.isCallExpression(frozen) || frozen.expression.getText(source) !== 'Object.freeze' || frozen.arguments.length !== 1 || !ts.isObjectLiteralExpression(frozen.arguments[0])) throw new Error(`unsupported ${name} construction`);
    const seen = new Set();
    for (const member of frozen.arguments[0].properties) {
      if (!ts.isPropertyAssignment(member) || !(ts.isStringLiteral(member.name) || ts.isIdentifier(member.name)) || !ts.isStringLiteral(member.initializer)) throw new Error(`unsupported ${name} requirement`);
      const id = member.name.text;
      if (seen.has(id)) throw new Error(`duplicate ${name} requirement: ${id}`);
      seen.add(id);
      if (/[|\n\r]/u.test(id + member.initializer.text)) throw new Error('unsupported table cell');
      rows.push(`| \`${name}\` | \`${id}\` | ${member.initializer.text} |`);
    }
  }
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const parts = markdown.split('## E2E Fixture Coverage Policy\n');
  const actual = parts.length === 2 ? parts[1].split('\n## ')[0].split('\n').filter(line => line.startsWith('| `')) : [];
  try { assert.deepEqual(actual, rows, 'E2E requirement-policy record mismatch'); }
  catch (error) {
    console.error(`DOC_DRIFT_PLUGIN_REGISTRATION: ${page}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`E2E requirement-policy records match ${page}; coverage assembly/validation and full registration-family gate NOT qualified.`);
} catch (error) { console.error(`Fixture coverage input/tool error: ${error.message}`); process.exitCode = 2; }
