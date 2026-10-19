#!/usr/bin/env node
// Bounded registry extension-class variant, not the full registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'skills/common/plugin-runtime/foundation/registry/types.ts';
const page = 'docs/site/extend/README.md';
try {
  const source = ts.createSourceFile(authority, fs.readFileSync(path.join(root, authority), 'utf8'), ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error('invalid registry TypeScript');
  const snapshot = source.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'RegistrySnapshot');
  if (!snapshot) throw new Error('missing RegistrySnapshot');
  const rows = [];
  for (const member of snapshot.members) {
    if (!ts.isPropertySignature(member) || !member.type) throw new Error('unsupported snapshot member');
    const type = member.type.getText(source).replace(/\s+/gu, '');
    if (type.includes('RegistryEntry')) rows.push(`| \`${member.name.getText(source)}\` | \`${type}\` |`);
  }
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const parts = markdown.split('### Registry Extension Class Indexes\n');
  const actual = parts.length === 2 ? parts[1].split('\n## ')[0].split('\n').filter(line => line.startsWith('| `')) : [];
  try { assert.deepEqual(actual, rows, 'registry class/index identity or entry contract mismatch'); }
  catch (error) {
    console.error(`DOC_DRIFT_PLUGIN_REGISTRATION: ${page}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Registry class/index contracts match ${page}; not activation/removal behavior or independent acceptance.`);
} catch (error) { console.error(`Extension class input/tool error: ${error.message}`); process.exitCode = 2; }
