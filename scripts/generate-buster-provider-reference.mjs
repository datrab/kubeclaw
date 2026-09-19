#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pluginRoot = path.join(root, 'skills/buster/plugins');
const target = path.join(root, 'docs/site/reference/buster-provider-configuration.md');
const revision = '3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f';

function resolvePointer(schema, pointer) {
  assert(pointer.startsWith('#/'), `unsupported external schema reference: ${pointer}`);
  return pointer.slice(2).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => value?.[part], schema);
}

function variants(node, schema) {
  if (!node || typeof node !== 'object') return [];
  if (node.$ref) return variants(resolvePointer(schema, node.$ref), schema);
  return [node, ...(node.allOf ?? []).flatMap((item) => variants(item, schema)),
    ...(node.anyOf ?? []).flatMap((item) => variants(item, schema)),
    ...(node.oneOf ?? []).flatMap((item) => variants(item, schema))];
}

function typeText(nodes) {
  const types = new Set(nodes.flatMap((node) => Array.isArray(node.type) ? node.type : node.type ? [node.type] : []));
  return [...types].sort().join(' or ') || 'schema choice';
}

function ruleText(nodes) {
  const rules = [];
  const add = (label, values) => {
    const unique = [...new Set(values.filter((value) => value !== undefined).map((value) => JSON.stringify(value)))];
    if (unique.length) rules.push(`${label} ${unique.join(' or ')}`);
  };
  add('default', nodes.map((node) => node.default));
  add('constant', nodes.map((node) => node.const));
  const enums = nodes.flatMap((node) => node.enum ?? []);
  if (enums.length) rules.push(`values ${[...new Set(enums.map((value) => JSON.stringify(value)))].join(', ')}`);
  for (const [key, label] of [['minimum', 'minimum'], ['maximum', 'maximum'], ['minLength', 'minimum length'],
    ['maxLength', 'maximum length'], ['minItems', 'minimum items'], ['maxItems', 'maximum items'],
    ['minProperties', 'minimum entries'], ['maxProperties', 'maximum entries']]) add(label, nodes.map((node) => node[key]));
  add('pattern', nodes.map((node) => node.pattern?.replaceAll('(', '&#40;').replaceAll(')', '&#41;')));
  if (nodes.some((node) => node.uniqueItems === true)) rules.push('unique items');
  if (nodes.some((node) => node.additionalProperties === false)) rules.push('no unknown fields');
  return rules.join('; ') || 'No additional scalar limit in the schema.';
}

function collect(schema) {
  const rows = [];
  const walk = (raw, fieldPath, required, ancestors) => {
    const nodes = variants(raw, schema);
    const identity = nodes.map((node) => node).filter(Boolean);
    if (fieldPath) rows.push({ path: fieldPath, required, type: typeText(nodes), rules: ruleText(nodes) });
    for (const node of nodes) {
      if (ancestors.has(node)) continue;
      const next = new Set(ancestors).add(node);
      const requiredNames = new Set(node.required ?? []);
      for (const [name, child] of Object.entries(node.properties ?? {})) {
        walk(child, fieldPath ? `${fieldPath}.${name}` : name, requiredNames.has(name), next);
      }
      if (node.items) walk(node.items, `${fieldPath}[]`, false, next);
      if (node.additionalProperties && typeof node.additionalProperties === 'object') {
        walk(node.additionalProperties, `${fieldPath}{}`, false, next);
      }
    }
  };
  walk(schema, '', true, new Set());
  const unique = new Map();
  for (const row of rows) {
    const current = unique.get(row.path) ?? { path: row.path, requiredStates: new Set(), types: new Set(), rules: new Set() };
    current.requiredStates.add(row.required);
    current.types.add(row.type);
    current.rules.add(row.rules);
    unique.set(row.path, current);
  }
  return [...unique.values()].map((row) => ({
    path: row.path,
    presence: row.requiredStates.size > 1 ? 'Conditional' : row.requiredStates.has(true) ? 'Required' : 'Optional',
    type: [...row.types].sort().join(' or '),
    rules: [...row.rules].sort().join('; '),
  })).sort((a, b) => a.path.localeCompare(b.path));
}

const providers = [];
for (const pluginName of fs.readdirSync(pluginRoot).sort()) {
  const manifestPath = path.join(pluginRoot, pluginName, 'plugin.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const provider of manifest.testProviders ?? []) {
    const file = path.posix.join('skills/buster/plugins', pluginName, provider.configSchema);
    providers.push({ contractId: provider.contractId, file,
      schema: JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) });
  }
}
providers.sort((a, b) => a.contractId.localeCompare(b.contractId));
assert.equal(providers.length, 19, 'the provider inventory changed; inspect the new contract before publication');

const flowFile = 'skills/buster/plugins/api-flow/schemas/flow.schema.json';
const flow = JSON.parse(fs.readFileSync(path.join(root, flowFile), 'utf8'));
const sources = [...new Set([...providers.map((provider) => provider.file), flowFile])].sort();
const lines = [
  '# Buster Provider Configuration', '',
  'Status: generated reference',
  'Audience: pipeline author, operator, test maintainer',
  'Owner: buster',
  `Evidence: scripts/generate-buster-provider-reference.mjs; ${sources.join('; ')}`,
  `Evidence revision: \`${revision}\``,
  'Applies to: complete JSON configuration contracts for all shipped Buster test providers',
  'Last verified: generated from current provider schemas on 2026-09-19', '',
  '## How To Read The Tables', '',
  'A dotted name is an object path. `[]` identifies each array item. `{}` identifies',
  'each value in a map. “Required” applies inside the immediate parent object. A',
  'choice can make a field conditionally required even when the row says optional.',
  'Read the choice rules after the table. The JSON Schema remains the validation',
  'authority. This page makes that authority visible; it does not replace it.', '',
  'The generator records types, defaults, constants, allowed values, numeric and',
  'size limits, patterns, uniqueness, and closed-object rules. It intentionally does',
  'not invent a default when the schema has none.', '',
];

function appendContract(title, schema, file) {
  const rows = collect(schema);
  lines.push(`## \`${title}\``, '',
    `> [Validation schema](https://github.com/datrab/kubeclaw/blob/${revision}/${file})`, '',
    `**Root rule:** ${schema.additionalProperties === false ? 'Unknown top-level fields are rejected.' : 'The root schema does not close unknown fields.'}`, '',
    '| Exact field path | Presence | Type | Schema rules |',
    '| --- | --- | --- | --- |');
  for (const row of rows) {
    const clean = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
    const presence = row.path.endsWith('[]') ? 'Each array item' : row.path.endsWith('{}') ? 'Each map value' : row.presence;
    lines.push(`| \`${clean(row.path)}\` | ${presence} | ${clean(row.type)} | ${clean(row.rules)} |`);
  }
  lines.push('', '### Choice And Dependency Rules', '');
  const choiceRules = [];
  const summary = (node) => {
    const parts = [];
    if (node?.required?.length) parts.push(`requires ${node.required.map((value) => `\`${value}\``).join(', ')}`);
    for (const [name, value] of Object.entries(node?.properties ?? {})) {
      if (value === false) { parts.push(`forbids \`${name}\``); continue; }
      const rules = [];
      if (value.const !== undefined) rules.push(`value \`${JSON.stringify(value.const)}\``);
      if (value.enum) rules.push(`values ${value.enum.map((item) => `\`${JSON.stringify(item)}\``).join(', ')}`);
      if (value.default !== undefined) rules.push(`default \`${JSON.stringify(value.default)}\``);
      if (value.minimum !== undefined) rules.push(`minimum \`${value.minimum}\``);
      if (value.maximum !== undefined) rules.push(`maximum \`${value.maximum}\``);
      parts.push(rules.length ? `constrains \`${name}\` to ${rules.join(' and ')}` : `constrains \`${name}\``);
    }
    if (node?.not) parts.push(`rejects a value that ${summary(node.not)}`);
    return parts.join(' and ') || 'applies its listed field constraints';
  };
  const scan = (node, location = 'root', seen = new Set()) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const keyword of ['oneOf', 'anyOf']) {
      if (Array.isArray(node[keyword])) {
        choiceRules.push(`- At \`${location}\`, satisfy ${keyword === 'oneOf' ? 'exactly one' : 'one or more'} of ${node[keyword].length} schema choices.`);
        for (const [index, choice] of node[keyword].entries()) {
          choiceRules.push(`  - Choice ${index + 1}: ${summary(choice)}.`);
        }
      }
    }
    if (node.dependentRequired) for (const [key, values] of Object.entries(node.dependentRequired)) {
      choiceRules.push(`- At \`${location}\`, \`${key}\` also requires ${values.map((value) => `\`${value}\``).join(', ')}.`);
    }
    if (node.if && node.then) choiceRules.push(`- At \`${location}\`, if it ${summary(node.if)}, then it ${summary(node.then)}.`);
    for (const [name, child] of Object.entries(node.properties ?? {})) scan(child, location === 'root' ? name : `${location}.${name}`, seen);
    if (node.items) scan(node.items, `${location}[]`, seen);
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) for (const child of node[keyword] ?? []) scan(child, location, seen);
  };
  scan(schema);
  lines.push(...(choiceRules.length ? [...new Set(choiceRules)] : ['- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.']), '');
}

for (const provider of providers) appendContract(provider.contractId, provider.schema, provider.file);
appendContract('kubeclaw.api-flow-document@1', flow, flowFile);

lines.push('## Maintenance Rule', '',
  'Change a schema first. Then run `node scripts/generate-buster-provider-reference.mjs --write`.',
  'Review the changed paths and limits as a contract change. The documentation check',
  'rejects a stale file and rejects a provider that is absent from this inventory.', '');

const output = `${lines.join('\n')}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(target, output);
  console.log(`wrote ${path.relative(root, target)}`);
} else {
  assert(fs.existsSync(target), 'generated Buster provider configuration reference is missing');
  assert.equal(fs.readFileSync(target, 'utf8'), output,
    'generated Buster provider configuration reference is stale; run node scripts/generate-buster-provider-reference.mjs --write');
  console.log(`Buster provider configuration verified: ${providers.length} providers and one flow document`);
}
