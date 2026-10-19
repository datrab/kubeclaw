#!/usr/bin/env node
// Bounded manifest declarations, not full report production/consumption or family acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'skills/buster/plugins/junit-report-adapter/plugin.json';
const page = 'docs/site/reference/buster-suites.md';
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, authority), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json'), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/pluginManifest` });
  if (!validate(manifest)) throw new Error(ajv.errorsText(validate.errors));
  const rows = manifest.reportAdapters.flatMap(item => Object.entries(item).map(([key, value]) =>
    `| \`${item.id}\` | \`${key}\` | \`${typeof value === 'string' ? value : JSON.stringify(value)}\` |`));
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const parts = markdown.split('## Report Adapter Registration\n');
  const section = parts.length === 2 ? parts[1].split('\n## ')[0] : '';
  try {
    assert(section.includes(`package \`${manifest.id}@${manifest.packageVersion}\``), 'package identity/version');
    assert(section.includes(`using \`${manifest.apiVersion}\``), 'API version');
    assert.deepEqual(section.split('\n').filter(line => line.startsWith('| `')), rows, 'report adapter declaration mismatch');
  } catch (error) {
    console.error(`DOC_DRIFT_PLUGIN_REGISTRATION: ${page}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Report adapter manifest declarations match ${page}; NOT report execution, consumer semantics, or the full registered family gate.`);
} catch (error) { console.error(`Report adapter input/tool error: ${error.message}`); process.exitCode = 2; }
