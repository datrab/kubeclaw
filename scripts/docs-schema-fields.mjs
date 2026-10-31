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
// Current reviewed schema-authority remainder, not a schema evaluator or runtime grant.
const reviewedAuthorityCoverageSha256 = 'b017882d0cdba9f5f2f7d2ddc464ee3c1c94075b66240edb0a715c9ebd8251cd';
function regularAuthorityInput(root, name, expected) {
  if (typeof name !== 'string' || path.isAbsolute(name) || name.includes('\\') || name.includes('\0')
    || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`SCHEMA_AUTHORITY_PATH:${name}`);
  const absolute = path.join(root, name), stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.nlink !== 1 || fs.realpathSync(absolute) !== absolute) throw new Error(`SCHEMA_AUTHORITY_PHYSICAL:${name}`);
  const bytes = fs.readFileSync(absolute);
  if (digest(bytes) !== expected) throw new Error(`SCHEMA_AUTHORITY_INPUT_DRIFT:${name}`);
  return bytes;
}
export function schemaAuthorityCoverage(root, binding) {
  if (fs.realpathSync(root) !== path.resolve(root)) throw new Error('SCHEMA_AUTHORITY_ROOT');
  const coverage = binding.authorityCoverage;
  if (coverage?.schemaVersion !== 'schema-authority-coverage.v1' || !Array.isArray(coverage.records)
    || !Array.isArray(coverage.coveredCurrentSchemaPaths) || !Array.isArray(coverage.inputs)) throw new Error('SCHEMA_AUTHORITY_COVERAGE_MISSING');
  const reused = coverage.coveredCurrentSchemaPaths, added = coverage.records.map(record => record.schema);
  const selected = [...reused, ...added], current = Object.keys(binding.schemas).filter(name => binding.schemas[name].status === 'current-declaration').sort();
  if (new Set(selected).size !== selected.length) throw new Error('SCHEMA_AUTHORITY_DUPLICATE');
  if (JSON.stringify([...selected].sort()) !== JSON.stringify(current)) throw new Error('SCHEMA_AUTHORITY_CURRENT_COVERAGE');
  const inputs = new Map(coverage.inputs.map(input => [input.path, input]));
  if (inputs.size !== coverage.inputs.length) throw new Error('SCHEMA_AUTHORITY_INPUT_DUPLICATE');
  const bytes = new Map();
  for (const [name, input] of inputs) bytes.set(name, regularAuthorityInput(root, name, input.sha256));
  const kinds = new Set(['manual-contract-parser','ajv-selected-definition','ajv-provider-details','manual-provider-profiles','manual-provider-settings','manual-provider-baselines','generated-validator-dispatch','declaration-only']);
  for (const record of coverage.records) {
    if (!kinds.has(record.readerKind) || record.schemaPointer !== '' || record.runtimeValidationObserved !== false
      || record.deploymentOrDeliveryObserved !== false) throw new Error(`SCHEMA_AUTHORITY_CLAIM:${record.schema}`);
    if (!Array.isArray(record.consumers) || !Array.isArray(record.authorityInputs)
      || !record.authorityInputs.length || record.authorityInputs.some(name => !inputs.has(name))) throw new Error(`SCHEMA_AUTHORITY_UNBOUND_INPUT:${record.schema}`);
    const telemetry = record.family === 'telemetry-bundle-contracts';
    if (telemetry !== (record.readerKind === 'declaration-only') || telemetry && record.consumers.length
      || !telemetry && !record.consumers.length) throw new Error(`SCHEMA_AUTHORITY_READER_BOUNDARY:${record.schema}`);
    for (const consumer of record.consumers) {
      if (!inputs.has(consumer.source) || !Array.isArray(consumer.symbols) || !consumer.symbols.length) throw new Error(`SCHEMA_AUTHORITY_CONSUMER:${record.schema}`);
      // Presence is a locator sanity check only. Exact sealed source + independent Source
      // disposition, not this string match, substantiates the consumer meaning.
      if (consumer.symbols.some(symbol => typeof symbol !== 'string' || !symbol || !bytes.get(consumer.source).toString('utf8').includes(symbol))) throw new Error(`SCHEMA_AUTHORITY_SYMBOL:${record.schema}`);
    }
    for (const field of ['family','defaultBehavior','constraintBoundary','selectionAndFailureBoundary']) if (typeof record[field] !== 'string' || !record[field]) throw new Error(`SCHEMA_AUTHORITY_MEANING:${record.schema}`);
    if (record.schemaSha256 !== binding.schemas[record.schema]?.sha256) throw new Error(`SCHEMA_AUTHORITY_SCHEMA_BINDING:${record.schema}`);
    const schema = JSON.parse(regularAuthorityInput(root, record.schema, record.schemaSha256));
    if ((schema.$id ?? null) !== record.schemaId || (schema.$schema ?? null) !== record.dialect) throw new Error(`SCHEMA_AUTHORITY_IDENTITY:${record.schema}`);
  }
  if (digest(JSON.stringify(coverage)) !== reviewedAuthorityCoverageSha256) throw new Error('SCHEMA_AUTHORITY_DISPOSITION_DRIFT: independent affected meaning review required');
  return coverage;
}
const authorityStart = '<!-- BEGIN GENERATED: schema authority dispositions -->';
const authorityEnd = '<!-- END GENERATED: schema authority dispositions -->';
export function renderSchemaAuthorityReference(root, inventory, originalPage) {
  const coverage = inventory.authorityCoverage;
  const escape = text => String(text).replaceAll('&','&amp;').replaceAll('|','&#124;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n',' ');
  const link = name => '[`' + escape(name) + '`](../../../' + name + ')';
  const rows = coverage.records.map(record => '| ' + [link(record.schema) + '<br>Root pointer `/`; ' + escape(record.schemaId ?? 'No independent $id') + '<br>' + escape(record.dialect ?? 'No declared dialect'), record.consumers.length ? record.consumers.map(consumer => link(consumer.source) + ': ' + consumer.symbols.map(escape).join(', ')).join('<br>') : 'Declared asset; no proved current runtime schema reader', escape(record.defaultBehavior), escape(record.constraintBoundary) + '<br>' + escape(record.selectionAndFailureBoundary)].join(' | ') + ' |').join('\n');
  const block = `${authorityStart}\n\n## Additional current schema authority dispositions\n\nVerified source bindings: ${coverage.verifiedDate}. The ${coverage.records.length} entries below complete the ${new Set(coverage.records.map(record => record.family)).size} residual authority families beside the reused configuration, Event, registration, Worker, chart and named manual/generated routes above. Classification as a current declaration is not runtime activation.\n\nUse the [field index](../../../docs/generated/inventory/schema-field-drift.json) for every bound JSON schema and recursive property pointer; open the exact schema for its constraints, references and branch/default annotations. Hashes guard the whole document, including non-property rules. The index is not a schema validator or reference resolver. The sealed authority dispositions identify actual source routes and explicitly separate declaration-only assets from a selected validator. No validation, browser, provider or telemetry delivery run is claimed.\n\n| Schema identity and dialect | Selected source consumer | Defaults and fallbacks | Constraint / selection boundary |\n| --- | --- | --- | --- |\n${rows}\n\nAll ${coverage.records.length} residual schema documents currently contain no default annotations. Provider built-ins, optional budget selection and derived digests are manual consumer behavior, not schema-default insertion. AJV declarations and generated code do not prove a browser, provider, deployment or runtime operation completed.\n\nTelemetry v1 bundle declarations are retained delivered assets. Neither the content manifest nor TypeScript types establishes a current schema reader; do not infer ingestion, quarantine, ordering or activation from their names. Keep unknown external readers separate from the active v2 telemetry runtime.\n\nMaintain these dispositions through the existing schema binding file after affected source review. Run \`node scripts/docs-schema-fields.mjs --reference\` and its \`--check --reference\` mode. An unknown current authority, changed source/schema/package/registration or altered reader/default claim is a stop, not a hash-refresh permission.\n\n${authorityEnd}`;
  let page = originalPage;
  const hasStart = page.includes(authorityStart), hasEnd = page.includes(authorityEnd);
  if (hasStart !== hasEnd || page.split(authorityStart).length > 2 || page.split(authorityEnd).length > 2) throw new Error('SCHEMA_AUTHORITY_REFERENCE_MARKERS');
  if (hasStart) {
    const begin = page.indexOf(authorityStart), end = page.indexOf(authorityEnd);
    if (end < begin) throw new Error('SCHEMA_AUTHORITY_REFERENCE_MARKERS');
    page = page.slice(0,begin) + block + page.slice(end + authorityEnd.length);
  } else {
    const anchor = '## Validate, diagnose, and change the right contract';
    if (page.split(anchor).length !== 2) throw new Error('SCHEMA_AUTHORITY_REFERENCE_ANCHOR');
    page = page.replace(anchor, block + '\n\n' + anchor);
  }
  if ([...page.matchAll(/^Status: .*$/gm)].length !== 1 || [...page.matchAll(/^Last verified: .*$/gm)].length !== 1) throw new Error('SCHEMA_AUTHORITY_REFERENCE_METADATA');
  page = page.replace(/^Status: .*$/m, 'Status: source-bound schema authority reference; execution and applicability limits remain explicit.')
    .replace(/^Last verified: .*$/m, `Last verified: ${coverage.verifiedDate}. Guarded declarations and source consumer/default dispositions; no validation or deployment run.`);
  const oldLimit = 'It did not cover every other contracts root,\ntelemetry/API/event authority, host/Codex plugin root, tools/ops/packaging source,\ndynamic registration or arbitrary embedded TS/JS schema expression.';
  const newLimit = 'That earlier survey is not the current whole authority map. The current configuration/Event/field-index routes and sealed residual table below supply the supported declaration and consumer dispositions. Arbitrary dynamic registrations or TS/JS expressions are not evaluated as schema validation.';
  const oldCount = page.split(oldLimit).length - 1, currentCount = page.split(newLimit).length - 1;
  if (oldCount + currentCount !== 1) throw new Error('SCHEMA_AUTHORITY_REFERENCE_DISCLOSURE');
  if (oldCount === 1) page = page.replace(oldLimit,newLimit);
  // Renew only the known moved selector citation from its actual current owner.
  const selectorName = 'scripts/docs-configuration-inventory.mjs', selectorBytes = fs.readFileSync(path.join(root,selectorName));
  const lines = selectorBytes.toString('utf8').split(/\r?\n/), begin = lines.findIndex(line => line.startsWith('function registeredSchemaAuthorities('));
  const closing = lines.findIndex((line,index) => index > begin && line === '}');
  if (begin < 0 || closing < begin) throw new Error('SCHEMA_AUTHORITY_SELECTOR_LOCATOR');
  const citation = '[registeredSchemaAuthorities](../../../' + selectorName + '#L' + (begin+1) + '-L' + (closing+1) + ') (`' + selectorName + ':' + (begin+1) + '–' + (closing+1) + '`, current-checkout SHA-256 `' + digest(selectorBytes) + '`).';
  const selectorCitation = /\[registeredSchemaAuthorities\]\(\.\.\/\.\.\/\.\.\/scripts\/docs-configuration-inventory\.mjs#L\d+-L\d+\) \(`scripts\/docs-configuration-inventory\.mjs:\d+–\d+`, current-checkout SHA-256 `[0-9a-f]{64}`\)\./g;
  const matches = [...page.matchAll(selectorCitation)];
  if (matches.length !== 1) throw new Error('SCHEMA_AUTHORITY_SELECTOR_CITATION');
  return page.replace(selectorCitation, () => citation);
}

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
  return {schemaVersion: 'schema-field-drift.v1', meaning: 'Literal JSON properties-key pointers and member subtree digests, including definitions, arrays and composition/data objects. Not schema validation, applicable runtime fields, reference resolution or consumer/default semantics. Current declaration status does not prove activation.', schemas: inputs.schemas.map(name => ({path: name, ...expected[name], properties: propertyPointers(JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')))})), registrations: binding.registrations, authorityCoverage: schemaAuthorityCoverage(root, binding)};
}
export function checkSchemaFieldInventory(root) {
  const inventory = schemaFieldInventory(root);
  const content = JSON.stringify(inventory, null, 2) + '\n';
  if (fs.readFileSync(path.join(root, outputPath), 'utf8') !== content) throw new Error(`SCHEMA_FIELD_OUTPUT_DRIFT:${outputPath}`);
  const page = fs.readFileSync(path.join(root, 'docs/site/reference/schemas.md'), 'utf8');
  if (renderSchemaAuthorityReference(root, inventory, page) !== page) throw new Error('SCHEMA_AUTHORITY_REFERENCE_DRIFT');
  return {schemas: inventory.schemas.length, propertyPointers: inventory.schemas.reduce((sum, item) => sum + item.properties.length, 0), runtimeValidationClaimed: false};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..');
  if (process.argv.includes('--check')) {
    const result = checkSchemaFieldInventory(root);
    console.log(JSON.stringify(result));
  }
  else {
    const inventory = schemaFieldInventory(root);
    const page = process.argv.includes('--reference')
      ? renderSchemaAuthorityReference(root, inventory, fs.readFileSync(path.join(root, 'docs/site/reference/schemas.md'), 'utf8')) : null;
    fs.writeFileSync(path.join(root, outputPath), JSON.stringify(inventory, null, 2) + '\n');
    if (page !== null) fs.writeFileSync(path.join(root, 'docs/site/reference/schemas.md'), page);
    console.log(JSON.stringify({generated: outputPath, runtimeValidationClaimed: false}));
  }
}
