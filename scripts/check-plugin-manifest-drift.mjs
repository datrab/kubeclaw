#!/usr/bin/env node
// Bounded plugin-manifest variant; NOT the five-variant registration-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'skills/nova/plugins/lint/plugin.json';
const page = 'docs/site/extend/plugin-catalogue/kubeclaw.lint.md';
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, authority), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json'), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(schema);
  const validate = ajv.compile({ $ref: `${schema.$id}#/$defs/pluginManifest` });
  if (!validate(manifest)) throw new Error(ajv.errorsText(validate.errors));
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const kinds = { stages: 'stage', observers: 'observer', adapters: 'capability adapter', testProviders: 'test provider', reportAdapters: 'report adapter' };
  // Compare actual reader fields, not source digests or registration counts.
  try {
    assert(markdown.startsWith(`# ${manifest.id}\n`), 'package title');
    assert(markdown.includes(`Applies to: ${manifest.apiVersion}; package ${manifest.packageVersion}\n`), 'API/package version');
    assert(markdown.includes(`- Package identity: \`${manifest.id}@${manifest.packageVersion}\`.`), 'package identity');
    const summary = markdown.split('## Registration Summary\n');
    assert.equal(summary.length, 2, 'unique registration summary');
    const summaryRows = summary[1].split('\n## ')[0].split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Kind') && !line.startsWith('| ---'));
    const registrations = Object.entries(kinds).flatMap(([key, kind]) => (manifest[key] ?? []).map(value => ({ kind, value })));
    assert.deepEqual(summaryRows, registrations.map(({ kind, value }) => `| ${kind} | \`${value.id}\` | \`${value.type ?? value.contractId ?? value.format ?? value.id}\` | \`${value.module}\` | \`${value.export}\` |`), 'summary registration identities/types/modules/exports');
    const sections = [...markdown.matchAll(/^## (stage|observer|capability adapter|test provider|report adapter): (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gmu)];
    assert.deepEqual(sections.map(match => [match[1], match[2]]), registrations.map(({ kind, value }) => [kind, value.id]), 'registration section set/order');
    registrations.forEach(({ value }, index) => {
      const body = sections[index][3];
      assert(body.includes(`Global registration ID: \`${manifest.id}:${value.id}\`.`), 'global identity');
      const rows = body.split('Declared manifest facts:\n');
      assert.equal(rows.length, 2, 'unique declared facts');
      const actual = rows[1].split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Field') && !line.startsWith('| ---'));
      const expected = Object.entries(value).map(([key, item]) => `| \`${key}\` | ${Array.isArray(item) && !item.length ? 'Empty list.' : `\`${typeof item === 'string' ? item : JSON.stringify(item)}\``} |`);
      assert.deepEqual(actual, expected, 'exact declared registration fields');
      for (const key of ['configSchema', 'inputSchema', 'resultSchema']) {
        if (value[key]) assert(body.includes(`/${path.posix.dirname(authority)}/${value[key]})`), `${key} reader link`);
      }
    });
  } catch (error) {
    console.error(`DOC_DRIFT_PLUGIN_REGISTRATION: ${page}: manifest package/registration/schema/capability reader mismatch (${error.message.split('\n')[0]})`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Manifest registration facts match ${page}; NOT activation, owner behavior, remaining registration variants or independent acceptance.`);
} catch (error) { console.error(`Plugin manifest input/tool error: ${error.message}`); process.exitCode = 2; }
