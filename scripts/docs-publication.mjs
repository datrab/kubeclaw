#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'docs', 'site');
const catalogueRoot = path.join(siteRoot, 'extend', 'plugin-catalogue');
const command = process.argv[2] ?? 'check';
const errors = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() ? [target] : [];
  });
}

function rel(target) {
  return path.relative(root, target).split(path.sep).join('/');
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function remoteBase() {
  const remote = git('remote', 'get-url', 'origin');
  const ssh = remote.match(/^git@github\.com:(.+)\.git$/u);
  const https = remote.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/u);
  const repository = ssh?.[1] ?? https?.[1];
  if (!repository) throw new Error(`Unsupported origin URL: ${remote}`);
  return `https://github.com/${repository}`;
}

const extensionKeys = [
  ['stage', 'stages'],
  ['observer', 'observers'],
  ['capability adapter', 'adapters'],
  ['test provider', 'testProviders'],
  ['report adapter', 'reportAdapters'],
];
const extensionKinds = [...extensionKeys.map(([kind]) => kind), 'OpenClaw extension', 'Codex plugin'];

const inventory = readJson(path.join(root, 'docs', 'blueprint', 'generated', 'ap08-extension-inventory.json'));
const inventoryById = new Map(inventory.packages.map((item) => [item.id, item]));
const guidance = readJson(path.join(root, 'docs', 'blueprint', 'AP08-catalogue-guidance.json'));
const guidanceById = new Map(guidance.records.map((item) => [item.id, item]));
const localVerification = readJson(path.join(root, 'docs', 'blueprint', 'AP08-local-verification.json'));
const localVerificationById = new Map(localVerification.groups.flatMap((group) =>
  group.packages.map((id) => [id, { result: group.result, reason: group.reason }])));
const sourceBase = `${remoteBase()}/blob/${guidance.evidenceRevision}`;

const pluginFiles = [
  ...walk(path.join(root, 'skills'))
    .filter((target) => ['plugin.json', 'openclaw.plugin.json'].includes(path.basename(target))),
  ...walk(path.join(root, 'plugins'))
    .filter((target) => path.basename(target) === 'plugin.json'
      && path.basename(path.dirname(target)) === '.codex-plugin'),
].sort();

const plugins = pluginFiles.map((file) => {
  const sourceManifest = readJson(file);
  const codex = path.basename(path.dirname(file)) === '.codex-plugin';
  const directory = codex ? path.dirname(path.dirname(file)) : path.dirname(file);
  const packageFile = path.join(directory, 'package.json');
  const packageValue = fs.existsSync(packageFile) ? readJson(packageFile) : {};
  const pipeline = path.basename(file) === 'plugin.json' && !codex;
  const openclaw = path.basename(file) === 'openclaw.plugin.json';
  const manifest = pipeline ? sourceManifest : openclaw ? {
    ...sourceManifest,
    apiVersion: 'openclaw-plugin',
    packageVersion: sourceManifest.version,
  } : {
    ...sourceManifest,
    id: sourceManifest.name,
    apiVersion: 'codex-plugin',
    packageVersion: sourceManifest.version,
  };
  const registrations = pipeline
    ? extensionKeys.flatMap(([kind, key]) =>
      (manifest[key] ?? []).map((registration) => ({ ...registration, kind })))
    : openclaw ? (packageValue.openclaw?.extensions ?? []).map((module, index) => ({
      kind: 'OpenClaw extension',
      id: index === 0 ? manifest.id : `${manifest.id}-${index + 1}`,
      module,
      requiredCapabilities: [],
      configSchemaObject: manifest.configSchema,
    })) : [{
      kind: 'Codex plugin',
      id: manifest.id,
      module: manifest.skills,
      requiredCapabilities: manifest.interface?.capabilities ?? [],
    }];
  const mechanical = inventoryById.get(manifest.id);
  const tests = mechanical?.testFiles?.map((target) => path.join(root, target))
    ?? walk(directory).filter((target) => /(?:^|\/)(?:tests?|__tests__)(?:\/|$)/u.test(target));
  const guide = mechanical?.authoredGuide ? path.join(root, mechanical.authoredGuide) : path.join(directory, 'README.md');
  return { manifest, file, directory, registrations, packageValue, tests, guide, pipeline, openclaw, codex, mechanical };
});

function list(values) {
  return values?.length ? values.map((value) => `\`${value}\``).join(', ') : 'None.';
}

function registrationName(registration) {
  return registration.type ?? registration.contractId ?? registration.id;
}

function manifestValue(value) {
  if (value === undefined) return 'Not declared.';
  if (Array.isArray(value) && value.length === 0) return 'Empty list.';
  if (typeof value === 'string') return `\`${value}\``;
  return `\`${JSON.stringify(value)}\``;
}

function sourceLink(label, target) {
  return `[${label}](${sourceBase}/${rel(target)})`;
}

function schemaFacts(directory, schemaPath, inlineSchema, manifestFile) {
  if (!schemaPath && !inlineSchema) return { link: 'None.', fields: 'Not applicable.' };
  const target = schemaPath ? path.join(directory, schemaPath) : manifestFile;
  if (!fs.existsSync(target)) return { link: `Missing path: \`${schemaPath}\`.`, fields: 'Unavailable.' };
  const schema = inlineSchema ?? readJson(target);
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {}).map(([name, value]) => {
    const type = Array.isArray(value.type) ? value.type.join(' or ') : value.type ?? (value.const !== undefined ? 'constant' : value.enum ? 'enumeration' : value.$ref ? 'referenced schema' : 'schema-defined');
    const flags = [required.has(name) ? 'required' : 'optional'];
    if (Object.hasOwn(value, 'default')) flags.push(`default \`${JSON.stringify(value.default)}\``);
    if (value.writeOnly) flags.push('sensitive write-only value');
    if (value.enum) flags.push(`allowed ${manifestValue(value.enum)}`);
    if (Object.hasOwn(value, 'const')) flags.push(`value ${manifestValue(value.const)}`);
    for (const bound of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern']) {
      if (Object.hasOwn(value, bound)) flags.push(`${bound} ${manifestValue(value[bound])}`);
    }
    if (value.$ref) flags.push(`reference ${manifestValue(value.$ref)}`);
    return `\`${name}\` (${type}; ${flags.join('; ')})`;
  });
  return {
    link: sourceLink(schemaPath ?? 'Inline host schema in the manifest', target),
    fields: fields.length ? fields.map((field) => `- ${field}`).join('\n') : 'The schema declares no top-level fields.',
  };
}

function pluginPage(plugin) {
  const { manifest, file, directory, registrations, packageValue, tests, guide, pipeline, openclaw, codex, mechanical } = plugin;
  const authored = guidanceById.get(manifest.id);
  const localResult = localVerificationById.get(manifest.id);
  const sourceRoot = rel(directory);
  const verification = packageValue.scripts?.test
    ? `npm test --prefix ${sourceRoot}`
    : tests.length === 1 ? `node --test ${rel(tests[0])}` : 'No package-local automated command is declared.';
  const roles = mechanical?.includedRoles?.length ? mechanical.includedRoles.map((role) => `\`${role}\``).join(', ') : 'No runtime role.';
  const host = mechanical?.host ?? (pipeline ? 'pipeline-runtime' : openclaw ? 'openclaw' : 'codex');
  const lines = [
    `# ${manifest.id}`,
    '',
    'Status: implemented',
    'Audience: plugin author, operator, maintainer',
    'Owner: plugin-foundation',
    `Evidence: ${rel(file)}; ${rel(guide)}`,
    `Applies to: ${manifest.apiVersion}; package ${manifest.packageVersion}`,
    `Last verified: see the separate verification record; source evidence revision ${guidance.evidenceRevision}`,
    '',
    '## Authored Guidance',
    '',
    authored?.purpose ?? 'Authored guidance is missing.',
    '',
    '## When To Use It',
    '',
    authored?.useWhen ?? 'Authored use guidance is missing.',
    '',
    '## When Not To Use It',
    '',
    authored?.avoidWhen ?? 'Authored exclusion guidance is missing.',
    '',
    '## Most Important Limit',
    '',
    authored?.criticalLimit ?? 'Authored limit guidance is missing.',
    '',
    'The package guide explains package-specific behavior. The shared guides explain',
    'the contract and lifecycle rules that apply to this package.',
    '',
    `- ${sourceLink('Package guide', guide)}`,
    '- [Shared extension contracts](../contracts.md)',
    '- [Proof and failure exercises](../testing.md#use-a-proof-ladder)',
    '- [Install and activate](../testing.md#install-and-activate-by-surface)',
    '- [Update or replace](../testing.md#update-or-replace)',
    '- [Disable safely](../testing.md#disable-safely)',
    '- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)',
    '- [Host and engine boundaries](../host-and-engine.md)',
    '',
    '## Generated Package Facts',
    '',
    `- Host: \`${host}\`.`,
    `- Package identity: \`${manifest.id}@${manifest.packageVersion}\`.`,
    `- Runtime-role manifest inclusion: ${roles}`,
    ...(authored?.deploymentNote ? [`- Additional packaging path: ${authored.deploymentNote}`] : []),
    `- Manifest: ${sourceLink(rel(file), file)}`,
    '',
    '## Boundaries',
    '',
    ...(pipeline ? [
      '- The manifest declares extension identity and requested authority.',
      '- Nova and Buster apply the selection rules for each declared surface.',
      '- Platform grants or resolved plans supply authority separately from package code.',
      '- Pipeline Core keeps canonical lifecycle authority.',
      '- The package cannot use undeclared capabilities.',
    ] : openclaw ? [
      '- OpenClaw owns hook or tool registration and plugin activation.',
      '- The host validates the package configuration before activation.',
      '- The plugin does not own pipeline scheduling or lifecycle state.',
    ] : [
      '- Codex owns plugin and skill discovery.',
      '- The manifest supplies guidance and declares its interface capability.',
      '- External tool connections remain separate from this package.',
    ]),
    '',
    '## Registration Summary',
    '',
    '| Kind | ID | Public contract or type | Module | Export |',
    '| --- | --- | --- | --- | --- |',
    ...registrations.map((item) => `| ${item.kind} | \`${item.id}\` | \`${registrationName(item)}\` | \`${item.module}\` | ${item.export ? `\`${item.export}\`` : 'Runtime registration'} |`),
  ];
  for (const registration of registrations) {
    lines.push(
      '',
      `## ${registration.kind}: ${registration.id}`,
      '',
      `Public identifier: \`${registrationName(registration)}\`.`,
      ...(pipeline ? [`Global registration ID: \`${manifest.id}:${registration.id}\`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.`] : []),
      '',
      `${codex ? 'Codex interface capabilities' : 'Required capabilities'}: ${list(registration.requiredCapabilities)}`,
      '',
      `Provided capabilities: ${list(registration.providesCapabilities)}`,
      '',
      `Configuration schema: ${schemaFacts(directory, registration.configSchema, registration.configSchemaObject, file).link}`,
      '',
      'Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):',
      '',
      schemaFacts(directory, registration.configSchema, registration.configSchemaObject, file).fields,
      '',
      `Input schema: ${registration.inputSchema ? schemaFacts(directory, registration.inputSchema, undefined, file).link : pipeline ? 'No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).' : openclaw ? 'Hook or tool input belongs to the host and module; absence of a manifest field does not mean unrestricted input.' : 'Natural-language skill trigger; no JSON input schema.'}`,
      '',
      `Result schema: ${registration.resultSchema ? schemaFacts(directory, registration.resultSchema, undefined, file).link : pipeline ? 'No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).' : 'The host owns the response contract.'}`,
      ...(registration.checkpointSchema ? ['', `Checkpoint schema: ${schemaFacts(directory, registration.checkpointSchema, undefined, file).link}`] : []),
      '',
      'Declared manifest facts:',
      '',
      '| Field | Exact declared value |',
      '| --- | --- |',
      ...Object.entries(registration)
        .filter(([key]) => !['kind', 'configSchemaObject'].includes(key))
        .map(([key, value]) => `| \`${key}\` | ${manifestValue(value)} |`),
    );
    if (registration.inputs?.length) {
      lines.push('', 'Inputs:', '', ...registration.inputs.map((item) => `- \`${item.name}\`: ${item.kind}; ${item.required ? 'required' : 'optional'}.`));
    }
    if (registration.outputs?.length) {
      lines.push('', 'Outputs:', '', ...registration.outputs.map((item) => `- \`${item.name}\`: ${item.kind}; ${item.required ? 'required' : 'optional'}.`));
    }
  }
  lines.push(
    '',
    '## Failure Behavior',
    '',
    ...(authored?.operationNote ? [authored.operationNote, ''] : []),
    ...(pipeline ? [
      'Registry validation checks declared paths, schemas, and capability names.',
      'Activation or the Buster loader checks executable exports; discovery does not import package code.',
      'The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.',
      'Nova or Buster records a bounded failure without giving the package lifecycle authority.',
    ] : openclaw ? [
      'OpenClaw rejects invalid host configuration or an unavailable extension module.',
      'External dependency failure appears in the extension result or bounded diagnostics.',
    ] : [
      'An absent plugin prevents skill discovery. Missing external tools prevent the diagnostic workflow, not discovery.',
      'The current package has no package-local automated acceptance test.',
    ]),
    '',
    '## Verification Record',
    '',
    `Audit status: \`${mechanical?.auditStatus ?? 'pending'}\`.`,
    `Earlier AP08.7–AP08.9 local command result on ${localVerification.date}: \`${localResult?.result ?? 'not-run'}\`.`,
    '',
    localResult?.reason ?? 'No local verification result exists.',
    '',
    'Run the package command:',
    '',
    ...(verification.startsWith('No ') ? [verification] : ['```bash', verification, '```']),
    '',
    `Package test files found: ${tests.length}. This is file discovery, not an executed test count.`,
    ...(packageValue.scripts?.test ? ['', 'Exact package test script (run from the package directory):', '', '```text', packageValue.scripts.test, '```'] : []),
    '',
    'The audit status does not claim live host or cluster acceptance. See the AP08',
    '[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.',
    '',
    '## Source Evidence',
    '',
    `- Manifest: ${sourceLink(rel(file), file)}`,
    `- Authored package guide: ${sourceLink(rel(guide), guide)}`,
    ...registrations.filter((item) => item.module).map((item) => `- Module for \`${item.id}\`: ${sourceLink(item.module, path.join(directory, item.module))}`),
    ...tests.map((target) => `- Test: ${sourceLink(rel(target), target)}`),
    '',
    'Generated facts come from the manifest, package metadata, runtime-role inventory,',
    'schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,',
    'use, exclusion, and limit text. Publication can refresh facts without inventing or',
    'silently replacing those explanations.',
  );
  return `${lines.join('\n')}\n`;
}

function catalogueIndex() {
  const groups = new Map(extensionKinds.map((kind) => [kind, []]));
  for (const plugin of plugins) {
    for (const kind of new Set(plugin.registrations.map((item) => item.kind))) groups.get(kind).push(plugin);
  }
  const lines = [
    '# Plugin Catalogue', '',
    'Status: implemented',
    'Audience: plugin author, operator, maintainer',
    'Owner: plugin-foundation',
    'Evidence: scripts/docs-publication.mjs',
    'Applies to: pipeline-plugin-v2, OpenClaw extensions, Codex plugins',
    'Last verified: generated during publication', '',
    '## Purpose', '',
    'Use this catalogue to find every installable extension package and its declared surfaces.', '',
    `The catalogue contains ${plugins.length} packages.`,
    '',
    'Each package page combines two separate authorities. Maintainers write the practical',
    'guidance in `docs/blueprint/AP08-catalogue-guidance.json`. The publication generator',
    'reads manifests, schemas, role inclusion, and tests for mechanical facts. A generated',
    'refresh cannot replace the authored purpose, use, exclusion, or limit with generic prose.',
  ];
  for (const [kind, entries] of groups) {
    lines.push('', `## ${kind[0].toUpperCase()}${kind.slice(1)} Packages`, '');
    if (!entries.length) lines.push('No package declares this extension surface.');
    else lines.push(...entries.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)).map((plugin) => `- [${plugin.manifest.id}](${plugin.manifest.id}.md)`));
  }
  return `${lines.join('\n')}\n`;
}

function capabilityPage() {
  const vocabulary = fs.readFileSync(path.join(root, 'skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts'), 'utf8');
  const capabilities = [...vocabulary.matchAll(/^\s{2}'([^']+)': definition\(/gmu)].map((match) => match[1]);
  const users = new Map(capabilities.map((id) => [id, []]));
  for (const plugin of plugins.filter((item) => item.pipeline)) {
    for (const registration of plugin.registrations) {
      for (const id of [...(registration.requiredCapabilities ?? []), ...(registration.providesCapabilities ?? [])]) {
        if (!users.has(id)) users.set(id, []);
        users.get(id).push(`${plugin.manifest.id}:${registration.id}`);
      }
    }
  }
  return `${[
    '# Capability Catalogue', '',
    'Status: implemented',
    'Audience: plugin author, operator, security reviewer',
    'Owner: plugin-foundation',
    'Evidence: skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts',
    'Applies to: pipeline-plugin-v2',
    'Last verified: generated during publication', '',
    '## Purpose', '',
    'This catalogue lists each grantable capability and every registration that declares it.', '',
    '| Capability | Declared by |',
    '| --- | --- |',
    ...[...users].sort(([a], [b]) => a.localeCompare(b)).map(([id, registrations]) => `| \`${id}\` | ${[...new Set(registrations)].map((item) => `\`${item}\``).join('<br>') || 'No installed registration.'} |`),
  ].join('\n')}\n`;
}

const generated = new Map([
  [path.join(catalogueRoot, 'README.md'), catalogueIndex()],
  [path.join(siteRoot, 'reference', 'capabilities.md'), capabilityPage()],
  ...plugins.map((plugin) => [path.join(catalogueRoot, `${plugin.manifest.id}.md`), pluginPage(plugin)]),
]);

function generate() {
  for (const [target, content] of generated) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function compareGenerated() {
  for (const [target, content] of generated) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) errors.push(`${rel(target)} is stale or missing`);
  }
  const expected = new Set([...generated].map(([target]) => target));
  for (const target of walk(catalogueRoot).filter((file) => file.endsWith('.md'))) {
    if (!expected.has(target)) errors.push(`${rel(target)} has no installed plugin`);
  }
}

const metadataFields = ['Status', 'Audience', 'Owner', 'Evidence', 'Applies to', 'Last verified'];
const vague = /\b(simply|obviously|appropriate|properly|normally|just|easy|easily|somehow|various)\b/iu;
const passive = /\b(?:is|are|was|were|be|been)\s+(?:performed|handled|processed|executed|validated|generated|created|written|provided|configured|managed|implemented|defined|recorded|resolved|accepted|granted)\b/iu;
const legacyTerms = /\b(?:needs_nova|action_required)\b/u;

function stripMarkdown(line) {
  return line.replace(/\[[^\]]+\]\([^)]+\)/gu, 'LINK').replace(/`[^`]+`/gu, 'TERM').replace(/^[-*]\s+/u, '');
}

function checkLanguage(file, text) {
  let inCode = false;
  const prose = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) { inCode = !inCode; continue; }
    if (inCode || !line || line.startsWith('#') || line.startsWith('|') || metadataFields.some((field) => line.startsWith(`${field}:`))) continue;
    const cleaned = stripMarkdown(line);
    if (vague.test(cleaned)) errors.push(`${rel(file)} contains vague term: ${vague.exec(cleaned)?.[0]}`);
    if (passive.test(cleaned)) errors.push(`${rel(file)} contains avoidable passive voice: ${passive.exec(cleaned)?.[0]}`);
    if (legacyTerms.test(cleaned)) errors.push(`${rel(file)} contains a removed contract term: ${legacyTerms.exec(cleaned)?.[0]}`);
    if (/^\d+[.)]\s+/u.test(line) && /\b(?:and then|then also)\b/iu.test(cleaned)) errors.push(`${rel(file)} has more than one action in a numbered step: ${line}`);
    prose.push({ line, procedural: /^\d+[.)]\s+/u.test(line) });
  }
  for (const item of prose) {
    for (const sentence of item.line.split(/(?<=[.!?])\s+/u)) {
      const words = sentence.match(/[A-Za-z0-9][A-Za-z0-9@._/-]*/gu) ?? [];
      const limit = item.procedural ? 20 : 25;
      if (words.length > limit) errors.push(`${rel(file)} has a ${words.length}-word sentence; limit is ${limit}: ${sentence.slice(0, 110)}`);
    }
  }
}

function checkSite() {
  compareGenerated();
  if (plugins.length !== 51) errors.push(`Catalogue expected 51 packages but found ${plugins.length}`);
  const pluginIds = new Set(plugins.map((plugin) => plugin.manifest.id));
  if (guidance.records.length !== 51) errors.push(`Catalogue guidance expected 51 records but found ${guidance.records.length}`);
  for (const record of guidance.records) {
    if (!pluginIds.has(record.id)) errors.push(`Catalogue guidance contains unknown package: ${record.id}`);
    for (const field of ['purpose', 'useWhen', 'avoidWhen', 'criticalLimit']) {
      if (typeof record[field] !== 'string' || record[field].length < 24) errors.push(`Catalogue guidance ${record.id} has no useful ${field}`);
    }
  }
  for (const plugin of plugins) if (!guidanceById.has(plugin.manifest.id)) errors.push(`Catalogue guidance is missing ${plugin.manifest.id}`);
  if (localVerificationById.size !== 51) errors.push(`Local verification expected 51 results but found ${localVerificationById.size}`);
  for (const plugin of plugins) if (!localVerificationById.has(plugin.manifest.id)) errors.push(`Local verification is missing ${plugin.manifest.id}`);
  const pages = walk(siteRoot).filter((file) => file.endsWith('.md')).sort();
  for (const file of pages) {
    const text = fs.readFileSync(file, 'utf8');
    for (const field of metadataFields) if (!new RegExp(`^${field}: .+`, 'mu').test(text)) errors.push(`${rel(file)} has no ${field} metadata`);
    const evidence = text.match(/^Evidence: (.+)$/mu)?.[1];
    for (const item of evidence?.split(';').map((value) => value.trim()) ?? []) {
      if (!fs.existsSync(path.join(root, item))) errors.push(`${rel(file)} cites missing evidence: ${item}`);
    }
    checkLanguage(file, text);
    for (const match of text.replace(/`[^`\n]*`/gu, 'code').matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const target = match[1];
      if (target.startsWith('http') || target.startsWith('#')) continue;
      const local = path.resolve(path.dirname(file), target.split('#')[0]);
      if (!fs.existsSync(local)) errors.push(`${rel(file)} links to missing page: ${target}`);
    }
  }
  for (const plugin of plugins) if (!fs.existsSync(plugin.guide)) errors.push(`${rel(plugin.directory)} has no detected authored guide`);
  const requiredPages = [
    'docs/site/README.md',
    'docs/site/understand/README.md',
    'docs/site/understand/request-to-result.md',
    'docs/site/use/README.md',
    'docs/site/use/quickstart.md',
    'docs/site/use/recovery.md',
    'docs/site/extend/README.md',
    'docs/site/extend/first-plugin.md',
    'docs/site/extend/testing.md',
    'docs/site/status/current.md',
  ];
  for (const page of requiredPages) if (!fs.existsSync(path.join(root, page))) errors.push(`${page} is required by a reader journey`);
  const taskSections = ['## Objective', '## Prerequisites', '## Procedure', '## Expected Result', '## Verification', '## Common Failures', '## Recovery'];
  for (const relative of ['docs/site/use/quickstart.md', 'docs/site/use/recovery.md', 'docs/site/extend/first-plugin.md']) {
    if (!fs.existsSync(path.join(root, relative))) continue;
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const section of taskSections) if (!text.includes(section)) errors.push(`${relative} lacks journey section ${section}`);
    if (!/```(?:bash|json)\n[\s\S]+?\n```/u.test(text)) errors.push(`${relative} has no executable or schema-valid example`);
    const packageScripts = readJson(path.join(root, 'package.json')).scripts ?? {};
    for (const block of text.matchAll(/```bash\n([\s\S]+?)\n```/gu)) {
      for (const match of block[1].matchAll(/^npm run ([a-z0-9:_-]+)/gmu)) {
        if (!packageScripts[match[1]]) errors.push(`${relative} cites unknown package command: npm run ${match[1]}`);
      }
    }
  }
  const schema = readJson(path.join(root, 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(schema);
  const validateManifest = ajv.compile({ $ref: `${schema.$id}#/$defs/pluginManifest` });
  const tutorial = fs.readFileSync(path.join(root, 'docs/site/extend/first-plugin.md'), 'utf8');
  for (const [index, block] of [...tutorial.matchAll(/```json\n([\s\S]+?)\n```/gu)].entries()) {
    try {
      const value = JSON.parse(block[1]);
      if (!validateManifest(value)) errors.push(`first-plugin JSON block ${index + 1} fails the canonical schema: ${ajv.errorsText(validateManifest.errors)}`);
    } catch (error) {
      errors.push(`first-plugin JSON block ${index + 1} is invalid JSON: ${error.message}`);
    }
  }
  if (pages.some((file) => /(?:phase|audit|implementation-plan|roadmap)/u.test(path.basename(file)))) errors.push('Published site contains an internal planning page');
  if (plugins.length !== walk(catalogueRoot).filter((file) => file.endsWith('.md') && path.basename(file) !== 'README.md').length) errors.push('Plugin catalogue coverage is incomplete');
  return pages;
}

function build() {
  const pages = checkSite();
  if (errors.length) return;
  const revision = git('rev-parse', 'HEAD');
  const base = `${remoteBase()}/blob/${revision}`;
  const outputRoot = path.join(root, '.tmp', 'docs-publication');
  fs.rmSync(outputRoot, { recursive: true, force: true });
  for (const file of pages) {
    const relative = path.relative(siteRoot, file);
    const target = path.join(outputRoot, relative);
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/^Evidence: (.+)$/gmu, (_all, evidence) => {
      if (evidence.includes('**')) return `Evidence: ${evidence}`;
      const links = evidence.split(';').map((item) => item.trim()).map((item) => item.includes(' every ') || item.startsWith('every ')
        ? item
        : `[${item}](${base}/${item})`);
      return `Evidence: ${links.join('; ')}`;
    });
    text = text.replace(/^Last verified: generated during publication$/mu, `Last verified: ${revision}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  const report = {
    schemaVersion: 'kubeclaw-docs-publication.v1',
    revision,
    pageCount: pages.length,
    pluginCount: plugins.length,
    pageDigest: crypto.createHash('sha256').update(pages.map((file) => fs.readFileSync(file)).join('')).digest('hex'),
    checks: ['metadata', 'controlled-language', 'links', 'reader-journeys', 'plugin-coverage', 'release-pinned-evidence'],
  };
  fs.writeFileSync(path.join(outputRoot, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`built ${pages.length} publication pages for ${revision}`);
}

if (command === 'generate') generate();
else if (command === 'check') checkSite();
else if (command === 'build') build();
else errors.push(`Unknown command: ${command}`);

if (errors.length) {
  console.error('documentation publication failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
if (command === 'check') console.log(`documentation publication passed (${walk(siteRoot).filter((file) => file.endsWith('.md')).length} pages, ${plugins.length} plugins)`);
