#!/usr/bin/env node
/** Schema-source drift and literal property-pointer inventory, not runtime validation. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bindingPath = 'docs/config/schema-field-bindings.json';
const outputPath = 'docs/generated/inventory/schema-field-drift.json';
const excluded = new Set(['.git', 'node_modules', '.tmp', 'dist', 'build', 'target', 'coverage', 'tmp', '.cache', '__pycache__']);
export function schemaFieldInputs(root) {
  const schemas = [], registrations = [];
  function visit(relative = '') {
    for (const item of fs.readdirSync(path.join(root, relative), {withFileTypes: true})) {
      if (excluded.has(item.name)) continue;
      const name = relative ? relative + '/' + item.name : item.name;
      if (item.isSymbolicLink()) throw new Error(`SCHEMA_FIELD_INPUT_SYMLINK:${name}`);
      if (item.isDirectory()) visit(name);
      else if (item.isFile()) {
        if (name.endsWith('.schema.json')) schemas.push(name);
        if (['plugin.json', 'openclaw.plugin.json'].includes(item.name) && (name.startsWith('skills/') || name.startsWith('docs/site/extend/examples/'))) registrations.push(name);
      }
    }
  }
  visit();
  registrations.push('package.json', 'package-lock.json');
  return {schemas: schemas.sort(), registrations: registrations.sort()};
}
export function propertyPointers(value) {
  const fields = [];
  const escape = key => key.replaceAll('~', '~0').replaceAll('/', '~1');
  function visit(node, pointer = '') {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
      for (const [name, member] of Object.entries(node.properties)) fields.push({pointer: pointer + '/properties/' + escape(name), subtreeSha256: digest(JSON.stringify(member))});
    }
    for (const [key, child] of Object.entries(node)) visit(child, pointer + '/' + escape(key));
  }
  visit(value);
  return fields.sort((a, b) => a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0);
}
export function schemaFieldInventory(root) {
  const binding = JSON.parse(fs.readFileSync(path.join(root, bindingPath)));
  const inputs = schemaFieldInputs(root);
  const expected = binding.schemas;
  for (const name of [...new Set([...Object.keys(expected), ...inputs.schemas])].sort()) {
    const record = expected[name];
    if (!record || !inputs.schemas.includes(name)) throw new Error(`SCHEMA_FIELD_INPUT_DRIFT:${record ? 'removed' : 'added'}:${name}:review schema family and reference route`);
    if (!['current-declaration', 'fixture', 'retained', 'documentation-only'].includes(record.status)) throw new Error(`SCHEMA_FIELD_STATUS_INVALID:${name}`);
    if (typeof record.referenceRoute !== 'string' || !record.referenceRoute.startsWith('docs/site/') || record.referenceRoute.split('/').includes('..') || !fs.statSync(path.join(root, record.referenceRoute.split('#')[0])).isFile()) throw new Error(`SCHEMA_FIELD_ROUTE_INVALID:${name}`);
    if (digest(fs.readFileSync(path.join(root, name))) !== record.sha256) throw new Error(`SCHEMA_FIELD_INPUT_DRIFT:changed:${name}:${record.referenceRoute}`);
  }
  for (const name of [...new Set([...Object.keys(binding.registrations), ...inputs.registrations])].sort()) {
    if (!inputs.registrations.includes(name) || !Object.hasOwn(binding.registrations, name) || digest(fs.readFileSync(path.join(root, name))) !== binding.registrations[name]) throw new Error(`SCHEMA_FIELD_REGISTRATION_DRIFT:${name}:review inline schema and family registration`);
  }
  return {schemaVersion: 'schema-field-drift.v1', meaning: 'Literal JSON properties-key pointers and member subtree digests, including definitions, arrays and composition/data objects. Not schema validation, applicable runtime fields, reference resolution or consumer/default semantics. Current declaration status does not prove activation.', schemas: inputs.schemas.map(name => ({path: name, ...expected[name], properties: propertyPointers(JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')))})), registrations: binding.registrations};
}
export function checkSchemaFieldInventory(root) {
  const inventory = schemaFieldInventory(root);
  const content = JSON.stringify(inventory, null, 2) + '\n';
  if (fs.readFileSync(path.join(root, outputPath), 'utf8') !== content) throw new Error(`SCHEMA_FIELD_OUTPUT_DRIFT:${outputPath}`);
  return {schemas: inventory.schemas.length, propertyPointers: inventory.schemas.reduce((sum, item) => sum + item.properties.length, 0), runtimeValidationClaimed: false};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  if (process.argv.includes('--check')) console.log(JSON.stringify(checkSchemaFieldInventory(root)));
  else {
    fs.writeFileSync(path.join(root, outputPath), JSON.stringify(schemaFieldInventory(root), null, 2) + '\n');
    console.log(JSON.stringify({generated: outputPath, runtimeValidationClaimed: false}));
  }
}
